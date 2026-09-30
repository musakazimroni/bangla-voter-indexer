import React from 'react';
import { Search, FileText, BarChart3, FlaskConical, Database, ShieldCheck } from 'lucide-react';

interface HeaderProps {
  activeTab: 'search' | 'documents' | 'dashboard' | 'test';
  setActiveTab: (tab: 'search' | 'documents' | 'dashboard' | 'test') => void;
  totalRecords: number;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, totalRecords }) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18">
          {/* Logo & Bengali Main Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('search')}>
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm ring-4 ring-emerald-50">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  বাংলা ভোটার লিস্ট সার্চ
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <ShieldCheck className="w-3 h-3 mr-1 text-emerald-700" />
                  সার্চ ইনডেক্স সক্রিয়
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden md:block">
                হাজার হাজার PDF ফাইলের মধ্যে নাম, জন্মতারিখ, বাবার নাম বা মায়ের নাম দিয়ে দ্রুত খুঁজুন
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 sm:space-x-2">
            <button
              id="nav-search-tab"
              onClick={() => setActiveTab('search')}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'search'
                  ? 'bg-emerald-50 text-emerald-700 font-semibold shadow-xs ring-1 ring-emerald-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>অনুসন্ধান</span>
            </button>

            <button
              id="nav-documents-tab"
              onClick={() => setActiveTab('documents')}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'documents'
                  ? 'bg-emerald-50 text-emerald-700 font-semibold shadow-xs ring-1 ring-emerald-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>ডকুমেন্ট লাইব্রেরি</span>
            </button>

            <button
              id="nav-dashboard-tab"
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-emerald-50 text-emerald-700 font-semibold shadow-xs ring-1 ring-emerald-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">ইনডেক্স স্ট্যাটাস</span>
              <span className="sm:hidden">স্ট্যাটাস</span>
            </button>

            <button
              id="nav-test-tab"
              onClick={() => setActiveTab('test')}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'test'
                  ? 'bg-emerald-50 text-emerald-700 font-semibold shadow-xs ring-1 ring-emerald-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FlaskConical className="w-4 h-4" />
              <span>টেস্ট মোড</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};
