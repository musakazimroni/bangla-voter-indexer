import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  initDatabase,
  getAllDocuments,
  getDocumentById,
  findDocumentByHash,
  saveDocument,
  deleteDocument,
  getIndexStats,
  db,
  DbDocument,
  DbVoter
} from './server/db.ts';
import { searchVoters, getRelatedFamilyRecords, SearchParams } from './server/searchEngine.ts';
import {
  processPdfDocument,
  calculateFileHash,
  pauseProcessing,
  resumeProcessing,
  getJobStatus
} from './server/pdfProcessor.ts';
import { seedSampleVoterData } from './server/sampleData.ts';
import {
  getDriveSyncStatus,
  syncGoogleDriveFolders,
  streamDriveFile
} from './server/googleDriveSync.ts';

const PORT = 3000;
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Decode UTF-8 filename if needed
    const originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const safeExt = path.extname(originalname) || '.pdf';
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    cb(null, `${path.basename(originalname, safeExt)}_${uniqueSuffix}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max per PDF
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('শুধুমাত্র PDF ফাইল আপলোড করা যাবে।'));
    }
  }
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Initialize DB and sample attached data
  initDatabase();
  await seedSampleVoterData().catch(console.error);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Index Dashboard Statistics
  app.get('/api/stats', (req, res) => {
    try {
      const stats = getIndexStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Google Drive indexing status
  app.get('/api/drive/status', (req, res) => {
    res.json(getDriveSyncStatus());
  });

  // Manually start an incremental sync of the two public Google Drive folders.
  app.post('/api/drive/sync', async (req, res) => {
    try {
      const result = await syncGoogleDriveFolders();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Document Library
  app.get('/api/documents', (req, res) => {
    try {
      const docs = getAllDocuments();

      // Convert SQLite snake_case fields to the camelCase shape expected by the React UI.
      // Without this mapping, fields such as fileHash and totalRecords are undefined
      // in DocumentLibrary and can crash the React render.
      const documents = docs.map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        originalName: doc.original_name,
        filePath: doc.file_path,
        fileHash: doc.file_hash,
        fileSize: Number(doc.file_size || 0),
        pageCount: Number(doc.page_count || 0),
        processedPages: Number(doc.processed_pages || 0),
        status: doc.status,
        ocrStatus: doc.ocr_status,
        totalRecords: Number(doc.total_records || 0),
        district: doc.district || '',
        upazila: doc.upazila || '',
        unionName: doc.union_name || '',
        ward: doc.ward || '',
        voterArea: doc.voter_area || '',
        voterAreaCode: doc.voter_area_code || '',
        errorMessage: doc.error_message || '',
        createdAt: doc.created_at,
        updatedAt: doc.updated_at
      }));

      res.json(documents);
    } catch (err: any) {
      console.error('Document Library API error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Upload single or multiple PDFs
  app.post('/api/documents/upload', upload.array('files', 50), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'কোনো PDF ফাইল নির্বাচন করা হয়নি।' });
      }

      const uploadResults: {
        file: string;
        documentId?: string;
        isDuplicate?: boolean;
        message?: string;
      }[] = [];

      for (const file of files) {
        const decodedOriginalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const fileHash = await calculateFileHash(file.path);

        // Duplicate Check
        const existingDoc = findDocumentByHash(fileHash);
        if (existingDoc) {
          // Remove duplicate from uploads disk
          try {
            fs.unlinkSync(file.path);
          } catch {}

          uploadResults.push({
            file: decodedOriginalName,
            documentId: existingDoc.id,
            isDuplicate: true,
            message: 'এই PDF ফাইলটি আগে থেকেই ইনডেক্স করা আছে।'
          });
          continue;
        }

        const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const newDoc: DbDocument = {
          id: docId,
          filename: file.filename,
          original_name: decodedOriginalName,
          file_path: file.path,
          file_hash: fileHash,
          file_size: file.size,
          page_count: 0,
          processed_pages: 0,
          status: 'pending',
          ocr_status: 'in_progress',
          total_records: 0,
          district: '',
          upazila: '',
          union_name: '',
          ward: '',
          voter_area: '',
          voter_area_code: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        saveDocument(newDoc);

        // Start indexing asynchronously in the background
        processPdfDocument(docId).catch((err) => {
          console.error(`Background indexing error on ${docId}:`, err);
        });

        uploadResults.push({
          file: decodedOriginalName,
          documentId: docId,
          isDuplicate: false,
          message: 'সফলভাবে আপলোড হয়েছে এবং ইনডেক্সিং শুরু হয়েছে।'
        });
      }

      res.json({ results: uploadResults });
    } catch (err: any) {
      console.error('Upload handler error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Re-index Document
  app.post('/api/documents/:id/reindex', async (req, res) => {
    try {
      const { id } = req.params;
      const doc = getDocumentById(id);
      if (!doc) return res.status(404).json({ error: 'ডকুমেন্ট পাওয়া যায়নি।' });

      // Clean existing records for this doc
      db.prepare('DELETE FROM voters WHERE document_id = ?').run(id);
      db.prepare('DELETE FROM voters_fts WHERE voter_id LIKE ?').run(`${id}%`);
      db.prepare('DELETE FROM pages WHERE document_id = ?').run(id);

      // Start processing in background
      processPdfDocument(id).catch(console.error);

      res.json({ success: true, message: 'পুনরায় ইনডেক্সিং শুরু হয়েছে।' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pause Document Processing
  app.post('/api/documents/:id/pause', (req, res) => {
    const { id } = req.params;
    const ok = pauseProcessing(id);
    res.json({ success: ok });
  });

  // Resume Document Processing
  app.post('/api/documents/:id/resume', (req, res) => {
    const { id } = req.params;
    const ok = resumeProcessing(id);
    res.json({ success: ok });
  });

  // Delete Document
  app.delete('/api/documents/:id', (req, res) => {
    try {
      const { id } = req.params;
      const deleted = deleteDocument(id);
      if (!deleted) return res.status(404).json({ error: 'ডকুমেন্ট পাওয়া যায়নি।' });
      res.json({ success: true, message: 'ডকুমেন্ট ও সংশ্লিষ্ট সকল ভোটার রেকর্ড মুছে ফেলা হয়েছে।' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Serve original PDF. Drive-indexed files are streamed from Google Drive
  // when their temporary local copy has already been removed.
  app.get('/api/documents/:id/pdf', async (req, res) => {
    try {
      const { id } = req.params;
      const doc = getDocumentById(id);
      if (!doc) return res.status(404).json({ error: 'PDF ফাইল পাওয়া যায়নি।' });

      if (!fs.existsSync(doc.file_path)) {
        const { getDriveSourceByDocumentId } = await import('./server/db.ts');
        const source = getDriveSourceByDocumentId(id);
        if (!source) return res.status(404).json({ error: 'PDF ফাইলের উৎস পাওয়া যায়নি।' });
        await streamDriveFile(source.drive_file_id, source.resource_key, res);
        return;
      }

      const stat = fs.statSync(doc.file_path);
      const total = stat.size;

      if (req.headers.range) {
        const range = req.headers.range;
        const parts = range.replace(/bytes=/, '').split('-');
        const startByte = parseInt(parts[0], 10);
        const endByte = parts[1] ? parseInt(parts[1], 10) : total - 1;
        const chunksize = endByte - startByte + 1;
        const file = fs.createReadStream(doc.file_path, { start: startByte, end: endByte });

        res.writeHead(206, {
          'Content-Range': `bytes ${startByte}-${endByte}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${encodeURIComponent(doc.original_name)}"`
        });
        file.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': total,
          'Content-Type': 'application/pdf',
          'Accept-Ranges': 'bytes',
          'Content-Disposition': `inline; filename="${encodeURIComponent(doc.original_name)}"`
        });
        fs.createReadStream(doc.file_path).pipe(res);
      }
    } catch (err: any) {
      console.error('PDF streaming error:', err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  // Search Voters
  app.get('/api/search', (req, res) => {
    try {
      const params: SearchParams = {
        name: req.query.name as string,
        fatherName: req.query.fatherName as string,
        motherName: req.query.motherName as string,
        dateOfBirth: req.query.dateOfBirth as string,
        voterNumber: req.query.voterNumber as string,
        query: req.query.query as string,
        upazila: req.query.upazila as string,
        union: (req.query.union || req.query.unionName) as string,
        village: (req.query.village || req.query.voterArea) as string,
        searchMode: (req.query.searchMode as 'exact' | 'partial' | 'fuzzy') || 'partial',
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
        documentId: req.query.documentId as string
      };

      const results = searchVoters(params);
      res.json(results);
    } catch (err: any) {
      console.error('Search API error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Related Family Records (same father and mother)
  app.get('/api/related-family', (req, res) => {
    try {
      const fatherName = req.query.fatherName as string;
      const motherName = req.query.motherName as string;
      const excludeId = req.query.excludeId as string;

      if (!fatherName || !motherName) {
        return res.status(400).json({ error: 'পিতা ও মাতার নাম আবশ্যক।' });
      }

      const related = getRelatedFamilyRecords(fatherName, motherName, excludeId);
      res.json({ results: related, count: related.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Export Search Results to CSV
  app.get('/api/export/csv', (req, res) => {
    try {
      const params: SearchParams = {
        name: req.query.name as string,
        fatherName: req.query.fatherName as string,
        motherName: req.query.motherName as string,
        dateOfBirth: req.query.dateOfBirth as string,
        voterNumber: req.query.voterNumber as string,
        query: req.query.query as string,
        upazila: req.query.upazila as string,
        union: (req.query.union || req.query.unionName) as string,
        village: (req.query.village || req.query.voterArea) as string,
        searchMode: (req.query.searchMode as 'exact' | 'partial' | 'fuzzy') || 'partial',
        page: 1,
        limit: 10000 // Export up to 10k records at once
      };

      const { results } = searchVoters(params);

      // CSV Header in Bengali as requested:
      // নাম, ভোটার নং, পিতার নাম, মাতার নাম, জন্মতারিখ, ঠিকানা, ফাইলের নাম, পৃষ্ঠা, OCR Confidence
      const headers = ['নাম', 'ভোটার নং', 'পিতার নাম', 'মাতার নাম', 'জন্মতারিখ', 'ঠিকানা', 'ফাইলের নাম', 'পৃষ্ঠা', 'OCR Confidence'];
      
      const csvRows = [headers.join(',')];

      for (const r of results) {
        const row = [
          `"${(r.name || '').replace(/"/g, '""')}"`,
          `"${(r.voterNumber || '').replace(/"/g, '""')}"`,
          `"${(r.fatherName || '').replace(/"/g, '""')}"`,
          `"${(r.motherName || '').replace(/"/g, '""')}"`,
          `"${(r.dateOfBirth || '').replace(/"/g, '""')}"`,
          `"${(r.address || '').replace(/"/g, '""')}"`,
          `"${(r.pdfFileName || '').replace(/"/g, '""')}"`,
          `"${r.pageNumber}"`,
          `"${Math.round(r.ocrConfidence * 100)}%"`
        ];
        csvRows.push(row.join(','));
      }

      const csvContent = '\uFEFF' + csvRows.join('\r\n'); // Add UTF-8 BOM for Excel Bengali rendering
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="voter_search_results.csv"');
      res.send(csvContent);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Export Search Results to JSON
  app.get('/api/export/json', (req, res) => {
    try {
      const params: SearchParams = {
        name: req.query.name as string,
        fatherName: req.query.fatherName as string,
        motherName: req.query.motherName as string,
        dateOfBirth: req.query.dateOfBirth as string,
        voterNumber: req.query.voterNumber as string,
        query: req.query.query as string,
        searchMode: (req.query.searchMode as 'exact' | 'partial' | 'fuzzy') || 'partial',
        page: 1,
        limit: 10000
      };

      const { results, total } = searchVoters(params);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="voter_search_results.json"');
      res.json({ total, exportDate: new Date().toISOString(), results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Trigger Re-seeding of sample documents
  app.post('/api/seed-samples', async (req, res) => {
    try {
      await seedSampleVoterData();
      res.json({ success: true, message: 'নমুনা ভোটার তালিকা ডাটাবেজে ইনডেক্স করা হয়েছে।' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite Middleware for dev & static serving for prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);

    if (process.env.GOOGLE_DRIVE_API_KEY) {
      setTimeout(() => {
        syncGoogleDriveFolders().catch((err) => {
          console.error('Initial Google Drive sync failed:', err);
        });
      }, 5000);

      setInterval(() => {
        syncGoogleDriveFolders().catch((err) => {
          console.error('Scheduled Google Drive sync failed:', err);
        });
      }, 6 * 60 * 60 * 1000);
    }
  });
}

startServer();
