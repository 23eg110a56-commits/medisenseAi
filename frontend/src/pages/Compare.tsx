import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeftRight, Calendar, TrendingUp, TrendingDown, RefreshCw, Loader2,
  AlertTriangle, Info, Minus
} from 'lucide-react';
import api from '../services/api';
import { useTranslation } from '../hooks/useTranslation';

interface CompareBiomarker {
  name: string;
  unit: string;
  old_value: string;
  new_value: string;
  old_status: string | null;
  new_status: string;
  reference_range: string;
  difference: string;
  percentage_change: string;
  direction: 'increased' | 'decreased' | 'changed' | 'unchanged' | 'no change';
  status: string;
  comparable: boolean;
  reason: string;
}

interface ComparisonData {
  old_report_date: string;
  new_report_date: string;
  old_report_type: string;
  new_report_type: string;
  old_score: number | null;
  new_score: number | null;
  health_improvement_score: string;
  narrative: string;
  narrative_source: 'llm' | 'computed';
  biomarkers: CompareBiomarker[];
  incomparable: string[];
}

interface DropdownReport {
  id: string;
  filename: string;
  report_type: string;
  analysis_status?: string;
  created_at: string;
}

export const Compare: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();

  const id1 = searchParams.get('id1');
  const id2 = searchParams.get('id2');

  const [allReports, setAllReports] = useState<DropdownReport[]>([]);
  const [selectedId1, setSelectedId1] = useState(id1 || '');
  const [selectedId2, setSelectedId2] = useState(id2 || '');
  const [comparison, setComparison] = useState<ComparisonData | null>(null);

  const [loading, setLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllReports();
  }, []);

  useEffect(() => {
    if (id1 && id2) {
      fetchComparison(id1, id2);
    }
  }, [id1, id2]);

  const detailOf = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (detail?.message) return detail.message;
    return fallback;
  };

  const fetchAllReports = async () => {
    try {
      const res = await api.get('/reports/all');
      setAllReports(res.data);
    } catch (err) {
      setError(detailOf(err, 'Could not load your reports.'));
    } finally {
      setReportsLoading(false);
    }
  };

  const fetchComparison = async (rid1: string, rid2: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/reports/compare', {
        params: { report_id1: rid1, report_id2: rid2 },
      });
      setComparison(res.data);
    } catch (err) {
      setComparison(null);
      setError(detailOf(err, 'Could not compare these reports.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRunComparison = () => {
    if (!selectedId1 || !selectedId2) {
      setError('Select two reports to compare.');
      return;
    }
    if (selectedId1 === selectedId2) {
      setError('Select two different reports.');
      return;
    }
    setSearchParams({ id1: selectedId1, id2: selectedId2 });
  };

  // Comparing an unanalysed report cannot produce anything meaningful.
  const comparableReports = allReports.filter(r => r.analysis_status === 'analyzed');

  const directionStyle = (bm: CompareBiomarker) => {
    if (!bm.comparable) return 'text-slate-400';
    if (bm.direction === 'increased') return 'text-amber-600 dark:text-amber-400';
    if (bm.direction === 'decreased') return 'text-teal-600 dark:text-teal-400';
    return 'text-slate-400';
  };

  const DirectionIcon = ({ bm }: { bm: CompareBiomarker }) => {
    if (!bm.comparable) return <Minus className="h-4 w-4" />;
    if (bm.direction === 'increased') return <TrendingUp className="h-4 w-4" />;
    if (bm.direction === 'decreased') return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  const statusChip = (status: string | null) => {
    if (!status) return <span className="text-[10px] text-slate-400">—</span>;
    const style =
      status.toLowerCase() === 'normal'
        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400'
        : status.toLowerCase() === 'critical'
          ? 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400'
          : status.toLowerCase() === 'review'
            ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            : 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400';
    return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style}`}>{status}</span>;
  };

  const scoreChanged = comparison && comparison.health_improvement_score !== 'N/A';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <ArrowLeftRight className="h-8 w-8 text-primary-500" />
          {t('compareReports')}
        </h1>
        <p className="mt-1.5 text-sm text-slate-400 max-w-2xl">
          Compare results side by side across two dates. Deltas are only calculated when the same test
          appears in both reports with the same unit — anything else is listed as not comparable rather
          than estimated.
        </p>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-950/30 dark:bg-red-950/10 dark:text-red-300">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </span>
          <button onClick={() => setError(null)} className="font-bold hover:underline shrink-0">Dismiss</button>
        </div>
      )}

      {/* Selectors */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass flex flex-col md:flex-row md:items-end gap-4">
        <div className="w-full md:flex-1">
          <label htmlFor="cmp1" className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            Baseline report (older)
          </label>
          <select
            id="cmp1"
            value={selectedId1}
            onChange={(e) => setSelectedId1(e.target.value)}
            disabled={reportsLoading}
            className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
          >
            <option value="">-- Choose report --</option>
            {comparableReports.map(r => (
              <option key={r.id} value={r.id}>
                {r.filename} ({new Date(r.created_at).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>

        <div className="hidden md:flex h-12 items-center justify-center text-slate-300 dark:text-slate-600">
          <ArrowLeftRight className="h-5 w-5" />
        </div>

        <div className="w-full md:flex-1">
          <label htmlFor="cmp2" className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            Follow-up report (newer)
          </label>
          <select
            id="cmp2"
            value={selectedId2}
            onChange={(e) => setSelectedId2(e.target.value)}
            disabled={reportsLoading}
            className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
          >
            <option value="">-- Choose report --</option>
            {comparableReports.map(r => (
              <option key={r.id} value={r.id}>
                {r.filename} ({new Date(r.created_at).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleRunComparison}
          disabled={loading || reportsLoading}
          className="w-full md:w-auto flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-primary-500/10 hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Compare
        </button>
      </div>

      {allReports.length > 0 && comparableReports.length === 0 && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-950/30 dark:bg-amber-950/10 dark:text-amber-300">
          None of your reports have been analysed yet, so there is nothing to compare. Open a report,
          review its extracted text and run the analysis first.
        </p>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-500" />
            <p className="mt-2 text-sm text-slate-400">Matching results across both reports…</p>
          </div>
        </div>
      ) : (
        comparison && (
          <div className="space-y-8">
            {/* Scores */}
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 text-center">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-center gap-1">
                  <Calendar className="h-4 w-4" /> Baseline
                </span>
                <p className="mt-1 text-[10px] text-slate-400">{comparison.old_report_date}</p>
                <p className="mt-4 text-5xl font-extrabold text-slate-800 dark:text-white">
                  {comparison.old_score ?? '—'}
                </p>
                <p className="mt-2 text-[10px] text-slate-400">{comparison.old_report_type}</p>
              </div>

              <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-primary-50 to-teal-50 p-6 dark:border-slate-800 dark:from-navy-800 dark:to-teal-950/20 text-center">
                <span className="text-xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400">
                  Index change
                </span>
                <p className="mt-1 text-[10px] text-slate-400">App heuristic, not a clinical measure</p>
                <p className={`mt-4 text-5xl font-extrabold ${
                  !scoreChanged
                    ? 'text-slate-400'
                    : parseInt(comparison.health_improvement_score) >= 0
                      ? 'text-emerald-500'
                      : 'text-red-500'
                }`}>
                  {scoreChanged ? comparison.health_improvement_score : '—'}
                </p>
                {!scoreChanged && (
                  <p className="mt-2 text-[10px] leading-snug text-slate-400">
                    No score comparison — at least one report has no parsed results.
                  </p>
                )}
              </div>

              <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 text-center">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-center gap-1">
                  <Calendar className="h-4 w-4" /> Follow-up
                </span>
                <p className="mt-1 text-[10px] text-slate-400">{comparison.new_report_date}</p>
                <p className="mt-4 text-5xl font-extrabold text-slate-800 dark:text-white">
                  {comparison.new_score ?? '—'}
                </p>
                <p className="mt-2 text-[10px] text-slate-400">{comparison.new_report_type}</p>
              </div>
            </div>

            {/* Narrative */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-700">
                <h3 className="font-bold text-slate-800 dark:text-slate-100">Timeline comparison</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {comparison.narrative_source === 'llm' ? 'AI-written summary' : 'Computed from the documents'}
                </span>
              </div>
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {comparison.narrative}
              </p>
            </div>

            {/* Biomarker table */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass overflow-hidden">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 pb-3 dark:border-slate-700 mb-4">
                Result-by-result comparison
              </h3>

              {comparison.biomarkers.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  The newer report contains no parsed results, so there is nothing to line up against
                  the baseline.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead>
                      <tr className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-700">
                        <th className="pb-3">Test</th>
                        <th className="pb-3">Baseline</th>
                        <th className="pb-3">Follow-up</th>
                        <th className="pb-3">Difference</th>
                        <th className="pb-3">Change</th>
                        <th className="pb-3">Printed range</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {comparison.biomarkers.map((bm, index) => (
                        <tr key={index} className={`align-top hover:bg-slate-50/50 dark:hover:bg-navy-700/10 ${!bm.comparable ? 'opacity-70' : ''}`}>
                          <td className="py-4 pr-3 font-bold text-slate-800 dark:text-slate-200">
                            {bm.name}
                            {!bm.comparable && bm.reason && (
                              <span className="mt-1 flex items-start gap-1 text-[10px] font-normal text-amber-600 dark:text-amber-400">
                                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                                {bm.reason}
                              </span>
                            )}
                          </td>
                          <td className="py-4 pr-3 text-xs font-semibold">
                            <span className="flex items-center gap-1.5">
                              {bm.old_value} {bm.unit}
                              {statusChip(bm.old_status)}
                            </span>
                          </td>
                          <td className="py-4 pr-3 text-xs font-semibold text-slate-900 dark:text-white">
                            <span className="flex items-center gap-1.5">
                              {bm.new_value} {bm.unit}
                              {statusChip(bm.new_status)}
                            </span>
                          </td>
                          <td className={`py-4 pr-3 text-xs font-extrabold ${directionStyle(bm)}`}>
                            <span className="flex items-center gap-1">
                              <DirectionIcon bm={bm} />
                              {bm.difference}
                            </span>
                          </td>
                          <td className={`py-4 pr-3 text-xs font-extrabold ${directionStyle(bm)}`}>
                            {bm.percentage_change}
                          </td>
                          <td className="py-4 text-[10px] text-slate-400">
                            {bm.reference_range || 'Not printed'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {comparison.incomparable.length > 0 && (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-navy-900/40">
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Not compared ({comparison.incomparable.length})
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {comparison.incomparable.join(', ')} — missing from one of the reports, or recorded
                    in a different unit, or not a numeric result. These are reported as gaps rather
                    than filled in.
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
};
