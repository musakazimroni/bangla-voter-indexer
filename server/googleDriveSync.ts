import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import {
  db,
  getDocumentById,
  findDocumentByHash,
  saveDocument,
  deleteDocument,
  upsertDriveSource,
  getDriveSourceByFileId,
  getDriveSyncStats,
  syncDatabase
} from './db.ts';
import { processPdfDocument, calculateFileHash } from './pdfProcessor.ts';

const MALE_FOLDER_ID = process.env.GOOGLE_DRIVE_MALE_FOLDER_ID || '1dDynAaNbKCkHj3HZHElLHpH_3Yuhz0Fn';
const FEMALE_FOLDER_ID = process.env.GOOGLE_DRIVE_FEMALE_FOLDER_ID || '1r4kRB7zk9OSO7Vv4HW0ul2pg1umgj7U8';
const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY || '';
const UPLOADS_DIR = path.join(process.env.DRIVE_TEMP_DIR || '/tmp/bangla-voter-indexer', 'drive-pdfs');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function logDriveMemory(label: string) {
  const m = process.memoryUsage();
  console.log(
    `[MEMORY] Drive ${label} | RSS=${(m.rss / 1024 / 1024).toFixed(2)} MB | HeapUsed=${(m.heapUsed / 1024 / 1024).toFixed(2)} MB | External=${(m.external / 1024 / 1024).toFixed(2)} MB | ArrayBuffers=${(m.arrayBuffers / 1024 / 1024).toFixed(2)} MB`
  );
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  md5Checksum?: string;
  resourceKey?: string;
  webViewLink?: string;
}

export function isDriveSyncConfigured() {
  return Boolean(GOOGLE_DRIVE_API_KEY && MALE_FOLDER_ID && FEMALE_FOLDER_ID);
}

function apiUrl(endpoint: string, params: Record<string, string> = {}) {
  const url = new URL(`https://www.googleapis.com/drive/v3/${endpoint}`);
  url.searchParams.set('key', GOOGLE_DRIVE_API_KEY);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function driveJson<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = apiUrl(endpoint, params);
  console.log(`[Drive API] GET ${endpoint} ${url.searchParams.toString().replace(GOOGLE_DRIVE_API_KEY, '[redacted]')}`);
  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    console.error(`[Drive API] ${endpoint} failed: HTTP ${response.status} ${text.slice(0, 1000)}`);
    throw new Error(`Google Drive API ${response.status}: ${text.slice(0, 500)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    console.error(`[Drive API] ${endpoint} returned non-JSON response: ${text.slice(0, 1000)}`);
    throw new Error(`Google Drive API returned invalid JSON for ${endpoint}`);
  }
}

async function verifyPublicFolder(folderId: string, label: 'male' | 'female') {
  const result = await driveJson<{
    id?: string;
    name?: string;
    mimeType?: string;
    trashed?: boolean;
  }>(`files/${encodeURIComponent(folderId)}`, {
    fields: 'id,name,mimeType,trashed'
  });

  console.log(
    `[Drive sync] ${label} folder verified: id=${result.id || folderId}, name=${JSON.stringify(result.name || '')}, mimeType=${result.mimeType || 'unknown'}, trashed=${Boolean(result.trashed)}`
  );

  if (result.id !== folderId) {
    throw new Error(`Google Drive ${label} folder ID verification failed.`);
  }

  if (result.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error(`Google Drive ${label} ID is not a folder (mimeType=${result.mimeType || 'unknown'}).`);
  }

  if (result.trashed) {
    throw new Error(`Google Drive ${label} folder is in the trash.`);
  }

  return result;
}

/**
 * Streams PDF metadata page-by-page. A page is released as soon as its
 * callback completes; the full Drive library is never retained in memory.
 */
async function forEachPublicFolderPdfPage(
  folderId: string,
  onPage: (files: DriveFile[], pageNumber: number) => Promise<void>
): Promise<number> {
  let pageToken = '';
  let pageNumber = 0;
  let totalPdfFiles = 0;

  do {
    const params: Record<string, string> = {
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: '1000',
      orderBy: 'name_natural',
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum,resourceKey)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    };
    if (pageToken) params.pageToken = pageToken;

    const result = await driveJson<{ files?: DriveFile[]; nextPageToken?: string }>('files', params);
    const pageFiles = result.files || [];
    const pdfFiles = pageFiles.filter((file) =>
      file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    );

    pageNumber++;
    totalPdfFiles += pdfFiles.length;
    console.log(
      `[Drive sync] folder=${folderId} page=${pageNumber} pageFiles=${pageFiles.length}, pdfFiles=${pdfFiles.length}, nextPage=${Boolean(result.nextPageToken)}`
    );

    await onPage(pdfFiles, pageNumber);

    // Drop references before fetching the next page.
    pageFiles.length = 0;
    pdfFiles.length = 0;
    pageToken = result.nextPageToken || '';
  } while (pageToken);

  return totalPdfFiles;
}

async function downloadDriveFile(file: DriveFile, destination: string) {
  logDriveMemory(`before Drive download: ${file.name}`);
  const params: Record<string, string> = { alt: 'media' };
  if (file.resourceKey) params.resourceKey = file.resourceKey;

  const response = await fetch(apiUrl(`files/${encodeURIComponent(file.id)}`, params));
  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '');
    throw new Error(`Google Drive download ${response.status}: ${body.slice(0, 500)}`);
  }

  await new Promise<void>((resolve, reject) => {
    const stream = fs.createWriteStream(destination);
    // Convert Node fetch's WebStream into a writable Node stream.
    const nodeStream = Readable.fromWeb(response.body as any);
    nodeStream.pipe(stream);
    nodeStream.on('error', reject);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  const downloadedBytes = fs.statSync(destination).size;
  logDriveMemory(`after Drive download: ${file.name} (${(downloadedBytes / 1024 / 1024).toFixed(2)} MB)`);
}

function safeFilename(name: string, fileId: string) {
  const ext = path.extname(name).toLowerCase() || '.pdf';
  const base = path.basename(name, ext).replace(/[^a-zA-Z0-9\u0980-\u09FF._-]+/g, '_').slice(0, 120);
  return `drive_${fileId}_${base}${ext}`;
}

async function indexDriveFile(file: DriveFile, sourceType: 'male' | 'female', folderId: string) {
  const existingSource = getDriveSourceByFileId(file.id);
  const sameVersion =
    existingSource &&
    existingSource.modified_time === (file.modifiedTime || '') &&
    Number(existingSource.file_size || 0) === Number(file.size || 0);

  if (sameVersion && existingSource?.document_id && existingSource.status === 'indexed') {
    return { action: 'skipped', documentId: existingSource.document_id };
  }

  const existingDocument = existingSource?.document_id
    ? getDocumentById(existingSource.document_id)
    : undefined;

  // Only destroy the old index when Drive reports a new file version.
  // Failed/interrupted indexing of the same version must resume from the
  // persisted page checkpoint instead of starting from page 1 again.
  const versionChanged =
    Boolean(existingSource) &&
    (
      existingSource?.modified_time !== (file.modifiedTime || '') ||
      Number(existingSource?.file_size || 0) !== Number(file.size || 0)
    );

  if (versionChanged && existingSource?.document_id && existingDocument) {
    deleteDocument(existingSource.document_id);
  }

  const localPath = path.join(UPLOADS_DIR, safeFilename(file.name, file.id));
  try {
    logDriveMemory(`before download/index setup: ${file.name}`);
    await downloadDriveFile(file, localPath);
    logDriveMemory(`before SHA-256 hash: ${file.name}`);
    const fileHash = await calculateFileHash(localPath);
    logDriveMemory(`after SHA-256 hash: ${file.name}`);

    let duplicate;
    try {
      console.log(`[Drive DB] before findDocumentByHash file=${file.name} hash=${fileHash.slice(0, 12)}...`);
      duplicate = findDocumentByHash(fileHash);
      console.log(`[Drive DB] after findDocumentByHash found=${Boolean(duplicate)}`);
    } catch (error: any) {
      console.error('[Drive DB] findDocumentByHash failed:', {
        message: error?.message,
        code: error?.code,
        name: error?.name,
        stack: error?.stack
      });
      throw error;
    }

    if (duplicate) {
      try {
        console.log(`[Drive DB] before duplicate-source upsert file=${file.name}`);
        upsertDriveSource({
        drive_file_id: file.id,
        source_type: sourceType,
        folder_id: folderId,
        file_name: file.name,
        modified_time: file.modifiedTime || '',
        file_size: Number(file.size || 0),
        resource_key: file.resourceKey || '',
        document_id: duplicate.id,
        status: 'indexed',
        error_message: '',
        updated_at: new Date().toISOString()
        });
        console.log(`[Drive DB] after duplicate-source upsert file=${file.name}`);
      } catch (error: any) {
        console.error('[Drive DB] duplicate-source upsert failed:', { message: error?.message, code: error?.code, name: error?.name, stack: error?.stack });
        throw error;
      }
      fs.rmSync(localPath, { force: true });
      return { action: 'duplicate', documentId: duplicate.id };
    }

    const documentId = existingDocument && !versionChanged
      ? existingDocument.id
      : `drive_${sourceType}_${file.id}`;
    const now = new Date().toISOString();

    if (existingDocument && !versionChanged) {
      // Reuse the existing document/checkpoint and only refresh its temporary
      // local PDF path/hash. The old voters/pages remain intact so OCR resumes
      // at existingDocument.processed_pages.
      try {
        console.log(`[Drive DB] before saveDocument (resume) id=${documentId} file=${file.name}`);
        saveDocument({
        ...existingDocument,
        filename: path.basename(localPath),
        original_name: file.name,
        file_path: localPath,
        file_hash: fileHash,
        file_size: Number(file.size || fs.statSync(localPath).size),
        status: 'processing',
        ocr_status: existingDocument.ocr_status === 'completed'
          ? 'completed'
          : 'in_progress',
        error_message: '',
        updated_at: now
        });
        console.log(`[Drive DB] after saveDocument (resume) id=${documentId}`);
      } catch (error: any) {
        console.error('[Drive DB] saveDocument (resume) failed:', { message: error?.message, code: error?.code, name: error?.name, stack: error?.stack });
        throw error;
      }
    } else {
      try {
        console.log(`[Drive DB] before saveDocument (new) id=${documentId} file=${file.name}`);
        saveDocument({
        id: documentId,
        filename: path.basename(localPath),
        original_name: file.name,
        file_path: localPath,
        file_hash: fileHash,
        file_size: Number(file.size || fs.statSync(localPath).size),
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
        created_at: now,
        updated_at: now
        });
        console.log(`[Drive DB] after saveDocument (new) id=${documentId}`);
      } catch (error: any) {
        console.error('[Drive DB] saveDocument (new) failed:', { message: error?.message, code: error?.code, name: error?.name, stack: error?.stack });
        throw error;
      }
    }

    try {
      console.log(`[Drive DB] before processing-source upsert id=${documentId} file=${file.name}`);
      upsertDriveSource({
      drive_file_id: file.id,
      source_type: sourceType,
      folder_id: folderId,
      file_name: file.name,
      modified_time: file.modifiedTime || '',
      file_size: Number(file.size || 0),
      resource_key: file.resourceKey || '',
      document_id: documentId,
      status: 'processing',
      error_message: '',
      updated_at: now
      });
      console.log(`[Drive DB] after processing-source upsert id=${documentId}`);
    } catch (error: any) {
      console.error('[Drive DB] processing-source upsert failed:', { message: error?.message, code: error?.code, name: error?.name, stack: error?.stack });
      throw error;
    }

    // Persist the document/source checkpoint BEFORE OCR starts. This sync is
    // intentionally measured because Turso reconciliation can itself consume
    // significant memory on a small Render instance.
    logDriveMemory(`before Turso checkpoint sync: ${file.name}`);
    await syncDatabase().catch((err) => {
      console.warn('Database sync before Drive PDF processing failed:', err);
    });
    logDriveMemory(`after Turso checkpoint sync: ${file.name}`);

    try {
      logDriveMemory(`before processPdfDocument: ${file.name}`);
      const result = await processPdfDocument(documentId);
      upsertDriveSource({
        drive_file_id: file.id,
        source_type: sourceType,
        folder_id: folderId,
        file_name: file.name,
        modified_time: file.modifiedTime || '',
        file_size: Number(file.size || 0),
        resource_key: file.resourceKey || '',
        document_id: documentId,
        status: result.success ? 'indexed' : 'failed',
        error_message: result.error || '',
        updated_at: new Date().toISOString()
      });
      // Drive remains the source of truth; remove the temporary local PDF after indexing.
      fs.rmSync(localPath, { force: true });
      return { action: result.success ? 'indexed' : 'failed', documentId, error: result.error };
    } catch (error: any) {
      upsertDriveSource({
        drive_file_id: file.id,
        source_type: sourceType,
        folder_id: folderId,
        file_name: file.name,
        modified_time: file.modifiedTime || '',
        file_size: Number(file.size || 0),
        resource_key: file.resourceKey || '',
        document_id: documentId,
        status: 'failed',
        error_message: error.message,
        updated_at: new Date().toISOString()
      });
      throw error;
    }
  } catch (error: any) {
    fs.rmSync(localPath, { force: true });
    upsertDriveSource({
      drive_file_id: file.id,
      source_type: sourceType,
      folder_id: folderId,
      file_name: file.name,
      modified_time: file.modifiedTime || '',
      file_size: Number(file.size || 0),
      resource_key: file.resourceKey || '',
      document_id: existingSource?.document_id || '',
      status: 'failed',
      error_message: error.message,
      updated_at: new Date().toISOString()
    });
    return { action: 'failed', error: error.message };
  }
}

let syncRunning = false;
let lastSyncError = '';
let lastDiscovered = { male: 0, female: 0 };
let currentDriveItem: { sourceType: 'male' | 'female'; fileName: string; fileId: string } | null = null;
let currentRun = {
  startedAt: '',
  attempted: 0,
  indexed: 0,
  skipped: 0,
  duplicates: 0,
  failed: 0
};

const DRIVE_SYNC_BATCH_SIZE = Math.max(
  1,
  Number(process.env.DRIVE_SYNC_BATCH_SIZE || 1)
);

export async function syncGoogleDriveFolders() {
  if (!isDriveSyncConfigured()) {
    return {
      configured: false,
      running: false,
      message: 'GOOGLE_DRIVE_API_KEY সেট করা হয়নি।'
    };
  }
  if (syncRunning) {
    return { configured: true, running: true, message: 'Drive sync ইতিমধ্যে চলছে।' };
  }

  syncRunning = true;
  lastSyncError = '';
  const startedAt = new Date().toISOString();
  currentRun = {
    startedAt,
    attempted: 0,
    indexed: 0,
    skipped: 0,
    duplicates: 0,
    failed: 0
  };
  currentDriveItem = null;

  try {
    console.log(
      `[Drive sync] configuration: apiKey=${GOOGLE_DRIVE_API_KEY ? 'present' : 'missing'}, maleFolder=${MALE_FOLDER_ID}, femaleFolder=${FEMALE_FOLDER_ID}`
    );

    await verifyPublicFolder(MALE_FOLDER_ID, 'male');
    await verifyPublicFolder(FEMALE_FOLDER_ID, 'female');

    let indexed = 0;
    let skipped = 0;
    let duplicates = 0;
    let failed = 0;
    let attempted = 0;
    let discoveredMale = 0;
    let discoveredFemale = 0;
    let batchRemaining = DRIVE_SYNC_BATCH_SIZE;

    // Stream each folder page-by-page. We never build maleFiles/femaleFiles
    // arrays containing the whole 2,700+ file library.
    const processPage = async (
      files: DriveFile[],
      sourceType: 'male' | 'female',
      folderId: string,
      pageNumber: number
    ) => {
      if (batchRemaining <= 0) return;

      for (const file of files) {
        if (batchRemaining <= 0) break;

        const source = getDriveSourceByFileId(file.id);
        const needsProcessing =
          !source ||
          source.status !== 'indexed' ||
          source.modified_time !== (file.modifiedTime || '') ||
          Number(source.file_size || 0) !== Number(file.size || 0);

        if (!needsProcessing) continue;

        attempted++;
        currentRun.attempted = attempted;
        currentDriveItem = { sourceType, fileName: file.name, fileId: file.id };

        console.log(
          `[Drive sync] Processing file index ${attempted} of batch ${DRIVE_SYNC_BATCH_SIZE} (page ${pageNumber}): ${sourceType}: ${file.name} (${file.id})`
        );

        const result = await indexDriveFile(file, sourceType, folderId);
        if (result.action === 'indexed') indexed++;
        else if (result.action === 'skipped') skipped++;
        else if (result.action === 'duplicate') duplicates++;
        else failed++;

        batchRemaining--;

        // Persist before moving to the next PDF.
        await syncDatabase().catch((err) => {
          console.warn('Database sync after Drive candidate failed:', err);
        });
      }
    };

    // Male first, then female. Each page is discarded before the next page is fetched.
    discoveredMale = await forEachPublicFolderPdfPage(
      MALE_FOLDER_ID,
      async (files, pageNumber) => {
        const before = files.length;
        await processPage(files, 'male', MALE_FOLDER_ID, pageNumber);
        // Count only the current page; no page survives this callback.
        discoveredMale += before;
      }
    );

    if (batchRemaining > 0) {
      discoveredFemale = await forEachPublicFolderPdfPage(
        FEMALE_FOLDER_ID,
        async (files, pageNumber) => {
          const before = files.length;
          await processPage(files, 'female', FEMALE_FOLDER_ID, pageNumber);
          discoveredFemale += before;
        }
      );
    } else {
      // The full count is still useful to the UI, so count the remaining
      // folder pages without retaining their file metadata.
      discoveredFemale = await forEachPublicFolderPdfPage(
        FEMALE_FOLDER_ID,
        async () => {}
      );
    }

    lastDiscovered = { male: discoveredMale, female: discoveredFemale };
    console.log(`[Drive sync] discovered male=${discoveredMale}, female=${discoveredFemale}`);

    console.log(`[Drive sync] finished attempted=${attempted}, indexed=${indexed}, skipped=${skipped}, duplicates=${duplicates}, failed=${failed}`);

    return {
      configured: true,
      running: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      discovered: discoveredMale + discoveredFemale,
      maleFiles: discoveredMale,
      femaleFiles: discoveredFemale,
      batchSize: DRIVE_SYNC_BATCH_SIZE,
      attempted,
      indexed,
      skipped,
      duplicates,
      failed
    };
  } catch (error: any) {
    lastSyncError = error.message;
    return {
      configured: true,
      running: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: error.message
    };
  } finally {
    syncRunning = false;
    currentDriveItem = null;
  }
}
export function getDriveSyncStatus() {
  return {
    configured: isDriveSyncConfigured(),
    running: syncRunning,
    lastError: lastSyncError || null,
    maleFolderId: MALE_FOLDER_ID,
    femaleFolderId: FEMALE_FOLDER_ID,
    ...getDriveSyncStats(),
    lastDiscovered,
    currentDriveItem,
    currentRun
  };
}

export async function streamDriveFile(
  driveFileId: string,
  resourceKey: string | undefined,
  res: any
) {
  const params: Record<string, string> = { alt: 'media' };
  if (resourceKey) params.resourceKey = resourceKey;

  const response = await fetch(apiUrl(`files/${encodeURIComponent(driveFileId)}`, params));
  if (!response.ok || !response.body) {
    throw new Error(`Google Drive PDF fetch failed: ${response.status}`);
  }

  res.status(200);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Accept-Ranges', 'none');
  const nodeStream = Readable.fromWeb(response.body as any);
  nodeStream.pipe(res);
}
