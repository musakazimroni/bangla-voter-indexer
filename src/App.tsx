import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header.tsx';
import { SearchForm } from './components/SearchForm.tsx';
import { VoterCard } from './components/VoterCard.tsx';
import { PdfViewerModal } from './components/PdfViewerModal.tsx';
import { FamilyModal } from './components/FamilyModal.tsx';
import { DocumentLibrary } from './components/DocumentLibrary.tsx';
import { IndexDashboard } from './components/IndexDashboard.tsx';
import { TestModeModal } from './components/TestModeModal.tsx';
import {
  VoterRecord,
  SearchFilters,
  DocumentInfo,
  IndexStats
} from './types.ts';
import {
  Search,
  FileSpreadsheet,
  Download,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Database,
  Layers,
  Sparkles
} from 'lucide-react';

const INITIAL_FILTERS: SearchFilters = {
  name: '',
  fatherName: '',
  motherName: '',
  dateOfBirth: '',
  voterNumber: '',
  query: '',
  upazila: '',
  union: '',
  village: '',
  searchMode: 'partial',
  page: 1,
  limit: 20
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'documents' | 'dashboard' | 'test'>('search');
  const [filters, setFilters] = useState<SearchFilters>(INITIAL_FILTERS);
  const [results, setResults] = useState<VoterRecord[]>([]);
  const [totalResults, setTotalResults] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTimeMs, setSearchTimeMs] = useState<number>(0);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Stats & Documents
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [stats, setStats] = useState<IndexStats | null>(null);

  // Modals
  const [pdfModal, setPdfModal] = useState<{
    isOpen: boolean;
    documentId: string;
    pageNumber: number;
    voter?: VoterRecord | null;
  }>({
    isOpen: false,
    documentId: '',
    pageNumber: 1,
    voter: null
  });

  const [familyModal, setFamilyModal] = useState<{
    isOpen: boolean;
    voter: VoterRecord | null;
  }>({
    isOpen: false,
    voter: null
  });

  // Fetch stats and documents list
  const fetchMetadata = useCallback(async () => {
    try {
      const [docsRes, statsRes] = await Promise.all([
        fetch('/api/documents'),
        fetch('/api/stats')
      ]);
      if (docsRes.ok) {
        const docsData = await docsRes.json();
        setDocuments(docsData);
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error('Error fetching metadata:', err);
    }
  }, []);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  // Execute Search
  const executeSearch = async (customFilters?: SearchFilters) => {
    const f = customFilters || filters;
    setIsLoading(true);
    setHasSearched(true);
    const start = performance.now();

    try {
      const queryParams = new URLSearchParams();
      if (f.name) queryParams.set('name', f.name.trim());
      if (f.fatherName) queryParams.set('fatherName', f.fatherName.trim());
      if (f.motherName) queryParams.set('motherName', f.motherName.trim());
      if (f.dateOfBirth) queryParams.set('dateOfBirth', f.dateOfBirth.trim());
      if (f.voterNumber) queryParams.set('voterNumber', f.voterNumber.trim());
      if (f.query) queryParams.set('query', f.query.trim());
      if (f.upazila) queryParams.set('upazila', f.upazila.trim());
      if (f.union) queryParams.set('union', f.union.trim());
      if (f.village) queryParams.set('village', f.village.trim());
      if (f.searchMode) queryParams.set('searchMode', f.searchMode);
      if (f.page) queryParams.set('page', f.page.toString());
      if (f.limit) queryParams.set('limit', f.limit.toString());

      const res = await fetch(`/api/search?${queryParams.toString()}`);
      const data = await res.json();

      setResults(data.results || []);
      setTotalResults(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setSearchTimeMs(Math.round(performance.now() - start));
    } catch (err) {
      console.error('Search request failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial auto-search on mount to showcase sample data immediately
  useEffect(() => {
    executeSearch(INITIAL_FILTERS);
  }, []);

  const handleClearFilters = () => {
    setFilters(INITIAL_FILTERS);
    executeSearch(INITIAL_FILTERS);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    const updated = { ...filters, page: newPage };
    setFilters(updated);
    executeSearch(updated);
  };

  const openPdfViewer = (documentId: string, pageNumber: number, voter?: VoterRecord | null) => {
    setPdfModal({
      isOpen: true,
      documentId,
      pageNumber: pageNumber || 1,
      voter: voter || null
    });
  };

  const openFamilyViewer = (voter: VoterRecord) => {
    setFamilyModal({
      isOpen: true,
      voter
    });
  };

  const handleApplyTestFilters = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    setActiveTab('search');
    executeSearch(newFilters);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        totalRecords={stats?.totalRecords || 0}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Tab 1: Search Tab */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            {/* Search Form */}
            <SearchForm
              filters={filters}
              setFilters={setFilters}
              onSearch={(custom) => executeSearch(custom)}
              isLoading={isLoading}
              onClear={handleClearFilters}
            />

            {/* Results Banner & Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white px-5 py-3.5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center space-x-2 text-sm text-slate-700">
                <span className="font-bold text-slate-900">
                  মোট {totalResults.toLocaleString('bn-BD')} টি
                </span>
                <span>ভোটার রেকর্ড পাওয়া গেছে</span>
                {searchTimeMs > 0 && (
                  <span className="text-xs text-slate-400 font-mono">
                    ({searchTimeMs} মিলি-সেকেন্ডে)
                  </span>
                )}
              </div>

              {totalResults > 0 && (
                <div className="flex items-center space-x-2">
                  <a
                    href={`/api/export/csv?${new URLSearchParams({
                      name: filters.name || '',
                      fatherName: filters.fatherName || '',
                      motherName: filters.motherName || '',
                      dateOfBirth: filters.dateOfBirth || '',
                      voterNumber: filters.voterNumber || '',
                      query: filters.query || '',
                      upazila: filters.upazila || '',
                      union: filters.union || '',
                      village: filters.village || '',
                      searchMode: filters.searchMode || 'partial'
                    }).toString()}`}
                    download="search_results.csv"
                    className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>ফলাফল CSV ডাউনলোড</span>
                  </a>
                </div>
              )}
            </div>

            {/* Results List / Grid */}
            {isLoading ? (
              <div className="py-16 text-center text-slate-500">
                <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm font-medium">ইনডেক্স থেকে ভোটার রেকর্ড খোঁজা হচ্ছে...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-lg mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center mb-3">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-900">কোনো ভোটার রেকর্ড পাওয়া যায়নি</h3>
                <p className="text-xs text-slate-500 mt-1 mb-5">
                  অন্য কোনো বানানে নাম, বাবার নাম অথবা আংশিক জন্মতারিখ বা ভোটার এলাকা দিয়ে অনুসন্ধান করার চেষ্টা করুন।
                </p>
                <button
                  onClick={handleClearFilters}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                >
                  ফিল্টার পরিষ্কার করে সব রেকর্ড দেখুন
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.map((voter) => (
                  <VoterCard
                    key={voter.id}
                    voter={voter}
                    onOpenPdf={openPdfViewer}
                    onFindFamily={openFamilyViewer}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between bg-white px-5 py-3 rounded-xl border border-slate-200 shadow-xs">
                <div className="text-xs text-slate-600">
                  পৃষ্ঠা <span className="font-bold text-slate-900">{filters.page}</span> / {totalPages}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePageChange((filters.page || 1) - 1)}
                    disabled={(filters.page || 1) <= 1}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handlePageChange((filters.page || 1) + 1)}
                    disabled={(filters.page || 1) >= totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-700"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Document Library */}
        {activeTab === 'documents' && (
          <DocumentLibrary
            documents={documents}
            onRefresh={fetchMetadata}
            onOpenPdf={(docId, page) => openPdfViewer(docId, page)}
          />
        )}

        {/* Tab 3: Index Dashboard */}
        {activeTab === 'dashboard' && (
          <IndexDashboard
            stats={stats}
            onRefreshStats={fetchMetadata}
          />
        )}

        {/* Tab 4: Test Mode */}
        {activeTab === 'test' && (
          <TestModeModal
            onOpenPdf={openPdfViewer}
            onApplyFilters={handleApplyTestFilters}
          />
        )}
      </main>

      {/* Modals */}
      {pdfModal.isOpen && (
        <PdfViewerModal
          documentId={pdfModal.documentId}
          initialPage={pdfModal.pageNumber}
          voter={pdfModal.voter}
          onClose={() => setPdfModal({ isOpen: false, documentId: '', pageNumber: 1, voter: null })}
        />
      )}

      {familyModal.isOpen && familyModal.voter && (
        <FamilyModal
          voter={familyModal.voter}
          onClose={() => setFamilyModal({ isOpen: false, voter: null })}
          onOpenPdf={openPdfViewer}
        />
      )}
    </div>
  );
}
