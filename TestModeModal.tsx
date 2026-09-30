import React, { useState } from 'react';
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  Play,
  FileText,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { SearchFilters, VoterRecord } from '../types.ts';

interface TestCase {
  id: string;
  category: string;
  name: string;
  description: string;
  filters: SearchFilters;
  expectedRecordName: string;
  expectedPage?: number;
  expectedFileName?: string;
}

const PRESET_TEST_CASES: TestCase[] = [
  {
    id: 'test-1',
    category: 'সিন্থেটিক টেস্ট ডাটা',
    name: 'শাহানারা (নাম দিয়ে অনুসন্ধান)',
    description: 'সিন্থেটিক ডেটাসেট থেকে "শাহানারা" দিয়ে অনুসন্ধান',
    filters: { name: 'শাহানারা', searchMode: 'partial', page: 1, limit: 10 },
    expectedRecordName: 'শাহানারা বেগম',
    expectedPage: 1
  },
  {
    id: 'test-2',
    category: 'সিন্থেটিক টেস্ট ডাটা',
    name: 'করিম (নামের আংশিক মিল)',
    description: '"করিম" দিয়ে মোঃ আব্দুল করিম খুঁজে বের করা',
    filters: { name: 'করিম', searchMode: 'partial', page: 1, limit: 10 },
    expectedRecordName: 'মোঃ আব্দুল করিম',
    expectedPage: 1
  },
  {
    id: 'test-3',
    category: 'সিন্থেটিক টেস্ট ডাটা',
    name: 'হাকিমপুর (ঠিকানা / সাধারণ কুয়েরি)',
    description: 'ঠিকানা হিসেবে "হাকিমপুর" দিয়ে ভোটার খুঁজে পাওয়া',
    filters: { query: 'হাকিমপুর', searchMode: 'partial', page: 1, limit: 10 },
    expectedRecordName: 'মোঃ আব্দুল করিম',
    expectedPage: 1
  },
  {
    id: 'test-4',
    category: 'বাংলা ও ইংরেজি ডিজিট নরম্যালাইজেশন',
    name: '১২৩৪ (বাংলা ডিজিট ক্রমিক)',
    description: 'বাংলা সংখ্যায় "১২৩৪" লিখে ভোটার অনুসন্ধান',
    filters: { query: '১২৩৪', searchMode: 'partial', page: 1, limit: 10 },
    expectedRecordName: 'মোঃ আব্দুল করিম',
    expectedPage: 1
  },
  {
    id: 'test-5',
    category: 'বাংলা ও ইংরেজি ডিজিট নরম্যালাইজেশন',
    name: '1234 (ইংরেজি ডিজিট সমমান)',
    description: 'ইংরেজি "1234" লিখলেও একই বাংলা ভোটার "১২৩৪" খুঁজে পাওয়া',
    filters: { query: '1234', searchMode: 'partial', page: 1, limit: 10 },
    expectedRecordName: 'মোঃ আব্দুল করিম',
    expectedPage: 1
  },
  {
    id: 'test-6',
    category: 'বহুমুখী ফিল্টার অনুসন্ধান',
    name: 'নাম + পিতা + জন্মতারিখ কম্বাইন্ড সার্চ',
    description: 'নাম: সাইফুল + পিতা: আব্দুল গফুর + জন্মতারিখ: ২৩/০৭/১৯৮৩',
    filters: {
      name: 'সাইফুল',
      fatherName: 'আব্দুল গফুর',
      dateOfBirth: '২৩/০৭/১৯৮৩',
      searchMode: 'partial',
      page: 1,
      limit: 10
    },
    expectedRecordName: 'মোঃ সাইফুল ইসলাম',
    expectedPage: 3
  },
  {
    id: 'test-7',
    category: 'সংযুক্ত আসল নমুনা PDF (তেঘরিয়া)',
    name: 'মোঃ সাইফুল ইসলাম (পুরুষ ভোটার তালিকা)',
    description: 'তেঘরিয়া male voter list PDF (৪১০৬৯২২৮৮৯০২) এর ৩য় পৃষ্ঠা',
    filters: { name: 'মোঃ সাইফুল ইসলাম', searchMode: 'partial', page: 1, limit: 10 },
    expectedRecordName: 'মোঃ সাইফুল ইসলাম',
    expectedPage: 3
  },
  {
    id: 'test-8',
    category: 'সংযুক্ত আসল নমুনা PDF (তেঘরিয়া)',
    name: 'মোছাঃ পারভীনা বেগম (মহিলা ভোটার তালিকা)',
    description: 'তেঘরিয়া female voter list PDF (৪১০৬৯২২৮৯৮৪১) এর ৩য় পৃষ্ঠা',
    filters: { name: 'মোছাঃ পারভীনা বেগম', searchMode: 'partial', page: 1, limit: 10 },
    expectedRecordName: 'মোছাঃ পারভীনা বেগম',
    expectedPage: 3
  },
  {
    id: 'test-9',
    category: 'সংযুক্ত আসল নমুনা PDF (তেঘরিয়া)',
    name: 'মুসা কাজীম (পৃষ্ঠা ৭৩ নির্দিষ্ট নেভিগেশন)',
    description: 'পৃষ্ঠা ৭৩ এর ভোটার "মুসা কাজীম" সঠিক পৃষ্ঠা সহ খুঁজে পাওয়া',
    filters: { name: 'মুসা কাজীম', searchMode: 'partial', page: 1, limit: 10 },
    expectedRecordName: 'মুসা কাজীম',
    expectedPage: 73
  },
  {
    id: 'test-10',
    category: 'বানান সহনশীলতা (Fuzzy Search)',
    name: 'আব্দুল গফুর (ফাজি মোড)',
    description: 'পিতার নাম "আব্দুল গফুর" দিয়ে ফাজি সার্চ টেস্ট',
    filters: { fatherName: 'আব্দুল গফুর', searchMode: 'fuzzy', page: 1, limit: 10 },
    expectedRecordName: 'মোঃ সাইফুল ইসলাম',
    expectedPage: 3
  }
];

interface TestModeModalProps {
  onOpenPdf: (documentId: string, pageNumber: number, voter?: VoterRecord) => void;
  onApplyFilters: (filters: SearchFilters) => void;
}

export const TestModeModal: React.FC<TestModeModalProps> = ({ onOpenPdf, onApplyFilters }) => {
  const [resultsMap, setResultsMap] = useState<
    Record<
      string,
      {
        status: 'idle' | 'running' | 'pass' | 'fail';
        matchedRecord?: VoterRecord;
        totalFound?: number;
        timeMs?: number;
        error?: string;
      }
    >
  >({});
  const [isRunningAll, setIsRunningAll] = useState(false);

  const runSingleTest = async (testCase: TestCase) => {
    setResultsMap((prev) => ({
      ...prev,
      [testCase.id]: { status: 'running' }
    }));

    const startTime = performance.now();
    try {
      const queryParams = new URLSearchParams();
      if (testCase.filters.name) queryParams.set('name', testCase.filters.name);
      if (testCase.filters.fatherName) queryParams.set('fatherName', testCase.filters.fatherName);
      if (testCase.filters.motherName) queryParams.set('motherName', testCase.filters.motherName);
      if (testCase.filters.dateOfBirth) queryParams.set('dateOfBirth', testCase.filters.dateOfBirth);
      if (testCase.filters.query) queryParams.set('query', testCase.filters.query);
      queryParams.set('searchMode', testCase.filters.searchMode || 'partial');

      const res = await fetch(`/api/search?${queryParams.toString()}`);
      const data = await res.json();
      const elapsed = Math.round(performance.now() - startTime);

      const matched = data.results && data.results.length > 0 ? data.results[0] : null;
      const isPass =
        data.results &&
        data.results.length > 0 &&
        (!testCase.expectedRecordName ||
          data.results.some((r: any) => r.name.includes(testCase.expectedRecordName)));

      setResultsMap((prev) => ({
        ...prev,
        [testCase.id]: {
          status: isPass ? 'pass' : 'fail',
          matchedRecord: matched,
          totalFound: data.total || 0,
          timeMs: elapsed
        }
      }));
    } catch (err: any) {
      setResultsMap((prev) => ({
        ...prev,
        [testCase.id]: {
          status: 'fail',
          error: err.message,
          timeMs: Math.round(performance.now() - startTime)
        }
      }));
    }
  };

  const runAllTests = async () => {
    setIsRunningAll(true);
    for (const tc of PRESET_TEST_CASES) {
      await runSingleTest(tc);
    }
    setIsRunningAll(false);
  };

  return (
    <div className="space-y-6">
      {/* Test Panel Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <FlaskConical className="w-5 h-5" />
            </span>
            <h3 className="text-lg font-bold text-slate-900">
              সিস্টেম ভেরিফিকেশন ও টেস্ট প্যানেল
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            প্রম্পটে উল্লিখিত সিন্থেটিক ডেটাসেট (মোঃ আব্দুল করিম, হাকিমপুর, ১২৩৪, ইত্যাদি) এবং আসল সংযুক্ত PDF ফাইল (তেঘরিয়া, যশোর) এর সকল কোয়েরি ১-ক্লিকে টেস্ট করুন এবং সরাসরি PDF পেজ নেভিগেশন যাচাই করুন।
          </p>
        </div>

        <button
          onClick={runAllTests}
          disabled={isRunningAll}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all flex items-center space-x-2 shrink-0 disabled:opacity-50"
        >
          {isRunningAll ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>টেস্টগুলো চলছে...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>একসাথে সব টেস্ট চালান</span>
            </>
          )}
        </button>
      </div>

      {/* Test Cases Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="divide-y divide-slate-100">
          {PRESET_TEST_CASES.map((tc, index) => {
            const result = resultsMap[tc.id];

            return (
              <div
                key={tc.id}
                className="p-5 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                {/* Left: Test description */}
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {tc.category}
                    </span>
                    <h4 className="font-bold text-sm text-slate-900">{tc.name}</h4>
                  </div>
                  <p className="text-xs text-slate-500">{tc.description}</p>
                </div>

                {/* Middle: Test status and results */}
                <div className="flex items-center space-x-3">
                  {result?.status === 'running' ? (
                    <span className="text-xs text-blue-600 flex items-center space-x-1 font-medium">
                      <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>চলছে...</span>
                    </span>
                  ) : result?.status === 'pass' ? (
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="inline-flex items-center px-2 py-1 rounded bg-green-50 text-green-700 font-bold border border-green-200">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" />
                        পাস ({result.totalFound} টি রেকর্ড, {result.timeMs}ms)
                      </span>
                    </div>
                  ) : result?.status === 'fail' ? (
                    <span className="inline-flex items-center px-2 py-1 rounded bg-red-50 text-red-700 font-bold text-xs border border-red-200">
                      <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" />
                      ব্যর্থ {result.error ? `: ${result.error}` : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">অপেক্ষারত</span>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => runSingleTest(tc)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors"
                  >
                    চালান
                  </button>

                  {result?.matchedRecord && (
                    <button
                      onClick={() =>
                        onOpenPdf(
                          result.matchedRecord!.documentId,
                          result.matchedRecord!.pageNumber,
                          result.matchedRecord
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold transition-colors flex items-center space-x-1"
                      title="মূল PDF-এর নির্দিষ্ট পৃষ্ঠায় যান"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>PDF পৃষ্ঠা ({result.matchedRecord.pageNumber})</span>
                    </button>
                  )}

                  <button
                    onClick={() => onApplyFilters(tc.filters)}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                  >
                    সার্চে দেখুন
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
