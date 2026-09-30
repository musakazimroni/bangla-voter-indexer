import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  Pause,
  RefreshCw,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Info
} from 'lucide-react';
import { DocumentInfo } from '../types.ts';

interface DocumentLibraryProps {
  documents: DocumentInfo[];
  onRefresh: () => void;
  onOpenPdf: (documentId: string, pageNumber: number) => void;
}

export const DocumentLibrary: React.FC<DocumentLibraryProps> = ({
  documents,
  onRefresh,
  onOpenPdf
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{
    results?: { file: string; isDuplicate?: boolean; message?: string }[];
    error?: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadFeedback(null);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadFeedback({ error: data.error || 'আপলোড ব্যর্থ হয়েছে।' });
      } else {
        setUploadFeedback({ results: data.results });
        onRefresh();
      }
    } catch (err: any) {
      setUploadFeedback({ error: err.message || 'নেটওয়ার্ক ত্রুটি।' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleReindex = async (docId: string) => {
    try {
      await fetch(`/api/documents/${docId}/reindex`, { method: 'POST' });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handlePause = async (docId: string) => {
    try {
      await fetch(`/api/documents/${docId}/pause`, { method: 'POST' });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleResume = async (docId: string) => {
    try {
      await fetch(`/api/documents/${docId}/resume`, { method: 'POST' });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('আপনি কি নিশ্চিত এই ডকুমেন্ট এবং এর সকল ভোটার রেকর্ড মুছে ফেলতে চান?')) return;
    try {
      await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFilesSelected(e.dataTransfer.files);
        }}
        className={`bg-white border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
          isDragging ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files)}
        />

        <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center mb-3">
          <UploadCloud className="w-7 h-7" />
        </div>

        <h3 className="text-base font-bold text-slate-800">
          নতুন বাংলা ভোটার তালিকা PDF আপলোড করুন
        </h3>
        <p className="text-xs text-slate-500 max-w-lg mx-auto mt-1 mb-4">
          এক সাথে এক বা একাধিক PDF ফাইল টেনে এনে ফেলুন বা ক্লিক করে নির্বাচন করুন। সিস্টেম স্বয়ংক্রিয়ভাবে টেক্সট এক্সট্রাকশন ও বাংলা OCR করে রেকর্ড ডাটাবেজে যুক্ত করবে।
        </p>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition-all disabled:opacity-50 inline-flex items-center space-x-2"
        >
          {isUploading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>আপলোড ও বিশ্লেষণ চলছে...</span>
            </>
          ) : (
            <>
              <UploadCloud className="w-4 h-4" />
              <span>PDF ফাইল নির্বাচন করুন</span>
            </>
          )}
        </button>
      </div>

      {/* Upload Feedback Notices */}
      {uploadFeedback && (
        <div className="space-y-2">
          {uploadFeedback.error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span>{uploadFeedback.error}</span>
            </div>
          )}

          {uploadFeedback.results && uploadFeedback.results.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <h4 className="text-xs font-bold text-slate-700 flex items-center">
                <Info className="w-4 h-4 mr-1 text-emerald-600" />
                আপলোড রিপোর্ট:
              </h4>
              <div className="space-y-1.5">
                {uploadFeedback.results.map((r, i) => (
                  <div
                    key={i}
                    className={`text-xs p-2 rounded-lg flex items-center justify-between ${
                      r.isDuplicate
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    <span className="font-medium truncate max-w-md">{r.file}</span>
                    <span className="font-semibold">{r.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Document Library Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              ইনডেক্সকৃত PDF ডকুমেন্টস ({documents.length} টি)
            </h3>
            <p className="text-xs text-slate-500">
              সমস্ত ভোটার তালিকার সার্বিক ইনডেক্সিং স্ট্যাটাস ও তথ্য
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="রিফ্রেশ করুন"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">ফাইলের নাম ও বিবরণ</th>
                <th className="px-4 py-3.5">এলাকা ও কোড</th>
                <th className="px-4 py-3.5">পৃষ্ঠা</th>
                <th className="px-4 py-3.5">মোট রেকর্ড</th>
                <th className="px-4 py-3.5">ইনডেক্স স্ট্যাটাস</th>
                <th className="px-4 py-3.5 text-right">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400">
                    কোনো ডকুমেন্ট ইনডেক্স করা নেই। উপরের অপশন থেকে PDF আপলোড করুন।
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Filename & Size */}
                    <td className="px-5 py-4">
                      <div className="flex items-start space-x-3">
                        <FileText className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-slate-900 line-clamp-1 max-w-sm">
                            {doc.originalName}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            আকার: {formatFileSize(doc.fileSize)} | হ্যাশ: {doc.fileHash.slice(0, 10)}...
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Area Info */}
                    <td className="px-4 py-4">
                      <div className="text-slate-800 font-medium">
                        {doc.voterArea || '—'} {doc.voterAreaCode ? `(${doc.voterAreaCode})` : ''}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {doc.upazila ? `${doc.upazila}, ${doc.district}` : 'সাধারণ এলাকা'}
                      </div>
                    </td>

                    {/* Pages */}
                    <td className="px-4 py-4 font-mono font-medium">
                      {doc.processedPages} / {doc.pageCount || '—'}
                    </td>

                    {/* Total Records */}
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                        {doc.totalRecords.toLocaleString('bn-BD')} টি
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-4">
                      {doc.status === 'completed' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                          সম্পন্ন
                        </span>
                      ) : doc.status === 'processing' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          <div className="w-2.5 h-2.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-1.5" />
                          প্রসেসিং ({doc.processedPages}/{doc.pageCount})
                        </span>
                      ) : doc.status === 'paused' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <Pause className="w-3 h-3 mr-1 text-amber-600" />
                          স্থগিত
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          <AlertTriangle className="w-3 h-3 mr-1 text-red-600" />
                          ব্যর্থ
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => onOpenPdf(doc.id, 1)}
                        className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                        title="PDF দেখুন"
                      >
                        PDF খুলুন
                      </button>

                      {doc.status === 'processing' ? (
                        <button
                          onClick={() => handlePause(doc.id)}
                          className="p-1 rounded text-amber-600 hover:bg-amber-50"
                          title="স্থগিত করুন"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                      ) : doc.status === 'paused' ? (
                        <button
                          onClick={() => handleResume(doc.id)}
                          className="p-1 rounded text-emerald-600 hover:bg-emerald-50"
                          title="চালু করুন"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      ) : null}

                      <button
                        onClick={() => handleReindex(doc.id)}
                        className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-slate-100"
                        title="পুনরায় ইনডেক্স করুন"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                        title="মুছে ফেলুন"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
