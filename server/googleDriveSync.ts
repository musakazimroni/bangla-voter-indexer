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
  getDriveSyncStats
} from './db.ts';
import { processPdfDocument, calculateFileHash } from './pdfProcessor.ts';

const MALE_FOLDER_ID = process.env.GOOGLE_DRIVE_MALE_FOLDER_ID || '1dDynAaNbKCkHj3HZHElLHpH_3Yuhz0Fn';
const FEMALE_FOLDER_ID = process.env.GOOGLE_DRIVE_FEMALE_FOLDER_ID || '1r4kRB7zk9OSO7Vv4HW0ul2pg1umgj7U8';
const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY || '';
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

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
  const response = await fetch(apiUrl(endpoint, params));
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Google Drive API ${response.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as T;
}

/**
 * Lists every PDF directly inside a public Drive folder.
 * Google documents that public folders can be listed with an API key and
 * the parent-folder query. Pagination is handled here so 700+ files are safe.
 */
export async function listPublicFolderPdfs(folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken = '';

  do {
    const params: Record<string, string> = {
      q: `'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`,
      pageSize: '1000',
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum,resourceKey,webViewLink)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    };
    if (pageToken) params.pageToken = pageToken;

    const result = await driveJson<{ files?: DriveFile[]; nextPageToken?: string }>('files', params);
    files.push(...(result.files || []));
    pageToken = result.nextPageToken || '';
  } while (pageToken);

  return files;
}

async function downloadDriveFile(file: DriveFile, destination: string) {
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

  // If the Drive file changed, remove its old local index before rebuilding it.
  if (existingSource?.document_id && getDocumentById(existingSource.document_id)) {
    deleteDocument(existingSource.document_id);
  }

  const localPath = path.join(UPLOADS_DIR, safeFilename(file.name, file.id));
  try {
    await downloadDriveFile(file, localPath);
    const fileHash = await calculateFileHash(localPath);

    const duplicate = findDocumentByHash(fileHash);
    if (duplicate) {
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
      fs.rmSync(localPath, { force: true });
      return { action: 'duplicate', documentId: duplicate.id };
    }

    const documentId = `drive_${sourceType}_${file.id}`;
    const now = new Date().toISOString();
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

    try {
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

const DRIVE_SYNC_BATCH_SIZE = Math.max(
  1,
  Number(process.env.DRIVE_SYNC_BATCH_SIZE || 10)
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

  try {
    const [maleFiles, femaleFiles] = await Promise.all([
      listPublicFolderPdfs(MALE_FOLDER_ID),
      listPublicFolderPdfs(FEMALE_FOLDER_ID)
    ]);

    lastDiscovered = { male: maleFiles.length, female: femaleFiles.length };

    let indexed = 0;
    let skipped = 0;
    let duplicates = 0;
    let failed = 0;
    let attempted = 0;

    // Process a small batch per run. This makes a 1,600+ PDF library resumable
    // and prevents one Render instance from trying to OCR everything at once.
    const candidates = [
      ...maleFiles.map((file) => ({ file, sourceType: 'male' as const, folderId: MALE_FOLDER_ID })),
      ...femaleFiles.map((file) => ({ file, sourceType: 'female' as const, folderId: FEMALE_FOLDER_ID }))
    ].filter(({ file, sourceType, folderId }) => {
      const source = getDriveSourceByFileId(file.id);
      return !source ||
        source.status !== 'indexed' ||
        source.modified_time !== (file.modifiedTime || '') ||
        Number(source.file_size || 0) !== Number(file.size || 0);
    }).slice(0, DRIVE_SYNC_BATCH_SIZE);

    for (const { file, sourceType, folderId } of candidates) {
      attempted++;
      const result = await indexDriveFile(file, sourceType, folderId);
      if (result.action === 'indexed') indexed++;
      else if (result.action === 'skipped') skipped++;
      else if (result.action === 'duplicate') duplicates++;
      else failed++;
    }
    // Persist progress after each completed candidate. The local database is
    // disposable on Render, so this minimizes the amount of indexing work that
    // could be lost by a restart.
    await (await import('./db.ts')).syncDatabase().catch((err) => {
      console.warn('Database sync after Drive batch failed:', err);
    });

    return {
      configured: true,
      running: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      discovered: maleFiles.length + femaleFiles.length,
      maleFiles: maleFiles.length,
      femaleFiles: femaleFiles.length,
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
    lastDiscovered
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
