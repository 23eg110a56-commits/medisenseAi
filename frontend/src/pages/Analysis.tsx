import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FileText, Download, Share2, Printer, MessageSquareCode,
  Activity, AlertTriangle, CheckCircle, Info,
  Calendar, ShieldAlert, ArrowLeft, Loader2, Copy, Check, Brain,
  ClipboardEdit, ScanText, HelpCircle, Save
} from 'lucide-react';
import api from '../services/api';
import { useTranslation } from '../hooks/useTranslation';
import { useSystemStatus } from '../context/SystemStatusContext';

interface Biomarker {
  name: string;
  value: string;
  unit: string;
  status: string;
  reference_range: string;
  explanation: string;
  explanation_source?: string;
  notes?: string[];
}

interface Report {
  id: string;
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
    guidance_type?: string;
  };
  created_at: string;
  analyzed_at?: string;
  language: string;
  analysis_status?: 'awaiting_review' | 'analyzed' | 'extraction_failed' | string;
  analysis_mode?: 'rule_based' | 'llm' | null;
  llm_notice?: string | null;
  warnings?: string[];
  unparsed_lines?: string[];
  requires_manual_review?: boolean;
  grounding?: string | null;
  extracted_text?: string;
  extraction_engine?: string | null;
  extraction_warnings?: string[];
  page_count?: number | null;
  text_corrected_by_user?: boolean;
}

const ENGINE_LABELS: Record<string, string> = {
  pdf_text_layer: 'PDF text layer',
  easyocr: 'EasyOCR',
  tesseract: 'Tesseract OCR',
  vision_model: 'Vision model',
};

export const Analysis: React.FC = () => {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { status: systemStatus } = useSystemStatus();

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);

  // OCR review state
  const [editingText, setEditingText] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [savingText, setSavingText] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    if (reportId) {
      fetchReportDetail();
    }
  }, [reportId]);

  const fetchReportDetail = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/reports/detail/${reportId}`);
      setReport(res.data);
      setLoadError(null);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setLoadError(typeof detail === 'string' ? detail : 'Failed to load this report.');
    } finally {
      setLoading(false);
    }
  };

  const errorMessage = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (detail?.message) return detail.message;
    return fallback;
  };

  const handleSaveText = async (): Promise<string | null> => {
    if (!reportId) return null;
    const text = draftText.trim();
    if (!text) {
      setActionError('Extracted text cannot be empty. Paste the report contents, or re-upload a readable copy.');
      return null;
    }
    setSavingText(true);
    setActionError(null);
    try {
      const res = await api.put(`/reports/${reportId}/text`, { extracted_text: text });
      setReport(res.data);
      setActionNotice('Corrections saved.');
      return text;
    } catch (err) {
      setActionError(errorMessage(err, 'Could not save your corrections.'));
      return null;
    } finally {
      setSavingText(false);
    }
  };

  const handleAnalyze = async () => {
    if (!reportId) return;
    setAnalyzing(true);
    setActionError(null);
    setActionNotice(null);
    try {
      let corrected: string | null = null;
      if (editingText) {
        corrected = await handleSaveText();
        if (!corrected) {
          setAnalyzing(false);
          return;
        }
      }
      const res = await api.post(`/reports/${reportId}/analyze`, corrected ? { extracted_text: corrected } : {});
      setReport(res.data);
      setEditingText(false);
      setActionNotice(null);
    } catch (err) {
      setActionError(errorMessage(err, 'Analysis failed. Please try again.'));
    } finally {
      setAnalyzing(false);
    }
  };

  const openTextEditor = () => {
    setDraftText(report?.extracted_text || '');
    setEditingText(true);
    setActionError(null);
  };

  const handleShare = async () => {
    if (!reportId) return;
    setShareLoading(true);
    setActionError(null);
    try {
      const res = await api.post(`/reports/export/${reportId}/share`, null, {
        params: { expires_in_hours: 24 },
      });
      setShareLink(`${window.location.origin}${res.data.url}`);
    } catch (err) {
      setActionError(errorMessage(err, 'Could not generate a share link.'));
    } finally {
      setShareLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = async (kind: 'pdf' | 'docx') => {
    if (!report) return;
    setActionError(null);
    try {
      const res = await api.get(`/reports/export/${report.id}/${kind}`, { responseType: 'blob' });
      const mime = kind === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const url = window.URL.createObjectURL(new Blob([res.data], { type: mime }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `medisense_${report.filename || 'report'}.${kind}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(errorMessage(err, `Failed to download the ${kind.toUpperCase()} report.`));
    }
  };

  const getStatusBadge = (status: string) => {
    switch ((status || '').toLowerCase()) {
      case 'normal':
        return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400"><CheckCircle className="h-3 w-3" /> Within range</span>;
      case 'high':
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:bg-amber-950/20 dark:text-amber-400"><AlertTriangle className="h-3 w-3" /> High</span>;
      case 'low':
        return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-600 dark:bg-blue-950/20 dark:text-blue-400"><Info className="h-3 w-3" /> Low</span>;
      case 'critical':
        return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-600 dark:bg-red-950/20 dark:text-red-400"><ShieldAlert className="h-3 w-3" /> Critical</span>;
      case 'review':
        return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"><HelpCircle className="h-3 w-3" /> Manual review</span>;
      default:
        return <span className="rounded-full bg-slate-50 px-2.5 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{status || 'Unknown'}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-500" />
          <p className="mt-2 text-sm text-slate-400">Loading report…</p>
        </div>
      </div>
    );
  }

  if (loadError || !report) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-slate-100 bg-white p-10 text-center dark:border-slate-800 dark:bg-navy-800">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <h2 className="mt-3 font-bold text-slate-800 dark:text-slate-100">Report unavailable</h2>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{loadError || 'This report could not be found.'}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={fetchReportDetail}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
          >
            Try again
          </button>
          <button
            onClick={() => navigate('/history')}
            className="rounded-xl bg-primary-500 px-4 py-2 text-xs font-bold text-white hover:bg-primary-600"
          >
            Back to History
          </button>
        </div>
      </div>
    );
  }

  const analyzed = report.analysis_status === 'analyzed';
  const totalBiomarkers = report.biomarkers?.length ?? 0;
  const abnormalBiomarkers = (report.biomarkers ?? []).filter(b => b.status?.toLowerCase() !== 'normal').length;
  const hasText = (report.extracted_text ?? '').trim().length > 0;

  return (
    <div className="space-y-8 print:space-y-4 print:p-0">
      {/* Back button & actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800 print:hidden">
        <button
          onClick={() => navigate('/history')}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to History
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => window.print()}
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-slate-700"
            title="Print Report"
          >
            <Printer className="h-4 w-4" />
          </button>
          <button
            onClick={() => download('pdf')}
            disabled={!analyzed}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-slate-700"
            title={analyzed ? 'Download PDF' : 'Analyse the report first'}
          >
            <Download className="h-4 w-4 text-primary-600" />
            <span>PDF</span>
          </button>
          <button
            onClick={() => download('docx')}
            disabled={!analyzed}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-slate-700"
            title={analyzed ? 'Download Word Document (DOCX)' : 'Analyse the report first'}
          >
            <FileText className="h-4 w-4 text-teal-600" />
            <span>DOCX</span>
          </button>
          <button
            onClick={handleShare}
            disabled={shareLoading || !analyzed}
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-slate-700"
            title={analyzed ? 'Generate Share Link' : 'Analyse the report first'}
          >
            {shareLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          </button>
          <Link
            to={`/chat?report=${report.id}`}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform ${
              analyzed
                ? 'bg-gradient-to-r from-primary-500 to-teal-500 text-white hover:scale-105'
                : 'pointer-events-none bg-slate-100 text-slate-400 dark:bg-slate-800'
            }`}
            title={analyzed ? 'Ask questions about this report' : 'Analyse the report first'}
          >
            <MessageSquareCode className="h-4 w-4" />
            Chat
          </Link>
        </div>
      </div>

      {shareLink && (
        <div className="rounded-2xl border border-primary-100 bg-primary-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40 flex items-center justify-between gap-4 print:hidden">
          <div className="truncate">
            <p className="text-xs font-bold text-primary-800 dark:text-primary-400 uppercase tracking-wider">
              Sharing link (expires in 24 hours)
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Anyone with this link can view the analysis. {shareLink}
            </p>
          </div>
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:bg-navy-900 dark:border-slate-800 dark:text-slate-300 shrink-0"
          >
            {copied ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
          </button>
        </div>
      )}

      {actionError && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-950/30 dark:bg-red-950/10 dark:text-red-300 print:hidden">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {actionNotice && (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700 dark:border-emerald-950/30 dark:bg-emerald-950/10 dark:text-emerald-300 print:hidden">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Title block */}
      <div className="flex flex-col md:flex-row justify-between gap-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-primary-500">{report.report_type}</span>
          <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">{report.filename}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-400 mt-1.5">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Uploaded {new Date(report.created_at).toLocaleDateString(undefined, { dateStyle: 'long' })}
            </span>
            {report.analyzed_at && (
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" />
                Analysed {new Date(report.analyzed_at).toLocaleDateString(undefined, { dateStyle: 'long' })}
              </span>
            )}
            {report.analysis_mode && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {report.analysis_mode === 'llm' ? 'AI model analysis' : 'Rule-based analysis'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass shrink-0">
          <div className={`relative flex h-16 w-16 items-center justify-center rounded-full font-extrabold text-lg border-4 ${
            report.health_score === null || report.health_score === undefined
              ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-navy-900 dark:border-slate-700'
              : 'bg-slate-100 text-slate-800 border-primary-500 dark:bg-navy-900 dark:text-slate-200'
          }`}>
            {report.health_score ?? '—'}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('healthScore')}</p>
            <p className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">
              {analyzed
                ? `Results read: ${totalBiomarkers} (${abnormalBiomarkers} outside range)`
                : 'Not analysed yet'}
            </p>
            {report.health_score_basis && (
              <p className="mt-1 text-[10px] leading-snug text-slate-400">{report.health_score_basis}</p>
            )}
          </div>
        </div>
      </div>

      {/* Extraction provenance */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-navy-800/40 dark:text-slate-400 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2">
            <ScanText className="h-4 w-4 text-slate-400" />
            Text source: {report.extraction_engine ? ENGINE_LABELS[report.extraction_engine] || report.extraction_engine : 'none'}
            {report.page_count ? ` · ${report.page_count} page(s)` : ''}
            {hasText ? ` · ${(report.extracted_text ?? '').length.toLocaleString()} characters` : ' · no text extracted'}
            {report.text_corrected_by_user ? ' · corrected by you' : ''}
          </p>
          <button
            onClick={() => (editingText ? setEditingText(false) : openTextEditor())}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-navy-900 dark:text-slate-300"
          >
            <ClipboardEdit className="h-3.5 w-3.5" />
            {editingText ? 'Close editor' : hasText ? 'Review & correct text' : 'Enter text manually'}
          </button>
        </div>

        {report.extraction_warnings?.map((w, i) => (
          <p key={i} className="mt-2 flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{w}</span>
          </p>
        ))}
      </div>

      {/* OCR review / correction editor */}
      {editingText && (
        <div className="rounded-3xl border border-primary-100 bg-white p-6 dark:border-slate-700 dark:bg-navy-800 shadow-glass print:hidden">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-700">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
              <ClipboardEdit className="h-5 w-5 text-primary-500" /> Review extracted text
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {draftText.length.toLocaleString()} chars
            </span>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            OCR misreads digits, decimal points and minus signs. Correct anything that does not match
            the paper report — the analysis only ever uses values present in this text, so a wrong
            digit here becomes a wrong result. Keep one result per line:
            <span className="font-mono"> Test name  value  unit  reference range </span>.
          </p>

          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            spellCheck={false}
            rows={16}
            placeholder={hasText ? '' : 'Paste the text printed on your report here…'}
            className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700 outline-none focus:border-primary-500 focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-slate-200"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={handleSaveText}
              disabled={savingText || !draftText.trim()}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              {savingText ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save text only
            </button>
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !draftText.trim()}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-teal-500 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-primary-500/10 hover:scale-105 transition-transform disabled:scale-100 disabled:opacity-50"
            >
              {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
              Save &amp; analyse
            </button>
          </div>
        </div>
      )}

      {/* Pre-analysis state */}
      {!analyzed && !editingText && (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-navy-800">
          <ScanText className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
          <h3 className="mt-4 text-lg font-bold text-slate-700 dark:text-slate-200">
            {hasText ? 'Text extracted — confirm it before analysing' : 'No text could be extracted'}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            {hasText
              ? 'Check the extracted text against your paper report and fix any OCR mistakes. Nothing is analysed until you confirm.'
              : 'This file has no readable text layer and no OCR engine could read it. Paste the results from your paper report to continue.'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={openTextEditor}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              <ClipboardEdit className="h-4 w-4" /> Review text
            </button>
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !hasText}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-primary-500/10 hover:scale-105 transition-transform disabled:scale-100 disabled:opacity-50"
            >
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              {analyzing ? 'Analysing…' : 'Confirm & analyse'}
            </button>
          </div>
        </div>
      )}

      {analyzed && (
        <>
          {/* Honesty notices */}
          {report.llm_notice && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800 dark:border-amber-950/30 dark:bg-amber-950/10 dark:text-amber-300">
              <p className="font-bold">How this analysis was produced</p>
              <p className="mt-1">{report.llm_notice}</p>
            </div>
          )}

          {report.warnings && report.warnings.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-950/30 dark:bg-red-950/10">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                <ShieldAlert className="h-4 w-4" /> Flags you should not ignore
              </p>
              <ul className="mt-2 space-y-1.5">
                {report.warnings.map((w, i) => (
                  <li key={i} className="text-xs leading-relaxed text-red-700/90 dark:text-red-300/90">• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-700">
              <FileText className="h-5 w-5 text-primary-500" /> Overall Summary
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{report.summary}</p>
            {report.grounding && (
              <p className="mt-3 text-[11px] italic text-slate-400">{report.grounding}</p>
            )}
          </div>

          {/* Biomarkers */}
          <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-700">
              <Activity className="h-5 w-5 text-primary-500" /> Results read from this report
            </h3>

            {totalBiomarkers === 0 ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                No structured results (test name, value, unit, reference range) could be read from the
                extracted text. Nothing has been assumed. Correct the text and re-run the analysis, or
                have the report read by a healthcare professional.
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
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                        What this test measures
                        {bm.explanation_source === 'general_education' && (
                          <span className="ml-2 normal-case tracking-normal text-slate-400/80">(general information, not a finding)</span>
                        )}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{bm.explanation}</p>
                      {bm.notes && bm.notes.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {bm.notes.map((n, i) => (
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

            {report.unparsed_lines && report.unparsed_lines.length > 0 && (
              <details className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-navy-900/40">
                <summary className="cursor-pointer text-xs font-bold text-slate-600 dark:text-slate-300">
                  {report.unparsed_lines.length} line(s) could not be read as results
                </summary>
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  These lines were skipped rather than guessed. If any of them is a real result, correct
                  the extracted text and analyse again.
                </p>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-mono text-[11px] text-slate-600 dark:bg-navy-800 dark:text-slate-300">
                  {report.unparsed_lines.join('\n')}
                </pre>
              </details>
            )}
          </div>

          {/* Concerns & recommendations */}
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-700">
                <AlertTriangle className="h-5 w-5 text-amber-500" /> Observed findings
              </h3>
              <div className="mt-4 space-y-4">
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {report.health_concerns?.summary || 'No results fell outside the ranges printed on this report.'}
                </p>
                {(report.health_concerns?.potential_risks?.length ?? 0) > 0 && (
                  <ul className="space-y-2">
                    {report.health_concerns!.potential_risks.map((risk, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 pl-2 before:content-['•'] before:text-slate-400 before:mr-1 leading-relaxed">
                        {risk}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-700">
                <Brain className="h-5 w-5 text-primary-500" /> Educational guidance
              </h3>
              <div className="mt-4 space-y-4 max-h-80 overflow-y-auto pr-1">
                {(report.recommendations?.lifestyle?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{t('lifestyleSuggestions')}</p>
                    <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {report.recommendations!.lifestyle!.map((item, idx) => (
                        <li key={idx} className="pl-3 relative before:absolute before:left-0 before:top-1.5 before:h-1 before:w-1 before:rounded-full before:bg-slate-300 leading-relaxed">{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {(report.recommendations?.diet?.length ?? 0) > 0 && (
                  <div className="border-t border-slate-100 pt-3 dark:border-slate-700">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{t('dietSuggestions')}</p>
                    <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {report.recommendations!.diet!.map((item, idx) => (
                        <li key={idx} className="pl-3 relative before:absolute before:left-0 before:top-1.5 before:h-1 before:w-1 before:rounded-full before:bg-slate-300 leading-relaxed">{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {(report.recommendations?.specialists?.length ?? 0) > 0 && (
                  <div className="border-t border-slate-100 pt-3 dark:border-slate-700">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{t('recommendedSpecialists')}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {report.recommendations!.specialists!.join(' ')}
                    </p>
                  </div>
                )}

                {(report.recommendations?.lifestyle?.length ?? 0) === 0 &&
                 (report.recommendations?.diet?.length ?? 0) === 0 && (
                  <p className="text-xs text-slate-400">No guidance could be derived from this report.</p>
                )}
              </div>
              <p className="mt-4 border-t border-slate-100 pt-3 text-[10px] leading-relaxed text-slate-400 dark:border-slate-700">
                This app does not prescribe medicines or change doses. Only a clinician who knows your
                history can decide treatment.
              </p>
            </div>
          </div>
        </>
      )}

      {systemStatus && !systemStatus.llm.configured && analyzed && report.analysis_mode !== 'llm' && (
        <p className="text-[11px] text-slate-400 print:hidden">
          Set <span className="font-mono">GEMINI_API_KEY</span> in <span className="font-mono">backend/.env</span> to
          add AI-written explanations on top of these document-derived results.
        </p>
      )}
    </div>
  );
};
