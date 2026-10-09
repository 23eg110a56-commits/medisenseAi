import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  FileText, Activity, AlertTriangle, CheckCircle, Info, 
  Calendar, Heart, ShieldAlert, Loader2, AlertCircle 
} from 'lucide-react';
import api from '../services/api';

interface Biomarker {
  name: string;
  value: string;
  unit: string;
  status: string;
  reference_range: string;
  explanation: string;
  notes?: string[];
}

interface SharedReport {
  filename: string;
  report_type: string;
  summary: string;
  health_score: number | null;
  health_score_basis?: string | null;
  biomarkers: Biomarker[];
  health_concerns: {
    summary: string;
    potential_risks: string[];
  };
  recommendations: {
    diet?: string[];
    lifestyle?: string[];
    specialists?: string[];
  };
  created_at: string;
  analysis_mode?: 'rule_based' | 'llm' | null;
  warnings?: string[];
  grounding?: string | null;
}

export const SharedReport: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<SharedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      fetchSharedReport();
    }
  }, [token]);

  const fetchSharedReport = async () => {
    try {
      const res = await api.get(`/reports/shared/view/${token}`);
      setReport(res.data);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "This sharing link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch ((status || '').toLowerCase()) {
      case 'normal':
        return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-600"><CheckCircle className="h-3 w-3" /> Normal</span>;
      case 'high':
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-600"><AlertTriangle className="h-3 w-3" /> High</span>;
      case 'low':
        return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-600"><Info className="h-3 w-3" /> Low</span>;
      case 'critical':
        return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-600"><ShieldAlert className="h-3 w-3" /> Critical</span>;
      case 'review':
        return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">Manual review</span>;
      default:
        return <span className="rounded-full bg-slate-50 px-2.5 py-0.5 text-xs font-bold text-slate-500">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-navy-900">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-500" />
          <p className="mt-2 text-sm text-slate-400">Loading shared medical analysis...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-center dark:bg-navy-900">
        <div className="max-w-md rounded-3xl border border-red-100 bg-white p-8 dark:border-slate-800 dark:bg-navy-800 shadow-xl">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 animate-pulse" />
          <h2 className="mt-4 text-lg font-bold text-slate-800 dark:text-white">Link Expired or Invalid</h2>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 dark:bg-navy-900 font-sans">
      <div className="mx-auto max-w-4xl space-y-8">
        
        {/* Logo and sharing banner */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <span className="text-sm font-semibold text-slate-400 flex items-center gap-1.5">
            <Activity className="h-4.5 w-4.5 text-primary-500" /> MediSense AI Secure Viewer
          </span>
          <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-600 dark:bg-primary-950/20 dark:text-primary-400">
            Shared Report View
          </span>
        </div>

        {/* Title Block */}
        <div className="flex flex-col sm:flex-row justify-between gap-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-primary-500">{report.report_type}</span>
            <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">{report.filename}</h1>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1.5">
              <Calendar className="h-4 w-4" />
              <span>Report analyzed on {new Date(report.created_at).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 rounded-3xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-navy-800 shadow-lg shrink-0">
            <div className={`relative flex h-14 w-14 items-center justify-center rounded-full font-extrabold text-md border-4 ${
              report.health_score === null || report.health_score === undefined
                ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-navy-900 dark:border-slate-700'
                : 'bg-slate-100 dark:bg-navy-900 text-slate-800 dark:text-slate-200 border-primary-500'
            }`}>
              {report.health_score ?? '—'}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Health Index</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Results read: {report.biomarkers?.length ?? 0}</p>
              {report.health_score_basis && (
                <p className="mt-1 max-w-[12rem] text-[9px] leading-snug text-slate-400">{report.health_score_basis}</p>
              )}
            </div>
          </div>
        </div>

        {(report.warnings?.length ?? 0) > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-950/30 dark:bg-red-950/10">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
              <ShieldAlert className="h-4 w-4" /> Flags you should not ignore
            </p>
            <ul className="mt-2 space-y-1.5">
              {report.warnings!.map((w, i) => (
                <li key={i} className="text-xs leading-relaxed text-red-700/90 dark:text-red-300/90">• {w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Overall Summary */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-700">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary-500" /> Overall Summary
            </h3>
            {report.analysis_mode && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {report.analysis_mode === 'llm' ? 'AI model analysis' : 'Rule-based analysis'}
              </span>
            )}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {report.summary}
          </p>
          {report.grounding && (
            <p className="mt-3 text-[11px] italic text-slate-400">{report.grounding}</p>
          )}
        </div>

        {/* Biomarkers Table */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-700">
            <Activity className="h-5 w-5 text-primary-500" /> Results read from this report
          </h3>
          {(report.biomarkers?.length ?? 0) === 0 ? (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              No structured results could be read from this document, so nothing is listed. No values
              have been assumed.
            </p>
          ) : (
          <div className="mt-6 divide-y divide-slate-100 dark:divide-slate-700/50">
            {report.biomarkers.map((bm, index) => (
              <div key={index} className="py-5 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-start gap-4">
                <div className="md:w-1/3 space-y-1">
                  <p className="font-bold text-slate-800 dark:text-slate-200">{bm.name}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {bm.value} {bm.unit && <span className="text-xs font-normal text-slate-400">{bm.unit}</span>}
                    </span>
                    {getStatusBadge(bm.status)}
                  </div>
                  <p className="text-xs text-slate-400">
                    Reference: {bm.reference_range || 'Not printed on this report'}
                  </p>
                </div>
                <div className="md:w-2/3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">What this test measures</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{bm.explanation}</p>
                  {(bm.notes?.length ?? 0) > 0 && (
                    <ul className="mt-2 space-y-1">
                      {bm.notes!.map((n, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{n}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>

        {/* Recommendations */}
        <div className="grid gap-8 sm:grid-cols-2">
          {/* Health Concerns */}
          <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-700">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Areas of Concern
            </h3>
            <div className="mt-4 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {report.health_concerns?.summary || "No major concerns detected."}
              </p>
              {report.health_concerns?.potential_risks?.length > 0 && (
                <ul className="space-y-1">
                  {report.health_concerns.potential_risks.map((risk, idx) => (
                    <li key={idx} className="text-xs text-slate-600 pl-3 relative before:absolute before:left-0 before:top-1.5 before:h-1 before:w-1 before:rounded-full before:bg-slate-300 leading-relaxed">{risk}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Recommendations */}
          <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-700">
              <Heart className="h-5 w-5 text-red-500" /> Health Actions
            </h3>
            <div className="mt-4 space-y-3">
              {(report.recommendations?.lifestyle?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Lifestyle Changes</p>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{report.recommendations!.lifestyle!.slice(0, 2).join(". ")}.</p>
                </div>
              )}
              {(report.recommendations?.diet?.length ?? 0) > 0 && (
                <div className="border-t border-slate-100 pt-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Diet Changes</p>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{report.recommendations!.diet!.slice(0, 2).join(". ")}.</p>
                </div>
              )}
              {(report.recommendations?.specialists?.length ?? 0) > 0 && (
                <div className="border-t border-slate-100 pt-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Specialists to Consult</p>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{report.recommendations!.specialists!.join(", ")}</p>
                </div>
              )}
              {!(report.recommendations?.lifestyle?.length ?? 0)
                && !(report.recommendations?.diet?.length ?? 0)
                && !(report.recommendations?.specialists?.length ?? 0) && (
                <p className="text-xs text-slate-500">
                  No general guidance was produced for this report. Nothing has been assumed.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Persistent Warning Disclaimer */}
        <footer className="rounded-2xl border border-red-100 bg-red-50/50 p-4 dark:border-red-950/20 dark:bg-red-950/5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600 shrink-0" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-red-800">MEDICAL DISCLAIMER</h4>
              <p className="mt-1 text-[11px] leading-relaxed text-red-700/80">
                MediSense AI is for educational and informational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider regarding medical questions.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
