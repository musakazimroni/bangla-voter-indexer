import React, { useState } from 'react';
import {
  BarChart3,
  Database,
  FileText,
  FileSpreadsheet,
  Download,
  ShieldCheck,
  RefreshCw,
  HardDrive,
  Cpu,
  Layers,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { IndexStats } from '../types.ts';

interface IndexDashboardProps {
  stats: IndexStats | null;
  onRefreshStats: () => void;
}

export const IndexDashboard: React.FC<IndexDashboardProps> = ({ stats, onRefreshStats }) => {
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [driveNotice, setDriveNotice] = useState<string | null>(null);

  const handleSeedSamples = async () => {
    setIsSeeding(true);
    setSeedNotice(null);
    try {
      const res = await fetch('/api/seed-samples', { method: 'POST' });
      const data = await res.json();
      setSeedNotice(data.message || 'নমুনা ডেটা সফলভাবে লোড হয়েছে।');
      onRefreshStats();
    } catch (err: any) {
      setSeedNotice('নমুনা ডেটা লোড করতে সমস্যা হয়েছে।');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleDriveSync = async () => {
    setIsDriveSyncing(true);
    setDriveNotice('Google Drive সিংক শুরু হচ্ছে...');

    try {
      const res = await fetch('/api/drive/sync', { method: 'POST' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok && res.status !== 202) {
        throw new Error(data.error || 'Google Drive সিংক শুরু করা যায়নি।');
      }

      setDriveNotice('Google Drive সিংক চলছে... PDF ডাউনলোড/OCR ব্যাকগ্রাউন্ডে চলছে।');

      // The backend now returns immediately and processes PDFs in the
      // background. Poll the status endpoint instead of waiting on a long
      // HTTP request that could be terminated by a proxy timeout.
      let consecutiveErrors = 0;

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 2500));

        try {
          const statusRes = await fetch('/api/drive/status', { cache: 'no-store' });
          const status = await statusRes.json().catch(() => ({}));

          if (!statusRes.ok) {
            throw new Error(status.error || 'Drive sync status পাওয়া যাচ্ছে না।');
          }

          consecutiveErrors = 0;

          const run = status.currentRun || {};
          const discovered = Number((status.lastDiscovered?.male || 0) + (status.lastDiscovered?.female || 0));
          const current = status.currentDriveItem;

          if (status.running) {
            const currentText = current
              ? ` • এখন: ${current.sourceType === 'male' ? 'পুরুষ' : 'মহিলা'} — ${current.fileName}`
              : '';

            setDriveNotice(
              `Google Drive সিংক চলছে... আবিষ্কৃত: ${discovered.toLocaleString('bn-BD')}টি • এই রান: ${Number(run.attempted || 0).toLocaleString('bn-BD')}টি • ইনডেক্স: ${Number(run.indexed || 0).toLocaleString('bn-BD')}টি • ব্যর্থ: ${Number(run.failed || 0).toLocaleString('bn-BD')}টি${currentText}`
            );

            if (Number(run.attempted || 0) > 0 || Number(run.indexed || 0) > 0) {
              await onRefreshStats();
            }
            continue;
          }

          const summary = [
            'Google Drive সিংক সম্পন্ন হয়েছে।',
            `আবিষ্কৃত: ${discovered.toLocaleString('bn-BD')}টি`,
            `এই রান: ${Number(run.attempted || 0).toLocaleString('bn-BD')}টি`,
            `ইনডেক্স: ${Number(run.indexed || 0).toLocaleString('bn-BD')}টি`,
            `স্কিপ: ${Number(run.skipped || 0).toLocaleString('bn-BD')}টি`,
            `ডুপ্লিকেট: ${Number(run.duplicates || 0).toLocaleString('bn-BD')}টি`,
            `ব্যর্থ: ${Number(run.failed || 0).toLocaleString('bn-BD')}টি`
          ];
          setDriveNotice(summary.join(' • '));
          await onRefreshStats();
          break;
        } catch (pollErr: any) {
          consecutiveErrors++;
          if (consecutiveErrors >= 3) {
            throw new Error(
              pollErr?.message ||
              'সার্ভারের সাথে সংযোগ বিচ্ছিন্ন হয়েছে। Render Logs পরীক্ষা করো।'
            );
          }
          setDriveNotice('সিংক চলছে... সার্ভারের অগ্রগতি পাওয়া যাচ্ছে না, আবার চেষ্টা করা হচ্ছে।');
        }
      }
    } catch (err: any) {
      setDriveNotice(err?.message || 'Google Drive সিংক শুরু করতে সমস্যা হয়েছে। ০ রেজাল্ট দেখানো হয়নি—Render Logs পরীক্ষা করো।');
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '০ KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Voter Records */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500">মোট ভোটার রেকর্ড</span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">
              {stats?.totalRecords?.toLocaleString('bn-BD') || '০'}
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">
              FTS5 ইনডেক্স সক্রিয়
            </span>
          </div>
        </div>

        {/* Total PDF Documents */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500">ইনডেক্সকৃত PDF ফাইল</span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">
              {stats?.documentsCount?.toLocaleString('bn-BD') || '০'}
            </div>
            <span className="text-[11px] text-blue-600 font-medium">
              সর্বোচ্চ ২,৬০০ ফাইল সাপোর্ট
            </span>
          </div>
        </div>

        {/* Total Pages Processed */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500">মোট প্রসেসকৃত পৃষ্ঠা</span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">
              {stats?.totalPages?.toLocaleString('bn-BD') || '০'}
            </div>
            <span className="text-[11px] text-purple-600 font-medium">
              পৃষ্ঠা-অনুযায়ী নেভিগেশন
            </span>
          </div>
        </div>

        {/* Database Size */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500">ইনডেক্স ডাটাবেজ সাইজ</span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">
              {formatBytes(stats?.databaseSizeBytes)}
            </div>
            <span className="text-[11px] text-amber-600 font-medium">
              SQLite FTS5 অপ্টিমাইজড
            </span>
          </div>
        </div>
      </div>

      {/* Index Management & Export Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Data Export Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-emerald-700 font-bold text-base mb-1">
              <FileSpreadsheet className="w-5 h-5" />
              <h4>ভোটার ডেটা এক্সপোর্ট</h4>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              ইনডেক্স করা ভোটার তালিকা বাংলা ফন্ট (UTF-8 BOM) সহ Excel বা স্প্রেডশিটে ব্যবহারের জন্য সরাসরি CSV অথবা JSON ফাইল আকারে ডাউনলোড করুন।
            </p>

            <div className="space-y-2 text-xs text-slate-600 mb-6 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="font-semibold text-slate-800">এক্সপোর্টকৃত ফিল্ডসমূহ:</div>
              <p>নাম, ভোটার নং, পিতার নাম, মাতার নাম, জন্মতারিখ, ঠিকানা, ফাইলের নাম, পৃষ্ঠা, OCR Confidence</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/api/export/csv"
              download="bengali_voters_export.csv"
              className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center space-x-1.5"
            >
              <Download className="w-4 h-4" />
              <span>CSV ফাইল ডাউনলোড</span>
            </a>

            <a
              href="/api/export/json"
              download="bengali_voters_export.json"
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center space-x-1.5"
            >
              <Download className="w-4 h-4" />
              <span>JSON ফাইল ডাউনলোড</span>
            </a>
          </div>
        </div>

        {/* Database Health & Sample Seeder Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-slate-800 font-bold text-base mb-1">
              <Cpu className="w-5 h-5 text-emerald-600" />
              <h4>সিস্টেম স্থিতি ও নমুনা ডেটা</h4>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              যশোর সদর উপজেলার তেঘরিয়া ও হাকিমপুরের নমুনা ভোটার তালিকা পিডিএফ এবং সিন্থেটিক ডেটাসেট পুনরায় লোড করুন।
            </p>

            {driveNotice && (
              <div className={`mb-3 p-3 rounded-xl border text-xs flex items-start space-x-2 ${isDriveSyncing ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                <RefreshCw className={`w-4 h-4 shrink-0 ${isDriveSyncing ? 'animate-spin text-blue-600' : 'text-emerald-600'}`} />
                <span>{driveNotice}</span>
              </div>
            )}

            {seedNotice && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{seedNotice}</span>
              </div>
            )}

            <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 mb-4">
              <div className="flex items-center justify-between">
                <span>শেষ ইনডেক্সিং সময়:</span>
                <span className="font-semibold text-slate-800">
                  {stats?.lastIndexedAt ? new Date(stats.lastIndexedAt).toLocaleTimeString('bn-BD') : 'তথ্য নেই'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>ব্যর্থ ডকুমেন্ট সংখ্যা:</span>
                <span className="font-semibold text-slate-800">{stats?.failedCount || 0} টি</span>
              </div>
              <div className="flex items-center justify-between">
                <span>লোকাল প্রাইভেসি মোড:</span>
                <span className="font-semibold text-emerald-700">সক্রিয় (সম্পূর্ণ লোকাল প্রসেসিং)</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            <button
              onClick={handleDriveSync}
              disabled={isDriveSyncing}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <HardDrive className={`w-4 h-4 ${isDriveSyncing ? 'animate-pulse' : ''}`} />
              <span>{isDriveSyncing ? 'Google Drive সিংক চলছে...' : 'গুগল ড্রাইভ সিংক শুরু করুন'}</span>
            </button>

            <button
              onClick={handleSeedSamples}
              disabled={isSeeding || isDriveSyncing}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSeeding ? 'animate-spin text-emerald-600' : ''}`} />
              <span>নমুনা ভোটার তালিকা রি-লোড করুন</span>
            </button>
          </div>
        </div>
      </div>

      {/* Security & Privacy Card */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start space-x-3 text-xs text-emerald-900">
        <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block text-sm mb-0.5">লোকাল ডাটাবেজ ও সম্পূর্ণ গোপনীয়তা নীতি:</span>
          <span>
            সমস্ত আপলোড করা ভোটার তালিকা এবং সার্চ ইনডেক্স এই সিস্টেমের স্থানীয় SQLite ডাটাবেজে স্থায়ীভাবে সংরক্ষিত থাকে। কোনো ব্যক্তিগত ভোটার ডেটা তৃতীয় পক্ষের ক্লাউড সার্ভার বা পাবলিক এপিআইতে পাঠানো হয় না।
          </span>
        </div>
      </div>
    </div>
  );
};
