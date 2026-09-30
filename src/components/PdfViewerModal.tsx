import React, { useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
  ExternalLink,
  FileText,
  UserCheck,
  Maximize2
} from 'lucide-react';
import { VoterRecord } from '../types.ts';

interface PdfViewerModalProps {
  documentId: string;
  initialPage: number;
  voter?: VoterRecord | null;
  onClose: () => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  documentId,
  initialPage,
  voter,
  onClose
}) => {
  const [currentPage, setCurrentPage] = useState<number>(initialPage || 1);
  const [zoom, setZoom] = useState<number>(100);

  const pdfUrl = `/api/documents/${documentId}/pdf#page=${currentPage}`;

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => prev + 1);
  };

  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1) {
      setCurrentPage(val);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden text-slate-100">
        {/* Top Control Bar */}
        <div className="bg-slate-800/90 px-4 py-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
          {/* Document & Voter Info */}
          <div className="flex items-center space-x-3 truncate">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/30 text-emerald-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div className="truncate">
              <h4 className="text-sm font-semibold text-white truncate">
                {voter?.pdfFileName || 'মূল ভোটার তালিকা PDF'}
              </h4>
              {voter && (
                <p className="text-xs text-emerald-400 truncate">
                  টার্গেট রেকর্ড: <span className="font-bold text-white">{voter.name}</span> (ভোটার নং: {voter.voterNumber})
                </p>
              )}
            </div>
          </div>

          {/* Page Navigation Controls */}
          <div className="flex items-center space-x-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700">
            <button
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              className="p-1 rounded-md text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40"
              title="পূর্ববর্তী পৃষ্ঠা"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs text-slate-400">পৃষ্ঠা</span>
            <input
              type="number"
              min={1}
              value={currentPage}
              onChange={handlePageInput}
              className="w-12 text-center bg-slate-800 text-white text-xs font-semibold py-0.5 rounded border border-slate-600 focus:outline-none focus:border-emerald-500"
            />

            <button
              onClick={handleNextPage}
              className="p-1 rounded-md text-slate-300 hover:text-white hover:bg-slate-700"
              title="পরবর্তী পৃষ্ঠা"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Zoom & Window Actions */}
          <div className="flex items-center space-x-2">
            <a
              href={`/api/documents/${documentId}/pdf`}
              download={voter?.pdfFileName || 'voter_list.pdf'}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white text-xs flex items-center space-x-1"
              title="PDF ডাউনলোড করুন"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ডাউনলোড</span>
            </a>

            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-700 hover:bg-red-600 text-slate-300 hover:text-white transition-colors"
              title="বন্ধ করুন"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Voter Details Context Ribbon */}
        {voter && (
          <div className="bg-emerald-950/80 border-b border-emerald-800/60 px-4 py-2 text-xs flex flex-wrap items-center gap-x-6 gap-y-1 text-emerald-200">
            <div>
              <span className="text-emerald-400 font-semibold">পিতা:</span> {voter.fatherName || '—'}
            </div>
            <div>
              <span className="text-emerald-400 font-semibold">মাতা:</span> {voter.motherName || '—'}
            </div>
            <div>
              <span className="text-emerald-400 font-semibold">জন্মতারিখ:</span> {voter.dateOfBirth || '—'}
            </div>
            <div className="truncate max-w-sm">
              <span className="text-emerald-400 font-semibold">ঠিকানা:</span> {voter.address || '—'}
            </div>
            <div className="ml-auto flex items-center space-x-1 font-semibold text-emerald-300">
              <UserCheck className="w-3.5 h-3.5" />
              <span>নির্ধারিত পৃষ্ঠা: {currentPage}</span>
            </div>
          </div>
        )}

        {/* PDF Viewer Frame */}
        <div className="flex-1 bg-slate-950 relative overflow-hidden">
          <iframe
            key={`${documentId}_${currentPage}`}
            src={pdfUrl}
            title="PDF Document Viewer"
            className="w-full h-full border-none bg-slate-900"
          />
        </div>
      </div>
    </div>
  );
};
