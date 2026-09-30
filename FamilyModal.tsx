import React, { useEffect, useState } from 'react';
import { X, Users, User, Calendar, MapPin, FileText, ArrowRight } from 'lucide-react';
import { VoterRecord } from '../types.ts';

interface FamilyModalProps {
  voter: VoterRecord;
  onClose: () => void;
  onOpenPdf: (documentId: string, pageNumber: number, voter: VoterRecord) => void;
}

export const FamilyModal: React.FC<FamilyModalProps> = ({ voter, onClose, onOpenPdf }) => {
  const [relatedMembers, setRelatedMembers] = useState<VoterRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchFamily() {
      setIsLoading(true);
      try {
        const queryParams = new URLSearchParams({
          fatherName: voter.fatherName || '',
          motherName: voter.motherName || '',
          excludeId: voter.id
        });
        const res = await fetch(`/api/related-family?${queryParams.toString()}`);
        const data = await res.json();
        setRelatedMembers(data.results || []);
      } catch (err) {
        console.error('Failed to fetch related family:', err);
      } finally {
        setIsLoading(false);
      }
    }

    if (voter.fatherName && voter.motherName) {
      fetchFamily();
    } else {
      setIsLoading(false);
    }
  }, [voter]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                পারিবারিক ভোটার রেকর্ড সংযোগ
              </h3>
              <p className="text-xs text-slate-500">
                পিতা: <span className="font-semibold text-slate-700">{voter.fatherName || '—'}</span> | মাতা:{' '}
                <span className="font-semibold text-slate-700">{voter.motherName || '—'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* Target Reference Voter */}
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block mb-1">
              বর্তমান রেকর্ড (প্রারম্ভিক অনুসন্ধান)
            </span>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{voter.name}</h4>
                <p className="text-xs text-slate-600">
                  ভোটার নং: <span className="font-mono">{voter.voterNumber}</span> | জন্মতারিখ: {voter.dateOfBirth}
                </p>
              </div>
              <span className="text-xs font-semibold text-emerald-700 bg-white px-2 py-1 rounded border border-emerald-200">
                পৃষ্ঠা: {voter.pageNumber}
              </span>
            </div>
          </div>

          {/* Related Family List */}
          <div>
            <h4 className="text-xs font-semibold text-slate-600 mb-2">
              একই পিতা ও মাতার অধীনে প্রাপ্ত অন্যান্য ভোটার রেকর্ড:
            </h4>

            {isLoading ? (
              <div className="py-8 text-center text-slate-500 text-sm">
                <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                পারিবারিক রেকর্ড খোঁজা হচ্ছে...
              </div>
            ) : relatedMembers.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500 text-sm">
                এই পিতা ও মাতার নাম দিয়ে অন্য কোনো অতিরিক্ত ভোটার রেকর্ড পাওয়া যায়নি।
              </div>
            ) : (
              <div className="space-y-2.5">
                {relatedMembers.map((member) => (
                  <div
                    key={member.id}
                    className="p-3.5 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-all flex items-center justify-between gap-3"
                  >
                    <div>
                      <h5 className="font-bold text-slate-900 text-sm">{member.name}</h5>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 mt-1">
                        <span>ভোটার নং: <span className="font-mono text-emerald-800">{member.voterNumber}</span></span>
                        <span>জন্মতারিখ: {member.dateOfBirth}</span>
                        <span>পেশা: {member.occupation || '—'}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-md">
                        {member.address} (ফাইল: {member.pdfFileName}, পৃষ্ঠা: {member.pageNumber})
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        onClose();
                        onOpenPdf(member.documentId, member.pageNumber, member);
                      }}
                      className="shrink-0 flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                    >
                      <span>PDF পৃষ্ঠা</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
