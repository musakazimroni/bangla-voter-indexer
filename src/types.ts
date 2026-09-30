export interface VoterRecord {
  id: string;
  documentId: string;
  serialNumber: string;
  name: string;
  voterNumber: string;
  fatherName: string;
  motherName: string;
  occupation: string;
  dateOfBirth: string;
  address: string;
  district: string;
  upazila: string;
  unionName: string;
  ward: string;
  voterArea: string;
  voterAreaCode: string;
  pdfFileName: string;
  pageNumber: number;
  originalText?: string;
  ocrConfidence: number;
  boundingBoxes?: string;
  createdAt?: string;
}

export type SearchMode = 'exact' | 'partial' | 'fuzzy';

export interface SearchFilters {
  name?: string;
  fatherName?: string;
  motherName?: string;
  dateOfBirth?: string;
  voterNumber?: string;
  query?: string; // all fields
  searchMode: SearchMode;
  page?: number;
  limit?: number;
  documentId?: string;
  upazila?: string;
  union?: string;
  village?: string;
}

export interface SearchResponse {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  results: VoterRecord[];
  executionTimeMs: number;
}

export interface DocumentInfo {
  id: string;
  filename: string;
  originalName: string;
  filePath: string;
  fileHash: string;
  fileSize: number;
  pageCount: number;
  processedPages: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused';
  ocrStatus: 'not_needed' | 'in_progress' | 'completed' | 'partial' | 'failed';
  totalRecords: number;
  district: string;
  upazila: string;
  unionName: string;
  ward: string;
  voterArea: string;
  voterAreaCode: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IndexStats {
  documentsCount: number;
  processedCount: number;
  failedCount: number;
  processingCount: number;
  totalPages: number;
  totalRecords: number;
  databaseSizeBytes: number;
  lastIndexedAt: string | null;
}

export interface BatchProcessingStatus {
  isProcessing: boolean;
  isPaused: boolean;
  totalFiles: number;
  processedFiles: number;
  currentFileIndex: number;
  currentFileName: string;
  currentPage: number;
  totalPagesInCurrentFile: number;
  currentOcrPercent: number;
  recordsDetected: number;
  totalBatchRecords: number;
  failedFiles: number;
}
