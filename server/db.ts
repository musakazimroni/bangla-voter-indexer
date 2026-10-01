import Database from 'libsql';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeBengaliText, normalizeDate, bengaliToEnglishDigits } from './bengaliNormalizer.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const DB_PATH = path.join(DATA_DIR, 'voter_database.db');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL || '';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

/**
 * libSQL embedded replicas require the local DB file and its companion
 * "<db>-info" metadata file to exist as a pair. Render can retain an old
 * plain SQLite DB (or a partially-created replica) across restarts, which
 * causes SyncInvalidLocalState before libSQL can bootstrap from Turso.
 *
 * We do NOT blindly delete the database. If the pair is inconsistent, move
 * the stale local files into a quarantine directory and let libSQL create a
 * fresh replica from Turso. This keeps the old bytes available for recovery
 * while ensuring startup can proceed safely.
 */
function repairPersistentReplicaState(): void {
  if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) return;

  const metadataPath = `${DB_PATH}-info`;
  const dbExists = fs.existsSync(DB_PATH);
  const metadataExists = fs.existsSync(metadataPath);

  if (dbExists === metadataExists) return;

  const quarantineDir = path.join(DATA_DIR, 'replica-quarantine');
  fs.mkdirSync(quarantineDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  const pathsToMove = [
    DB_PATH,
    `${DB_PATH}-wal`,
    `${DB_PATH}-shm`,
    metadataPath
  ].filter((filePath) => fs.existsSync(filePath));

  console.warn(
    `[libsql] Inconsistent local replica detected (db=${dbExists}, metadata=${metadataExists}). ` +
    `Quarantining ${pathsToMove.length} stale file(s) before Turso bootstrap.`
  );

  for (const sourcePath of pathsToMove) {
    const targetPath = path.join(
      quarantineDir,
      `${path.basename(sourcePath)}.${stamp}`
    );

    try {
      fs.renameSync(sourcePath, targetPath);
      console.warn(`[libsql] Quarantined: ${sourcePath} -> ${targetPath}`);
    } catch (err) {
      throw new Error(
        `Could not quarantine stale libSQL replica file "${sourcePath}": ${String(err)}`
      );
    }
  }
}


const dbOptions = TURSO_DATABASE_URL
  ? { syncUrl: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN }
  : undefined;

// Repair only an inconsistent embedded-replica state before opening the DB.
// A healthy pair is preserved; an inconsistent pair is quarantined so libSQL
// can bootstrap a clean replica from Turso.
repairPersistentReplicaState();

// libSQL keeps the same synchronous SQLite-style prepare/get/all/run API used by
// the existing application, while optionally maintaining an embedded replica of
// a persistent Turso database. Render's local filesystem can therefore remain
// disposable without losing the search index.
export const db = new Database(DB_PATH, dbOptions as any);

let syncInFlight: Promise<void> | null = null;

export function isPersistentDatabaseConfigured(): boolean {
  return Boolean(TURSO_DATABASE_URL && TURSO_AUTH_TOKEN);
}

export async function syncDatabase(): Promise<void> {
  if (!isPersistentDatabaseConfigured() || typeof (db as any).sync !== 'function') {
    return;
  }

  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    try {
      await (db as any).sync();
    } finally {
      // libSQL embedded-replica sync can replace/reconcile the local SQLite
      // schema with the remote state. Re-assert the local application schema
      // immediately after every sync so API requests can never race with a
      // missing `documents` (or related) table.
      try {
        initDatabase();
      } catch (schemaErr) {
        console.error('[libsql] Failed to re-assert local schema after sync:', schemaErr);
        throw schemaErr;
      }
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

// Initialize tables and indexes
const SCHEMA_SQL = `

    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_hash TEXT NOT NULL UNIQUE,
      file_size INTEGER NOT NULL,
      page_count INTEGER NOT NULL,
      processed_pages INTEGER DEFAULT 0,
      status TEXT NOT NULL,
      ocr_status TEXT NOT NULL,
      total_records INTEGER DEFAULT 0,
      district TEXT,
      upazila TEXT,
      union_name TEXT,
      ward TEXT,
      voter_area TEXT,
      voter_area_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_docs_hash ON documents(file_hash);
    CREATE INDEX IF NOT EXISTS idx_docs_status ON documents(status);

    CREATE TABLE IF NOT EXISTS drive_sources (
      drive_file_id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      modified_time TEXT,
      file_size INTEGER DEFAULT 0,
      resource_key TEXT,
      document_id TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_drive_sources_document ON drive_sources(document_id);
    CREATE INDEX IF NOT EXISTS idx_drive_sources_type ON drive_sources(source_type);

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      has_selectable_text INTEGER NOT NULL,
      ocr_used INTEGER NOT NULL,
      ocr_confidence REAL DEFAULT 1.0,
      raw_text TEXT,
      status TEXT NOT NULL,
      record_count INTEGER DEFAULT 0,
      FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pages_doc ON pages(document_id, page_number);

    CREATE TABLE IF NOT EXISTS voters (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      serial_number TEXT,
      name TEXT NOT NULL,
      voter_number TEXT,
      father_name TEXT,
      mother_name TEXT,
      occupation TEXT,
      date_of_birth TEXT,
      address TEXT,
      district TEXT,
      upazila TEXT,
      union_name TEXT,
      ward TEXT,
      voter_area TEXT,
      voter_area_code TEXT,
      pdf_file_name TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      original_text TEXT,
      ocr_confidence REAL DEFAULT 1.0,
      bounding_boxes TEXT,
      norm_name TEXT,
      norm_father TEXT,
      norm_mother TEXT,
      norm_dob TEXT,
      norm_voter_no TEXT,
      norm_address TEXT,
      norm_all TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_voters_doc ON voters(document_id);
    CREATE INDEX IF NOT EXISTS idx_voters_pdf_page ON voters(pdf_file_name, page_number);
    CREATE INDEX IF NOT EXISTS idx_voters_norm_name ON voters(norm_name);
    CREATE INDEX IF NOT EXISTS idx_voters_norm_father ON voters(norm_father);
    CREATE INDEX IF NOT EXISTS idx_voters_norm_mother ON voters(norm_mother);
    CREATE INDEX IF NOT EXISTS idx_voters_norm_dob ON voters(norm_dob);
    CREATE INDEX IF NOT EXISTS idx_voters_norm_voter_no ON voters(norm_voter_no);

    CREATE VIRTUAL TABLE IF NOT EXISTS voters_fts USING fts5(
      voter_id UNINDEXED,
      norm_name,
      norm_father,
      norm_mother,
      norm_dob,
      norm_voter_no,
      norm_address,
      norm_all
    );
`;

export function initDatabase() {
  db.exec(SCHEMA_SQL);
}

function hasRequiredSchema(): boolean {
  const requiredTables = ['documents', 'drive_sources', 'voters', 'pages', 'voters_fts'];
  return requiredTables.every((table) => {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    ).get(table) as { name?: string } | undefined;
    return row?.name === table;
  });
}

/**
 * Ensure the local replica is usable before an API handler touches it.
 * If a sync is currently running, wait for it first. If the schema is missing,
 * recreate it locally and immediately persist that schema to Turso.
 */
export async function ensureDatabaseReady(): Promise<void> {
  if (syncInFlight) {
    await syncInFlight;
  }

  // Always assert the application schema before an API handler touches the
  // replica. This is intentionally idempotent and protects against a remote
  // Turso snapshot that does not yet contain the application tables.
  initDatabase();

  if (!hasRequiredSchema()) {
    throw new Error('Database schema is unavailable after local initialization.');
  }
}

export interface DbDocument {
  id: string;
  filename: string;
  original_name: string;
  file_path: string;
  file_hash: string;
  file_size: number;
  page_count: number;
  processed_pages: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused';
  ocr_status: 'not_needed' | 'in_progress' | 'completed' | 'partial' | 'failed';
  total_records: number;
  district: string;
  upazila: string;
  union_name: string;
  ward: string;
  voter_area: string;
  voter_area_code: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface DbVoter {
  id: string;
  document_id: string;
  serial_number: string;
  name: string;
  voter_number: string;
  father_name: string;
  mother_name: string;
  occupation: string;
  date_of_birth: string;
  address: string;
  district: string;
  upazila: string;
  union_name: string;
  ward: string;
  voter_area: string;
  voter_area_code: string;
  pdf_file_name: string;
  page_number: number;
  original_text: string;
  ocr_confidence: number;
  bounding_boxes?: string;
  norm_name: string;
  norm_father: string;
  norm_mother: string;
  norm_dob: string;
  norm_voter_no: string;
  norm_address: string;
  norm_all: string;
  created_at: string;
}

/**
 * Check if a document with the given hash already exists
 */
export function findDocumentByHash(fileHash: string): DbDocument | null {
  const stmt = db.prepare('SELECT * FROM documents WHERE file_hash = ?');
  const row = stmt.get(fileHash) as unknown as DbDocument | undefined;
  return row || null;
}

/**
 * Get document by ID
 */
export function getDocumentById(id: string): DbDocument | null {
  const stmt = db.prepare('SELECT * FROM documents WHERE id = ?');
  const row = stmt.get(id) as unknown as DbDocument | undefined;
  return row || null;
}

/**
 * Get all documents
 */
export function getAllDocuments(): DbDocument[] {
  const stmt = db.prepare('SELECT * FROM documents ORDER BY created_at DESC');
  return stmt.all() as unknown as DbDocument[];
}

/**
 * Insert or replace document record
 */
function logDatabaseOperationError(operation: string, error: any, context: Record<string, unknown> = {}) {
  console.error(`[DB ERROR] ${operation}`, {
    ...context,
    name: error?.name,
    message: error?.message,
    code: error?.code,
    stack: error?.stack
  });
}

export function saveDocument(doc: DbDocument) {
  console.log('[DB] saveDocument begin', {
    id: doc?.id,
    fileName: doc?.original_name,
    fileSize: doc?.file_size,
    hashPresent: Boolean(doc?.file_hash),
    pageCount: doc?.page_count,
    processedPages: doc?.processed_pages,
    status: doc?.status
  });
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO documents (
      id, filename, original_name, file_path, file_hash, file_size,
      page_count, processed_pages, status, ocr_status, total_records,
      district, upazila, union_name, ward, voter_area, voter_area_code,
      error_message, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(
      doc.id,
      doc.filename,
      doc.original_name,
      doc.file_path,
      doc.file_hash,
      doc.file_size,
      doc.page_count,
      doc.processed_pages,
      doc.status,
      doc.ocr_status,
      doc.total_records,
      doc.district || '',
      doc.upazila || '',
      doc.union_name || '',
      doc.ward || '',
      doc.voter_area || '',
      doc.voter_area_code || '',
      doc.error_message || '',
      doc.created_at,
      doc.updated_at
    );
    console.log('[DB] saveDocument success', { id: doc.id });
  } catch (error: any) {
    logDatabaseOperationError('saveDocument INSERT OR REPLACE documents', error, {
      id: doc?.id,
      fileName: doc?.original_name,
      hashPresent: Boolean(doc?.file_hash),
      fileSize: doc?.file_size,
      createdAtPresent: Boolean(doc?.created_at),
      updatedAtPresent: Boolean(doc?.updated_at)
    });
    throw error;
  }
}

/**
 * Update document progress
 */
export function updateDocumentProgress(
  id: string,
  processedPages: number,
  totalRecords: number,
  status: string,
  ocrStatus: string,
  errorMessage: string = ''
) {
  const stmt = db.prepare(`
    UPDATE documents SET
      processed_pages = ?,
      total_records = ?,
      status = ?,
      ocr_status = ?,
      error_message = ?,
      updated_at = ?
    WHERE id = ?
  `);
  stmt.run(processedPages, totalRecords, status, ocrStatus, errorMessage, new Date().toISOString(), id);
}

/**
 * Delete a document and its indexed voters & pages
 */
export function deleteDocument(id: string): boolean {
  const doc = getDocumentById(id);
  if (!doc) return false;

  // Delete from FTS first
  const voterIdsStmt = db.prepare('SELECT id FROM voters WHERE document_id = ?');
  const voterIds = voterIdsStmt.all(id) as unknown as { id: string }[];
  
  if (voterIds.length > 0) {
    const deleteFtsStmt = db.prepare('DELETE FROM voters_fts WHERE voter_id = ?');
    for (const { id: vId } of voterIds) {
      deleteFtsStmt.run(vId);
    }
  }

  // Delete from voters & pages & documents
  db.prepare('DELETE FROM voters WHERE document_id = ?').run(id);
  db.prepare('DELETE FROM pages WHERE document_id = ?').run(id);
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);

  // Try to remove file if on disk
  try {
    if (fs.existsSync(doc.file_path)) {
      fs.unlinkSync(doc.file_path);
    }
  } catch (err) {
    console.error('Failed to unlink document file:', err);
  }

  return true;
}

/**
 * Batch insert voters into database and FTS index
 */
export function insertVotersBatch(voters: DbVoter[]) {
  if (!voters || voters.length === 0) return;

  const insertVoterStmt = db.prepare(`
    INSERT OR REPLACE INTO voters (
      id, document_id, serial_number, name, voter_number, father_name,
      mother_name, occupation, date_of_birth, address, district, upazila,
      union_name, ward, voter_area, voter_area_code, pdf_file_name,
      page_number, original_text, ocr_confidence, bounding_boxes,
      norm_name, norm_father, norm_mother, norm_dob, norm_voter_no,
      norm_address, norm_all, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFtsStmt = db.prepare(`
    INSERT OR REPLACE INTO voters_fts (
      voter_id, norm_name, norm_father, norm_mother, norm_dob,
      norm_voter_no, norm_address, norm_all
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const v of voters) {
    insertVoterStmt.run(
      v.id,
      v.document_id,
      v.serial_number || '',
      v.name || '',
      v.voter_number || '',
      v.father_name || '',
      v.mother_name || '',
      v.occupation || '',
      v.date_of_birth || '',
      v.address || '',
      v.district || '',
      v.upazila || '',
      v.union_name || '',
      v.ward || '',
      v.voter_area || '',
      v.voter_area_code || '',
      v.pdf_file_name,
      v.page_number,
      v.original_text || '',
      v.ocr_confidence || 1.0,
      v.bounding_boxes || '',
      v.norm_name,
      v.norm_father,
      v.norm_mother,
      v.norm_dob,
      v.norm_voter_no,
      v.norm_address,
      v.norm_all,
      v.created_at || new Date().toISOString()
    );

    insertFtsStmt.run(
      v.id,
      v.norm_name,
      v.norm_father,
      v.norm_mother,
      v.norm_dob,
      v.norm_voter_no,
      v.norm_address,
      v.norm_all
    );
  }
}

/**
 * Get system index stats
 */
export function getIndexStats() {
  const docsRow = db.prepare(`
    SELECT
      COUNT(*) as documentsCount,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as processedCount,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedCount,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processingCount,
      COALESCE(SUM(page_count), 0) as totalPages,
      COALESCE(SUM(total_records), 0) as totalRecords,
      MAX(updated_at) as lastIndexedAt
    FROM documents
  `).get() as unknown as Record<string, number | string | null>;

  const votersCountRow = db.prepare('SELECT COUNT(*) as count FROM voters').get() as { count: number };

  let dbSize = 0;
  try {
    if (fs.existsSync(DB_PATH)) {
      dbSize = fs.statSync(DB_PATH).size;
    }
  } catch {}

  return {
    documentsCount: Number(docsRow.documentsCount || 0),
    processedCount: Number(docsRow.processedCount || 0),
    failedCount: Number(docsRow.failedCount || 0),
    processingCount: Number(docsRow.processingCount || 0),
    totalPages: Number(docsRow.totalPages || 0),
    totalRecords: Number(votersCountRow.count || 0),
    databaseSizeBytes: dbSize,
    lastIndexedAt: (docsRow.lastIndexedAt as string) || null,
  };
}


export interface DbDriveSource {
  drive_file_id: string;
  source_type: 'male' | 'female';
  folder_id: string;
  file_name: string;
  modified_time: string;
  file_size: number;
  resource_key: string;
  document_id: string;
  status: 'processing' | 'indexed' | 'failed';
  error_message: string;
  updated_at: string;
}

export function getDriveSourceByFileId(fileId: string): DbDriveSource | null {
  const row = db.prepare('SELECT * FROM drive_sources WHERE drive_file_id = ?').get(fileId) as unknown as DbDriveSource | undefined;
  return row || null;
}

export function getDriveSourceByDocumentId(documentId: string): DbDriveSource | null {
  const row = db.prepare('SELECT * FROM drive_sources WHERE document_id = ?').get(documentId) as unknown as DbDriveSource | undefined;
  return row || null;
}

export function upsertDriveSource(source: DbDriveSource) {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO drive_sources (
        drive_file_id, source_type, folder_id, file_name, modified_time,
        file_size, resource_key, document_id, status, error_message, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      source.drive_file_id,
      source.source_type,
      source.folder_id,
      source.file_name,
      source.modified_time || '',
      Number(source.file_size || 0),
      source.resource_key || '',
      source.document_id || '',
      source.status,
      source.error_message || '',
      source.updated_at
    );
    console.log('[DB] upsertDriveSource success', {
      driveFileId: source.drive_file_id,
      documentId: source.document_id,
      status: source.status
    });
  } catch (error: any) {
    logDatabaseOperationError('upsertDriveSource INSERT OR REPLACE drive_sources', error, {
      driveFileId: source?.drive_file_id,
      sourceType: source?.source_type,
      folderId: source?.folder_id,
      fileName: source?.file_name,
      documentId: source?.document_id,
      status: source?.status,
      updatedAtPresent: Boolean(source?.updated_at)
    });
    throw error;
  }
}

export function getDriveSyncStats() {
  const total = db.prepare('SELECT COUNT(*) as count FROM drive_sources').get() as { count: number };
  const male = db.prepare("SELECT COUNT(*) as count FROM drive_sources WHERE source_type = 'male'").get() as { count: number };
  const female = db.prepare("SELECT COUNT(*) as count FROM drive_sources WHERE source_type = 'female'").get() as { count: number };
  const indexed = db.prepare("SELECT COUNT(*) as count FROM drive_sources WHERE status = 'indexed'").get() as { count: number };
  const failed = db.prepare("SELECT COUNT(*) as count FROM drive_sources WHERE status = 'failed'").get() as { count: number };
  const lastSync = db.prepare('SELECT MAX(updated_at) as value FROM drive_sources').get() as { value?: string };
  return {
    driveTotal: Number(total.count || 0),
    driveMale: Number(male.count || 0),
    driveFemale: Number(female.count || 0),
    driveIndexed: Number(indexed.count || 0),
    driveFailed: Number(failed.count || 0),
    driveLastUpdatedAt: lastSync.value || null
  };
}
