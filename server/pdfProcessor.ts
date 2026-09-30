import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {
  saveDocument,
  updateDocumentProgress,
  findDocumentByHash,
  getDocumentById,
  insertVotersBatch,
  DbDocument,
  DbVoter,
  db
} from './db.ts';
import { extractDocumentHeader, parseVoterRecordsFromPage, DocumentHeaderInfo } from './voterParser.ts';
import { createWorker } from 'tesseract.js';
import { createCanvas } from '@napi-rs/canvas';
import { syncDatabase } from './db.ts';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// In-memory queue & worker management for batch jobs
export interface ProcessingJob {
  documentId: string;
  isPaused: boolean;
  isCancelled: boolean;
  progressPercent: number;
}

const activeJobs = new Map<string, ProcessingJob>();

const OCR_RENDER_SCALE = Math.max(
  1,
  Math.min(2.5, Number(process.env.OCR_RENDER_SCALE || 1.5))
);

async function renderPdfPageToPng(page: any): Promise<Buffer> {
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');

  try {
    await page.render({
      canvasContext: context as any,
      viewport,
      canvasFactory: {
        create: () => ({ canvas, context }),
        reset: () => {},
        destroy: () => {}
      }
    }).promise;

    return canvas.toBuffer('image/png');
  } finally {
    // Release references promptly; only one rendered page is kept in memory.
    canvas.width = 1;
    canvas.height = 1;
  }
}

async function recognizeScannedPage(
  page: any,
  worker: any
): Promise<{ text: string; confidence: number }> {
  const image = await renderPdfPageToPng(page);
  const result = await worker.recognize(image);
  const text = String(result?.data?.text || '').trim();
  const confidence = Number(result?.data?.confidence);
  return {
    text,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence / 100)) : 0
  };
}

/**
 * Calculate SHA-256 checksum of a file
 */
export function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Check if extracted text from a page is reliable or looks scanned/corrupted
 */
export function isTextScannedOrCorrupted(text: string): boolean {
  if (!text || text.trim().length < 40) return true;

  // Check for Bengali Unicode characters range: \u0980-\u09FF
  const bengaliChars = text.match(/[\u0980-\u09FF]/g) || [];
  const ratio = bengaliChars.length / text.length;

  // If text contains very few Bengali characters or is mostly garbled ASCII/symbols
  if (ratio < 0.25 && text.length > 50) return true;

  // Check for presence of voter keywords
  const hasVoterKeyword = /(?:ভোটার|নাম|পিতা|মাতা|ঠিকানা|নির্বাচন|তািলকা|নńর|িপতা)/i.test(text);
  if (!hasVoterKeyword) return true;

  return false;
}

/**
 * Process a PDF document incrementally page-by-page
 */
export async function processPdfDocument(
  documentId: string,
  onProgress?: (processedPages: number, totalPages: number, recordsFound: number) => void
): Promise<{ success: boolean; totalRecords: number; error?: string }> {
  const doc = getDocumentById(documentId);
  if (!doc) {
    return { success: false, totalRecords: 0, error: 'ডকুমেন্ট পাওয়া যায়নি' };
  }

  const job: ProcessingJob = {
    documentId,
    isPaused: false,
    isCancelled: false,
    progressPercent: 0
  };
  activeJobs.set(documentId, job);

  try {
    updateDocumentProgress(documentId, doc.processed_pages, doc.total_records, 'processing', doc.ocr_status);

    const pdfBuffer = fs.readFileSync(doc.file_path);
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();

    let processedPages = doc.processed_pages || 0;
    let totalRecords = doc.total_records || 0;
    let docHeader: DocumentHeaderInfo = {
      district: doc.district || 'যশোর',
      upazila: doc.upazila || 'যশোর সদর',
      unionName: doc.union_name || 'দেয়াড়া',
      ward: doc.ward || '৫',
      voterArea: doc.voter_area || 'তেঘরিয়া',
      voterAreaCode: doc.voter_area_code || '০৬৯২'
    };

    // Lazy OCR worker
    let tesseractWorker: any = null;
    let documentUsedOcr = false;
    let documentOcrConfidence = 1.0;

    // Load pdfjs for text extraction
    // @ts-ignore
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
    const loadedPdf = await loadingTask.promise;

    for (let pageNum = processedPages + 1; pageNum <= pageCount; pageNum++) {
      // Check pause / cancel
      if (job.isCancelled) {
        updateDocumentProgress(documentId, processedPages, totalRecords, 'failed', 'failed', 'ব্যবহারকারী বাতিল করেছেন');
        activeJobs.delete(documentId);
        return { success: false, totalRecords, error: 'বাতিল করা হয়েছে' };
      }
      while (job.isPaused) {
        await new Promise((res) => setTimeout(res, 500));
        if (job.isCancelled) break;
      }

      const page = await loadedPdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      let extractedText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ');

      let ocrUsed = false;
      let ocrConfidence = 1.0;

      // Check if text is scanned or insufficient
      const isScanned = isTextScannedOrCorrupted(extractedText);

      if (isScanned) {
        ocrUsed = true;
        try {
          if (!tesseractWorker) {
            tesseractWorker = await createWorker('ben', 1);
          }

          const ocrResult = await recognizeScannedPage(page, tesseractWorker);
          if (ocrResult.text.length >= 10) {
            extractedText = ocrResult.text;
            ocrConfidence = ocrResult.confidence;
            documentUsedOcr = true;
            documentOcrConfidence = Math.min(documentOcrConfidence, ocrConfidence);
          } else {
            ocrConfidence = 0;
          }
        } catch (ocrErr) {
          ocrConfidence = 0;
          console.warn(`OCR failed on page ${pageNum}:`, ocrErr);
        }
      }

      // Check header info from first 3 pages
      if (pageNum <= 3 && extractedText) {
        const headerFound = extractDocumentHeader(extractedText);
        docHeader = { ...docHeader, ...headerFound };
      }

      // Extract voter records
      const voters = parseVoterRecordsFromPage(
        extractedText,
        docHeader,
        documentId,
        doc.original_name,
        pageNum
      );

      if (voters.length > 0) {
        insertVotersBatch(voters);
        totalRecords += voters.length;
      }

      // Record page in DB
      db.prepare(`
        INSERT OR REPLACE INTO pages (
          id, document_id, page_number, has_selectable_text, ocr_used, ocr_confidence, raw_text, status, record_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `${documentId}_p${pageNum}`,
        documentId,
        pageNum,
        isScanned ? 0 : 1,
        ocrUsed ? 1 : 0,
        ocrConfidence,
        extractedText.slice(0, 500),
        'completed',
        voters.length
      );

      processedPages = pageNum;
      job.progressPercent = Math.round((processedPages / pageCount) * 100);

      // Save intermediate progress every 5 pages or last page
      if (processedPages % 5 === 0 || processedPages === pageCount) {
        updateDocumentProgress(
          documentId,
          processedPages,
          totalRecords,
          processedPages === pageCount ? 'completed' : 'processing',
          documentUsedOcr ? 'completed' : 'not_needed'
        );
        // Push page-level progress to Turso so a Render restart can resume
        // from the last persisted page instead of losing the whole document.
        await syncDatabase().catch((err) => {
          console.warn('Persistent progress sync failed:', err);
        });
      }

      if (onProgress) {
        onProgress(processedPages, pageCount, voters.length);
      }
    }

    if (tesseractWorker) {
      await tesseractWorker.terminate();
    }

    updateDocumentProgress(
      documentId,
      pageCount,
      totalRecords,
      'completed',
      documentUsedOcr ? 'completed' : 'not_needed'
    );
    await syncDatabase().catch((err) => {
      console.warn('Final persistent database sync failed:', err);
    });

    activeJobs.delete(documentId);
    return { success: true, totalRecords };
  } catch (error: any) {
    console.error('Error processing PDF:', error);
    // Preserve the latest persisted page/record checkpoint instead of reverting
    // to the document values captured before processing started.
    const latest = getDocumentById(documentId);
    updateDocumentProgress(
      documentId,
      latest?.processed_pages || 0,
      latest?.total_records || 0,
      'failed',
      'failed',
      error.message
    );
    await syncDatabase().catch((syncErr) => {
      console.warn('Persistent failure-state sync failed:', syncErr);
    });
    activeJobs.delete(documentId);
    return {
      success: false,
      totalRecords: latest?.total_records || 0,
      error: error.message
    };
  }
}

/**
 * Pause processing of a document
 */
export function pauseProcessing(documentId: string): boolean {
  const job = activeJobs.get(documentId);
  if (job) {
    job.isPaused = true;
    updateDocumentProgress(documentId, 0, 0, 'paused', 'in_progress');
    return true;
  }
  return false;
}

/**
 * Resume processing of a document
 */
export function resumeProcessing(documentId: string): boolean {
  const job = activeJobs.get(documentId);
  if (job && job.isPaused) {
    job.isPaused = false;
    return true;
  }
  // Start job if not running
  processPdfDocument(documentId);
  return true;
}

/**
 * Get active job status
 */
export function getJobStatus(documentId: string) {
  return activeJobs.get(documentId) || null;
}
