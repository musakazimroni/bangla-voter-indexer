import React, { useState } from 'react';
import {
  FileText,
  ExternalLink,
  Users,
  Copy,
  Check,
  MapPin,
  Calendar,
  Briefcase,
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { VoterRecord } from '../types.ts';

interface VoterCardProps {
  voter: VoterRecord;
  onOpenPdf: (documentId: string, pageNumber: number, voter: VoterRecord) => void;
  onFindFamily: (voter: VoterRecord) => void;
}

export const VoterCard: React.FC<VoterCardProps> = ({ voter, onOpenPdf, onFindFamily }) => {
  const [copied, setCopied] = useState(false);

  const copyVoterNo = () => {
    if (voter.voterNumber) {
      navigator.clipboard.writeText(voter.voterNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const confidencePercent = Math.round((voter.ocrConfidence || 1) * 100);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs hover:shadow-md transition-all p-5 flex flex-col justify-between">
      <div>
        {/* Top bar: Serial & OCR Confidence */}
        <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200">
              ক্রমিক: {voter.serialNumber || '—'}
            </span>
            {voter.voterAreaCode && (
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                এলাকা কোড: {voter.voterAreaCode}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1.5">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                confidencePercent >= 90
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
              title="OCR নির্ভুলতার মাত্রা"
            >
              <Sparkles className="w-3 h-3 mr-1" />
              OCR নির্ভুলতা: {confidencePercent}%
            </span>
          </div>
        </div>

        {/* Voter Name */}
        <h3 className="text-lg font-bold text-slate-900 leading-snug">
          {voter.name}
        </h3>

        {/* Voter Number */}
        <div className="mt-1.5 flex items-center space-x-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-500">ভোটার নং:</span>
          <span className="font-mono text-emerald-800 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
            {voter.voterNumber || 'তথ্য নেই'}
          </span>
          {voter.voterNumber && (
            <button
              onClick={copyVoterNo}
              className="text-slate-400 hover:text-slate-600 p-0.5"
              title="ভোটার নম্বর কপি করুন"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Field Details */}
        <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
          <div className="flex items-start space-x-1.5">
            <span className="text-slate-400 font-medium min-w-14">পিতা:</span>
            <span className="font-semibold text-slate-900">{voter.fatherName || '—'}</span>
          </div>

          <div className="flex items-start space-x-1.5">
            <span className="text-slate-400 font-medium min-w-14">মাতা:</span>
            <span className="font-semibold text-slate-900">{voter.motherName || '—'}</span>
          </div>

          <div className="flex items-start space-x-1.5">
            <span className="text-slate-400 font-medium min-w-14">জন্মতারিখ:</span>
            <span className="font-medium text-slate-800 flex items-center">
              <Calendar className="w-3 h-3 mr-1 text-slate-400" />
              {voter.dateOfBirth || '—'}
            </span>
          </div>

          <div className="flex items-start space-x-1.5">
            <span className="text-slate-400 font-medium min-w-14">পেশা:</span>
            <span className="font-medium text-slate-800 flex items-center">
              <Briefcase className="w-3 h-3 mr-1 text-slate-400" />
              {voter.occupation || 'অন্যান্য'}
            </span>
          </div>
        </div>

        {/* Address */}
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-start space-x-1.5 text-xs text-slate-600">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <span className="line-clamp-2">
            {voter.address ? `${voter.address}` : 'ঠিকানা সংরক্ষিত নেই'}
            {voter.upazila ? ` | ${voter.upazila}, ${voter.district}` : ''}
          </span>
        </div>
      </div>

      {/* Footer: PDF Source & Action Buttons */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2.5">
          <span className="truncate max-w-[200px]" title={voter.pdfFileName}>
            📄 {voter.pdfFileName}
          </span>
          <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
            পৃষ্ঠা: {voter.pageNumber}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Open PDF at exact page */}
          <button
            type="button"
            onClick={() => onOpenPdf(voter.documentId, voter.pageNumber, voter)}
            className="w-full flex items-center justify-center space-x-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>মূল PDF পৃষ্ঠা</span>
          </button>

          {/* Find family records */}
          <button
            type="button"
            onClick={() => onFindFamily(voter)}
            className="w-full flex items-center justify-center space-x-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            title="একই বাবা ও মায়ের সম্ভাব্য অন্যান্য ভাই-বোন বা রেকর্ড"
          >
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span>পরিবারের রেকর্ড</span>
          </button>
        </div>
      </div>
    </div>
  );
};
