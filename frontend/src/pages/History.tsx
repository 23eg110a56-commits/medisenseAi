import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  History as HistoryIcon, Search, Trash2, ArrowLeftRight, 
  Calendar, Eye, ChevronRight, Filter, Info, Loader2 
} from 'lucide-react';
import api from '../services/api';
import { useTranslation } from '../hooks/useTranslation';

interface Biomarker {
  name: string;
  value: string;
  status: string;
}

interface Report {
  id: string;
  filename: string;
  report_type: string;
  summary: string;
  health_score: number | null;
  analysis_status?: string;
  biomarkers: Biomarker[];
  created_at: string;
}

export const History: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  
  // Selection states for comparison
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await api.get('/reports/all');
      setReports(res.data);
      setError(null);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not load your medical history.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("Delete this report permanently? Its analysis, chat history and any share links are removed too.")) {
      return;
    }
    
    try {
      await api.delete(`/reports/delete/${id}`);
      setReports(prev => prev.filter(r => r.id !== id));
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
      setError(null);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not delete this report.');
    }
  };

  const handleSelectForCompare = (e: React.MouseEvent, report: Report) => {
    e.stopPropagation();
    const id = report.id;
    if (report.analysis_status !== 'analyzed') {
      setError(`'${report.filename}' has not been analysed yet, so there are no results to compare.`);
      return;
    }
    setError(null);
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      }
      if (prev.length >= 2) {
        setError("You can compare two reports at a time. Uncheck one first.");
        return prev;
      }
      return [...prev, id];
    });
  };

  const triggerComparison = () => {
    if (selectedIds.length !== 2) return;
    navigate(`/compare?id1=${selectedIds[0]}&id2=${selectedIds[1]}`);
  };

  // Extract unique report types in dataset for filter dropdown
  const reportTypes = [
    'All',
    ...Array.from(new Set(
      reports.filter(r => r.analysis_status === 'analyzed').map(r => r.report_type)
    )),
  ];

  // Apply search/filters
  const filteredReports = reports.filter(r => {
    const matchesSearch = r.filename.toLowerCase().includes(search.toLowerCase()) || 
                          r.report_type.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'All' || r.report_type === filterType;
    return matchesSearch && matchesType;
  });

  if (loading) {
     return (
       <div className="flex h-96 items-center justify-center">
         <div className="text-center">
           <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-500" />
           <p className="mt-2 text-sm text-slate-400">Retrieving your medical history...</p>
         </div>
       </div>
     );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <HistoryIcon className="h-8 w-8 text-primary-500" />
            {t('historyTimeline')}
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Search, filter, or delete previous reports. Check two boxes to compare biological markers over time.
          </p>
        </div>
        
        {/* Quick compare banner */}
        {selectedIds.length === 2 && (
          <button
            onClick={triggerComparison}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/15 hover:scale-105 transition-transform shrink-0"
          >
            <ArrowLeftRight className="h-4.5 w-4.5" />
            Compare Selected ({selectedIds.length})
          </button>
        )}
      </div>

      {/* Inline error / validation feedback */}
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-950/30 dark:bg-red-950/10 dark:text-red-300">
          <span className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </span>
          <button onClick={() => setError(null)} className="font-bold hover:underline shrink-0">Dismiss</button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
        {/* Search */}
        <div className="relative w-full sm:flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search report name or type..."
            className="w-full rounded-xl border border-slate-100 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-primary-500 focus:bg-white dark:border-slate-800 dark:bg-navy-900 dark:text-white"
          />
        </div>
        
        {/* Dropdown Filter */}
        <div className="relative w-full sm:w-48 flex items-center gap-1.5 bg-slate-50 dark:bg-navy-900 border border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2.5">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full text-sm outline-none bg-transparent dark:text-white"
          >
            {reportTypes.map((type, idx) => (
              <option key={idx} value={type}>{type}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main timeline listing */}
      {filteredReports.length === 0 ? (
        <div className="rounded-3xl border border-slate-100 bg-white p-12 text-center dark:border-slate-800 dark:bg-navy-800">
          <Info className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm text-slate-500">No records found matching your filters.</p>
        </div>
      ) : (
        <div className="relative border-l-2 border-slate-200 pl-6 space-y-6 dark:border-slate-800">
          {filteredReports.map((report) => {
            const isSelected = selectedIds.includes(report.id);
            const analysed = report.analysis_status === 'analyzed';
            const date = new Date(report.created_at);
            
            return (
              <div
                key={report.id}
                className="relative group cursor-pointer hover:scale-[1.01] transition-transform"
                onClick={() => navigate(`/analysis/${report.id}`)}
              >
                {/* Timeline node */}
                <div className={`absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-slate-100 dark:ring-navy-900 ${
                  analysed ? 'bg-primary-500' : 'bg-amber-400'
                }`}></div>

                <div className="rounded-3xl border border-slate-100 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
                  
                  {/* Left block info */}
                  <div className="flex items-start gap-4">
                    {/* Compare Checkbox */}
                    <button
                      onClick={(e) => handleSelectForCompare(e, report)}
                      title={analysed ? 'Select for comparison' : 'Not analysed yet — no results to compare'}
                      className={`mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-white transition-all ${
                        isSelected 
                          ? 'border-primary-500 bg-primary-500' 
                          : analysed
                            ? 'border-slate-300 hover:border-primary-400 bg-white dark:bg-navy-900 dark:border-slate-700'
                            : 'border-slate-200 bg-slate-50 text-slate-300 dark:bg-navy-900 dark:border-slate-800'
                      }`}
                    >
                      {isSelected && <span className="text-[10px] font-bold">✓</span>}
                    </button>
                    
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary-500">
                          {report.report_type}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {date.toLocaleDateString(undefined, { dateStyle: 'medium' })}
                        </span>
                        {!analysed && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:bg-amber-950/20 dark:text-amber-400">
                            {report.analysis_status === 'extraction_failed' ? 'No text extracted' : 'Awaiting text review'}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 font-bold text-slate-800 dark:text-slate-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                        {report.filename}
                      </h3>
                      <p className="mt-1 text-xs text-slate-400 max-w-xl line-clamp-2 leading-relaxed">
                        {analysed
                          ? report.summary
                          : 'Review the extracted text and run the analysis to see results.'}
                      </p>
                    </div>
                  </div>

                  {/* Right block Actions / metrics */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t border-slate-50 pt-3 sm:border-t-0 sm:pt-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">Health Index</span>
                      {report.health_score === null || report.health_score === undefined ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-extrabold text-slate-400 dark:bg-slate-800">
                          —
                        </span>
                      ) : (
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                          report.health_score >= 85 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400' :
                          report.health_score >= 70 ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/20 dark:text-primary-400' :
                          'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400'
                        }`}>
                          {report.health_score}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleDelete(e, report.id)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20 dark:hover:text-red-400 transition-colors"
                        title="Delete Report"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                      <ChevronRight className="h-5 w-5 text-slate-400" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
