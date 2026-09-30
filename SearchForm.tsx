import React, { useState, useEffect } from 'react';
import { Search, X, Filter, Calendar, User, Users, Hash, FileSearch, MapPin, Sparkles } from 'lucide-react';
import { SearchFilters, SearchMode } from '../types.ts';

// জন্মতারিখের জন্য Reusable কম্পোনেন্ট
const DateOfBirthSelect: React.FC<{ value: string; onChange: (val: string) => void }> = ({ value, onChange }) => {
  const [year, setLocalYear] = useState('');
  const [month, setLocalMonth] = useState('');
  const [day, setLocalDay] = useState('');

  useEffect(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        setLocalYear(parts[0]);
        setLocalMonth(parseInt(parts[1], 10).toString());
        setLocalDay(parseInt(parts[2], 10).toString());
      }
    } else {
      setLocalYear('');
      setLocalMonth('');
      setLocalDay('');
    }
  }, [value]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1900 + 1 }, (_, i) => currentYear - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const getDaysInMonth = (m: string, y: string) => {
    if (!m) return 31;
    const monthInt = parseInt(m, 10);
    const yearInt = parseInt(y, 10) || new Date().getFullYear();
    return new Date(yearInt, monthInt, 0).getDate();
  };

  const daysCount = getDaysInMonth(month, year);
  const days = Array.from({ length: daysCount }, (_, i) => i + 1);

  const updateValue = (y: string, m: string, d: string) => {
    if (y && m && d) {
      onChange(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    } else {
      onChange('');
    }
  };

  const handleDayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const d = e.target.value;
    setLocalDay(d);
    updateValue(year, month, d);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const m = e.target.value;
    setLocalMonth(m);
    const maxDays = getDaysInMonth(m, year);
    let d = day;
    if (day && parseInt(day, 10) > maxDays) {
      d = maxDays.toString();
      setLocalDay(d);
    }
    updateValue(year, m, d);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const y = e.target.value;
    setLocalYear(y);
    const maxDays = getDaysInMonth(month, y);
    let d = day;
    if (day && parseInt(day, 10) > maxDays) {
      d = maxDays.toString();
      setLocalDay(d);
    }
    updateValue(y, month, d);
  };

  return (
    <div className="flex gap-2">
      <select
        value={day}
        onChange={handleDayChange}
        className="w-1/3 pl-2 pr-1 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-all text-slate-900"
      >
        <option value="">দিন ▼</option>
        {days.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <select
        value={month}
        onChange={handleMonthChange}
        className="w-1/3 pl-2 pr-1 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-all text-slate-900"
      >
        <option value="">মাস ▼</option>
        {months.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <select
        value={year}
        onChange={handleYearChange}
        className="w-1/3 pl-2 pr-1 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-all text-slate-900"
      >
        <option value="">বছর ▼</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
};

// ডাটাবেস
const locationData: any = {
  "ঝিকরগাছা": {
    "বাঁকড়া (BANKRA)": [], "গদখালী (GADKHALI)": [], "গঙ্গানন্দপুর (GANGANANDAPUR)": [],
    "হাজিরবাগ (HAJIRBAGH)": [], "ঝিকরগাছা (JHIKARGACHHA)": [], "মাগুরা (MAGURA)": [],
    "নাভারণ (NABHARAN)": [], "নির্বাসখোলা (NIBASKHOLA)": [], "পানিসারা (PANISARA)": [],
    "পৌরসভা (POROSHOVA)": [], "শংকরপুর (SHANKARPUR)": [], "শিমুলিয়া (SHIMULIA)": []
  },
  "মনিরামপুর": {
    "ভোজগাতী (BHOJGATI)": [], "চালুয়াহাটী (CHALUAHATI)": [], "ঢাকুরিয়া (DHAKURIA)": [],
    "দুর্বাডাঙ্গা (DURBADANGA)": [], "হরিদাসকাটি (HARIDASKATI)": [], "হরিহরনগর (HARIHARNAGAR)": [],
    "ঝাঁপা (JHANPA)": [], "কাশিমপুর (KASHIMNAGAR)": [], "খানপুর (KHANPUR)": [], "খেদাপাড়া (KHEDA PARA)": [],
    "কুলটিয়া (KULTIA)": [], "মণিরামপুর (MANIRAMPUR)": [], "মনোহরপুর (MANOHARPUR)": [],
    "মশিম্নগর (MASWIMNAGAR)": [], "নেহালপুর (NEHALPUR)": [], "রোহিতা (ROHITA)": [], "শ্যামকুড় (SHYAMKUR)": [],
    "ওয়ার্ড ০১ (WARD NO-01)": [], "ওয়ার্ড ০২ (WARD NO-02)": [], "ওয়ার্ড ০৩ (WARD NO-03)": [],
    "ওয়ার্ড ০৪ (WARD NO-04)": [], "ওয়ার্ড ০৫ (WARD NO-05)": [], "ওয়ার্ড ০৬ (WARD NO-06)": [],
    "ওয়ার্ড ০৭ (WARD NO-07)": [], "ওয়ার্ড ০৮ (WARD NO-08)": [], "ওয়ার্ড ০৯ (WARD NO-09)": []
  },
  "কেশবপুর": {
    "বিদ্যানন্দকাটি (BIDYANANDAKATI)": [], "গৌরিঘোনা (GAURIGHONA)": [], "হাসানপুর (HASANPUR)": [],
    "কেশবপুর (KESHABPUR)": [], "মজিদপুর (MAJIDPUR)": [], "মঙ্গলকোট (MANGALKOT)": [],
    "পাঁজিয়া (PANJIA)": [], "সাগরদাঁড়ি (SAGARDARI)": [], "সাতবাড়িয়া (SATBARIA)": [],
    "সুফলাকাটি (SUFALAKATI)": [], "ত্রিমোহিনী (TRIMOHINI)": [],
    "ওয়ার্ড ০১ (WARD NO-01)": [], "ওয়ার্ড ০২ (WARD NO-02)": [], "ওয়ার্ড ০৩ (WARD NO-03)": [],
    "ওয়ার্ড ০৪ (WARD NO-04)": [], "ওয়ার্ড ০৫ (WARD NO-05)": [], "ওয়ার্ড ০৬ (WARD NO-06)": [],
    "ওয়ার্ড ০৭ (WARD NO-07)": [], "ওয়ার্ড ০৮ (WARD NO-08)": [], "ওয়ার্ড ০৯ (WARD NO-09)": []
  },
  "চৌগাছা": {
    "ফুলসারা (1. PHULSARA)": [], "পাশাপোল (2. PASHAPOLE)": [], "সিংহঝুলী (3. SINGHAJHULI)": [],
    "ধূলিয়ানী (4. DHULIANI)": [], "চৌগাছা (5. CHAUGACHHA)": [], "জগদীশপুর (6. JAGADISHPUR)": [],
    "পাতিবিলা (7. PATIBILA)": [], "হাকিমপুর (8. HAKIMPUR)": [], "স্বরূপদাহ (9. SWARUPDAHA)": [],
    "নারায়ণপুর (10. NARAYANPUR)": [], "শুকপুকুরিয়া (11. SUKPUKHURIA)": [], "পৌরসভা (POUROSHOVA)": []
  },
  "শার্শা": {
    "বাগআঁচড়া (BAGACHRA)": [], "বাহাদুরপুর (BAHADURPUR)": [], "বেনাপোল (BENAPOLE)": [],
    "ডিহি (DIHI)": [], "গোগা (GOGA)": [], "কায়বা (KAYBA)": [],
    "লক্ষণপুর (LAKSHMANPUR)": [], "নিজামপুর (NIZAMPUR)": [], "পুটখালী (PUTKHALI)": [],
    "শার্শা (SHARSHA)": [], "উলাশী (ULASHI)": [],
    "ওয়ার্ড ০১ (WARD NO-01)": [], "ওয়ার্ড ০২ (WARD NO-02)": [], "ওয়ার্ড ০৩ (WARD NO-03)": [],
    "ওয়ার্ড ০৪ (WARD NO-04)": [], "ওয়ার্ড ০৫ (WARD NO-05)": [], "ওয়ার্ড ০৬ (WARD NO-06)": [],
    "ওয়ার্ড ০৭ (WARD NO-07)": [], "ওয়ার্ড ০৮ (WARD NO-08)": [], "ওয়ার্ড ০৯ (WARD NO-09)": []
  },
  "যশোর সদর": {
    "আরবপুর (ARABPUR)": [], "চাঁচড়া (CHANCHRA)": [], "চূড়ামনকাটি (CHURAMANKATI)": [],
    "দেয়াড়া (DEARA)": ["তেঘরিয়া", "হাকিমপুর"], "ফতেপুর (FATHEPUR)": [], "হৈবতপুর (HAIBATPUR)": [], "ইছালী (ICHHALI)": [],
    "যশোর ক্যান্টনমেন্ট (JESSORE CANTONMENT)": [], "কচুয়া (KACHUA)": [], "কাশিমপুর (KASHIMPUR)": [],
    "লেবুতলা (LEBUTALA)": [], "নরেন্দ্রপুর (NARENDRAPUR)": [], "নওয়াপাড়া (NOAPARA)": [],
    "রামনগর (RAMNAGAR)": [], "উপশহর (UPASAHAR)": [],
    "ওয়ার্ড ০১ (WARD NO-01)": [], "ওয়ার্ড ০২ (WARD NO-02)": [], "ওয়ার্ড ০৩ (WARD NO-03)": [],
    "ওয়ার্ড ০৪ (WARD NO-04)": [], "ওয়ার্ড ০৫ (WARD NO-05)": [], "ওয়ার্ড ০৬ (WARD NO-06)": [],
    "ওয়ার্ড ০৭ (WARD NO-07)": [], "ওয়ার্ড ০৮ (WARD NO-08)": [], "ওয়ার্ড ০৯ (WARD NO-09)": []
  }
};

interface SearchFormProps {
  filters: SearchFilters;
  setFilters: React.Dispatch<React.SetStateAction<SearchFilters>>;
  onSearch: (customFilters?: SearchFilters) => void;
  isLoading: boolean;
  onClear: () => void;
}

export const SearchForm: React.FC<SearchFormProps> = ({ filters, setFilters, onSearch, isLoading, onClear }) => {

  const handleInputChange = (field: keyof SearchFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [field]: value, page: 1 }));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch();
  };

  const triggerPresetSearch = (preset: Partial<SearchFilters>) => {
    const updated: SearchFilters = {
      ...filters,
      name: '', fatherName: '', motherName: '', dateOfBirth: '', voterNumber: '', query: '',
      upazila: '', union: '', village: '', page: 1,
      ...preset
    };
    
    // স্টেটে নতুন ডেটাগুলো সেট করা হচ্ছে এবং সাথে সাথে সার্চ কল করা হচ্ছে
    setFilters(updated);
    onSearch(updated);
  };

  const currentUpazila = filters.upazila || '';
  const currentUnion = filters.union || '';
  
  const unionFullKey = currentUpazila && currentUnion 
    ? Object.keys(locationData[currentUpazila] || {}).find(k => k.split(' (')[0] === currentUnion)
    : null;
    
  const villageList = unionFullKey ? locationData[currentUpazila][unionFullKey] : [];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-700 to-teal-800 px-6 py-6 text-white">
        <div className="max-w-3xl">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-1">
            ভোটার রেকর্ড অনুসন্ধান করুন
          </h2>
          <p className="text-emerald-100 text-sm">
            বাংলা বা ইংরেজি সংখ্যায় নাম, পিতা-মাতার নাম অথবা জন্মতারিখ লিখে সাথে সাথে সংশ্লিষ্ট PDF পেজসহ খুঁজুন
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-emerald-200 font-medium flex items-center">
            <Sparkles className="w-3.5 h-3.5 mr-1 text-emerald-300" />
            দ্রুত টেস্ট কোয়েরি:
          </span>
          {[
            { label: 'সাদিয়া সুলতানা মেঘলা', filter: { name: 'সাদিয়া সুলতানা মেঘলা' } },
            { label: 'মুসা কাজীম', filter: { name: 'মুসা কাজীম' } },
            { label: 'পিতা: আব্দুল জব্বার লাভলু', filter: { fatherName: 'আব্দুল জব্বার লাভলু' } },
            { label: 'মাতা: মমতাজ বেগম', filter: { motherName: 'মমতাজ বেগম' } },
            { label: 'জন্মতারিখ: 14/11/2004', filter: { dateOfBirth: '2004-11-14' } }
          ].map((item, idx) => (
            <button
              key={idx} type="button" onClick={() => triggerPresetSearch(item.filter)}
              className="text-xs bg-emerald-800/80 hover:bg-white hover:text-emerald-900 text-emerald-50 px-2.5 py-1 rounded-md transition-colors border border-emerald-600/60 font-medium"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleFormSubmit} className="p-6 space-y-5">
        
        {/* --- উপজেলা, ইউনিয়ন এবং গ্রাম ড্রপডাউন --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 flex items-center">
              <MapPin className="w-3.5 h-3.5 mr-1 text-emerald-600" /> উপজেলা 
            </label>
            <select
              value={currentUpazila}
              onChange={(e) => setFilters(prev => ({ ...prev, upazila: e.target.value, union: '', village: '', page: 1 }))}
              className="w-full pl-3.5 pr-8 py-2.5 text-sm bg-slate-50 border border-emerald-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-all text-slate-900"
            >
              <option value="">-- সব উপজেলা --</option>
              {Object.keys(locationData).map(upazila => <option key={upazila} value={upazila}>{upazila}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 flex items-center">
              <MapPin className="w-3.5 h-3.5 mr-1 text-emerald-600" /> ইউনিয়ন / পৌরসভা
            </label>
            <select
              value={currentUnion}
              onChange={(e) => setFilters(prev => ({ ...prev, union: e.target.value, village: '', page: 1 }))}
              disabled={!currentUpazila}
              className="w-full pl-3.5 pr-8 py-2.5 text-sm bg-slate-50 border border-emerald-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-all text-slate-900 disabled:opacity-50 disabled:bg-slate-100"
            >
              <option value="">-- সব ইউনিয়ন --</option>
              {currentUpazila && Object.keys(locationData[currentUpazila]).map((unionKey) => {
                const unionNameOnly = unionKey.split(' (')[0];
                return <option key={unionKey} value={unionNameOnly}>{unionKey}</option>
              })}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 flex items-center">
              <MapPin className="w-3.5 h-3.5 mr-1 text-emerald-600" /> গ্রাম / ভোটার এলাকা
            </label>
            <select
              value={filters.village || ''}
              onChange={(e) => handleInputChange('village', e.target.value)}
              disabled={!currentUnion || villageList.length === 0}
              className="w-full pl-3.5 pr-8 py-2.5 text-sm bg-slate-50 border border-emerald-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-all text-slate-900 disabled:opacity-50 disabled:bg-slate-100"
            >
              <option value="">-- সব গ্রাম --</option>
              {villageList.map((village: string) => <option key={village} value={village}>{village}</option>)}
            </select>
          </div>
        </div>

        {/* Main Search Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 flex items-center">
              <User className="w-3.5 h-3.5 mr-1 text-emerald-600" /> ভোটারের নাম
            </label>
            <div className="relative">
              <input
                type="text" placeholder="যেমন: সাদিয়া সুলতানা মেঘলা, মুসা কাজীম" value={filters.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="w-full pl-3.5 pr-8 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-all text-slate-900"
              />
              {filters.name && <button type="button" onClick={() => handleInputChange('name', '')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 flex items-center">
              <Calendar className="w-3.5 h-3.5 mr-1 text-emerald-600" /> জন্মতারিখ
            </label>
            <DateOfBirthSelect value={filters.dateOfBirth || ''} onChange={(val) => handleInputChange('dateOfBirth', val)} />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 flex items-center">
              <Users className="w-3.5 h-3.5 mr-1 text-emerald-600" /> পিতার নাম
            </label>
            <div className="relative">
              <input
                type="text" placeholder="যেমন: আব্দুল জব্বার লাভলু" value={filters.fatherName || ''}
                onChange={(e) => handleInputChange('fatherName', e.target.value)}
                className="w-full pl-3.5 pr-8 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-all text-slate-900"
              />
              {filters.fatherName && <button type="button" onClick={() => handleInputChange('fatherName', '')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 flex items-center">
              <Users className="w-3.5 h-3.5 mr-1 text-emerald-600" /> মাতার নাম
            </label>
            <div className="relative">
              <input
                type="text" placeholder="যেমন: মমতাজ বেগম" value={filters.motherName || ''}
                onChange={(e) => handleInputChange('motherName', e.target.value)}
                className="w-full pl-3.5 pr-8 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-all text-slate-900"
              />
              {filters.motherName && <button type="button" onClick={() => handleInputChange('motherName', '')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 flex items-center">
              <Hash className="w-3.5 h-3.5 mr-1 text-emerald-600" /> ভোটার নম্বর
            </label>
            <div className="relative">
              <input
                type="text" placeholder="যেমন: ৪১০৬৯২২৮৮৯০২" value={filters.voterNumber || ''}
                onChange={(e) => handleInputChange('voterNumber', e.target.value)}
                className="w-full pl-3.5 pr-8 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-all text-slate-900"
              />
              {filters.voterNumber && <button type="button" onClick={() => handleInputChange('voterNumber', '')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 flex items-center">
              <FileSearch className="w-3.5 h-3.5 mr-1 text-emerald-600" /> সার্বিক কি-ওয়ার্ড / ঠিকানা
            </label>
            <div className="relative">
              <input
                type="text" placeholder="ম্যানুয়ালি কিছু খুঁজলে এখানে লিখুন" value={filters.query || ''}
                onChange={(e) => handleInputChange('query', e.target.value)}
                className="w-full pl-3.5 pr-8 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-all text-slate-900"
              />
              {filters.query && <button type="button" onClick={() => handleInputChange('query', '')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
            </div>
          </div>
        </div>

        {/* Search Mode & Action Bar */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-600 flex items-center">
              <Filter className="w-3.5 h-3.5 mr-1 text-slate-400" /> সার্চ মোড:
            </span>
            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              {[
                { id: 'partial', label: 'আংশিক মিল' }, { id: 'exact', label: 'হুবহু মিল' }, { id: 'fuzzy', label: 'বানান সহনশীল' }
              ].map((mode) => (
                <button
                  key={mode.id} type="button" onClick={() => handleInputChange('searchMode', mode.id as SearchMode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filters.searchMode === mode.id ? 'bg-white text-emerald-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end">
            <button
              type="button" onClick={onClear}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              ফিল্টার মুছুন
            </button>
            <button
              type="submit"
              id="submit-search-btn"
              disabled={isLoading}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all flex items-center space-x-2 disabled:opacity-60"
            >
              {isLoading ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>অনুসন্ধান চলছে...</span></>
              ) : (
                <><Search className="w-4 h-4" /><span>অনুসন্ধান করুন</span></>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};