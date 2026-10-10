import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud, File, AlertCircle, Loader2, ArrowRight,
  ScanText, FileWarning, ClipboardEdit, Sparkles, CheckCircle2, Cpu
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSystemStatus } from '../context/SystemStatusContext';
import { useTranslation } from '../hooks/useTranslation';
import { ConfigureGeminiModal } from '../components/ConfigureGeminiModal';

interface ExtractedReport {
  id: string;
  filename: string;
  analysis_status: string;
  extraction_engine: string | null;
  page_count: number | null;
  extraction_warnings: string[];
  extracted_text: string;
}

type ItemStatus = 'idle' | 'uploading' | 'extracting' | 'analyzing' | 'done' | 'failed';

interface UploadQueueItem {
  file: File;
  status: ItemStatus;
  progress: number;
  error?: string;
  report?: ExtractedReport;
}

const ENGINE_LABELS: Record<string, string> = {
  pdf_text_layer: 'Text layer read from the PDF',
  easyocr: 'EasyOCR (on-device)',
  tesseract: 'Tesseract OCR',
  vision_model: 'Gemini Vision model',
};

export const Upload: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status: systemStatus } = useSystemStatus();

  const maxBytes = (systemStatus?.limits.max_upload_size_mb ?? 10) * 1024 * 1024;
  const maxMb = systemStatus?.limits.max_upload_size_mb ?? 10;
  const allowedExtensions = systemStatus?.limits.allowed_extensions ?? ['pdf', 'png', 'jpg', 'jpeg'];

  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [language, setLanguage] = useState(user?.language || 'en');
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [geminiModalOpen, setGeminiModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      addFilesToQueue(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addFilesToQueue(Array.from(e.target.files));
    }
    e.target.value = '';
  };

  const patchItem = (index: number, patch: Partial<UploadQueueItem>) => {
    setQueue(prev => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const addFilesToQueue = (files: File[]) => {
    const accepted: UploadQueueItem[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
      if (!allowedExtensions.includes(ext)) {
        rejected.push(`'${file.name}' is not a supported file type. Allowed: ${allowedExtensions.join(', ').toUpperCase()}.`);
        continue;
      }
      if (file.size === 0) {
        rejected.push(`'${file.name}' is empty.`);
        continue;
      }
      if (file.size > maxBytes) {
        rejected.push(`'${file.name}' is ${(file.size / 1024 / 1024).toFixed(1)} MB, which exceeds the ${maxMb} MB limit.`);
        continue;
      }
      accepted.push({ file, status: 'idle', progress: 0 });
    }

    if (rejected.length) {
      setQueue(prev => [
        ...prev,
        ...rejected.map(message => ({
          file: { name: message, size: 0 } as File,
          status: 'failed' as ItemStatus,
          progress: 100,
          error: message,
        })),
        ...accepted,
      ]);
    } else {
      setQueue(prev => {
        const nextQueue = [...prev, ...accepted];
        // Automatically start upload for the newly added accepted files
        setTimeout(() => {
          processPendingQueue(nextQueue);
        }, 100);
        return nextQueue;
      });
    }
  };

  const removeFromQueue = (index: number) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
  };

  const processPendingQueue = async (currentQueue: UploadQueueItem[]) => {
    if (busy) return;
    const pendingIndices = currentQueue
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.status === 'idle');

    if (pendingIndices.length === 0) return;

    setBusy(true);

    for (const { item, idx } of pendingIndices) {
      const formData = new FormData();
      formData.append('files', item.file);
      formData.append('language', language);

      patchItem(idx, { status: 'uploading', progress: 20, error: undefined });

      try {
        const res = await api.post('/reports/upload', formData, {
          onUploadProgress: (event) => {
            if (!event.total) return;
            const pct = Math.min(70, Math.round((event.loaded / event.total) * 70));
            patchItem(idx, { progress: Math.max(20, pct) });
          },
        });

        patchItem(idx, { status: 'extracting', progress: 85 });

        const payload = res.data as { reports: ExtractedReport[]; errors: { filename: string; detail: string }[] };
        const uploaded = payload.reports?.[0];
        const perFileError = payload.errors?.find(e => e.filename === item.file.name);

        if (!uploaded) {
          patchItem(idx, {
            status: 'failed',
            progress: 100,
            error: perFileError?.detail || 'The server could not store this file.',
          });
          continue;
        }

        // Check if auto-analyze is enabled and text was extracted
        if (autoAnalyze && uploaded.extracted_text && uploaded.extracted_text.trim().length > 0) {
          patchItem(idx, { status: 'analyzing', progress: 92, report: uploaded });
          try {
            await api.post(`/reports/${uploaded.id}/analyze`, { language });
            patchItem(idx, {
              status: 'done',
              progress: 100,
              report: { ...uploaded, analysis_status: 'analyzed' },
            });
            await refreshProfile();
            // If single file uploaded with auto-analyze, navigate directly to analysis
            if (pendingIndices.length === 1) {
              navigate(`/analysis/${uploaded.id}`);
              return;
            }
          } catch (analyzeErr) {
            // Keep uploaded report available even if LLM analysis fails
            patchItem(idx, { status: 'done', progress: 100, report: uploaded });
          }
        } else {
          patchItem(idx, { status: 'done', progress: 100, report: uploaded });
        }
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        patchItem(idx, {
          status: 'failed',
          progress: 100,
          error: typeof detail === 'string' ? detail : detail?.message || 'Upload failed. Check your connection and try again.',
        });
      }
    }

    setBusy(false);
    await refreshProfile();
  };

  const handleManualAnalyze = async (index: number, reportId: string) => {
    patchItem(index, { status: 'analyzing', progress: 90 });
    try {
      await api.post(`/reports/${reportId}/analyze`, { language });
      patchItem(index, { status: 'done', progress: 100 });
      await refreshProfile();
      navigate(`/analysis/${reportId}`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      patchItem(index, {
        status: 'done',
        error: typeof detail === 'string' ? detail : 'Analysis failed. Check your connection or edit text first.',
      });
    }
  };

  const statusText = (item: UploadQueueItem): string => {
    switch (item.status) {
      case 'idle': return 'Queued';
      case 'uploading': return 'Uploading…';
      case 'extracting': return 'Extracting text (OCR)…';
      case 'analyzing': return 'Analyzing with Gemini AI…';
      case 'done':
        if (item.report?.analysis_status === 'analyzed') return 'Analysis complete';
        if (item.report?.analysis_status === 'extraction_failed') return 'Needs manual text';
        return 'Text extracted';
      case 'failed': return 'Failed';
    }
  };

  const barColor = (s: ItemStatus) => {
    if (s === 'done') return 'bg-emerald-500';
    if (s === 'failed') return 'bg-red-500';
    if (s === 'analyzing') return 'bg-gradient-to-r from-primary-500 to-teal-400 animate-pulse';
    if (s === 'extracting') return 'bg-teal-500 animate-pulse';
    return 'bg-primary-500';
  };

  const hasPending = queue.some(item => item.status === 'idle');
  const ocrUnavailable = systemStatus ? !systemStatus.ocr.any_engine_available : false;
  const llmUnavailable = systemStatus ? !systemStatus.llm.configured : false;

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <UploadCloud className="h-8 w-8 text-primary-500" />
          {t('uploadReport')}
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Upload medical reports (CBC, Lipid Panel, Blood Tests, Thyroid, Imaging). MediSense AI extracts
          document contents and produces comprehensive biomarker interpretations.
        </p>
      </div>

      {llmUnavailable && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-950/30 dark:bg-amber-950/20 dark:text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-bold">Google Gemini AI is not configured yet.</p>
              <p className="mt-0.5 text-amber-700 dark:text-amber-300/80">
                Reports will fall back to rule-based parsing. Activate Gemini AI to get automated clinical summaries and interactive chat.
              </p>
            </div>
          </div>
          <button
            onClick={() => setGeminiModalOpen(true)}
            className="shrink-0 flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-transform active:scale-95"
          >
            <Sparkles className="h-3.5 w-3.5" /> Configure Gemini Key
          </button>
        </div>
      )}

      {ocrUnavailable && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-xs text-orange-800 dark:border-orange-950/30 dark:bg-orange-950/10 dark:text-orange-300">
          <p className="font-bold">No OCR engine is installed on the server.</p>
          <p className="mt-1">
            Text-based PDFs can still be read. Scanned documents and photos will upload with no
            extracted text, and you will be asked to paste the report contents yourself.
          </p>
        </div>
      )}

      <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="max-w-xs w-full">
            <label htmlFor="uploadLang" className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              Analysis Output Language
            </label>
            <select
              id="uploadLang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
            >
              <option value="en">English</option>
              <option value="hi">Hindi (हिन्दी)</option>
              <option value="te">Telugu (తెలుగు)</option>
            </select>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer self-start sm:self-end pb-1 select-none">
            <input
              type="checkbox"
              checked={autoAnalyze}
              onChange={(e) => setAutoAnalyze(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-400 cursor-pointer"
            />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary-500" />
              Auto-analyze with AI after upload
            </span>
          </label>
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
          className={`flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-primary-500 bg-primary-50/30 dark:bg-primary-950/10'
              : 'border-slate-200 hover:border-primary-400 hover:bg-slate-50/50 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800/10'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className="hidden"
          />
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-500 dark:bg-primary-950/20">
            <UploadCloud className="h-7 w-7" />
          </div>
          <h3 className="mt-4 font-bold text-slate-700 dark:text-slate-200">
            Drag &amp; drop reports here, or <span className="text-primary-500 hover:underline">browse</span>
          </h3>
          <p className="mt-1.5 text-xs text-slate-400">
            {allowedExtensions.map(e => e.toUpperCase()).join(', ')} up to {maxMb} MB each
          </p>
        </div>

        {queue.length > 0 && (
          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Report Files ({queue.length})
            </h3>
            <div className="space-y-3">
              {queue.map((item, idx) => (
                <div
                  key={`${item.file.name}-${idx}`}
                  className="rounded-2xl border border-slate-100 p-4 dark:border-slate-700/50 dark:bg-navy-800 bg-slate-50/50 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 truncate">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-400 dark:bg-navy-900 border border-slate-100 dark:border-slate-800">
                        {item.status === 'failed' ? (
                          <FileWarning className="h-5 w-5 text-red-400" />
                        ) : item.status === 'done' && item.report?.analysis_status === 'analyzed' ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <File className="h-5 w-5" />
                        )}
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {item.report?.filename || item.file.name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {item.file.size ? `${(item.file.size / 1024 / 1024).toFixed(2)} MB` : 'Rejected before upload'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs font-semibold ${
                        item.status === 'done' ? 'text-emerald-500' :
                        item.status === 'analyzing' ? 'text-primary-500 font-bold' :
                        item.status === 'failed' ? 'text-red-500' : 'text-slate-500'
                      }`}>
                        {statusText(item)}
                      </span>

                      {item.status === 'idle' && (
                        <button
                          onClick={() => removeFromQueue(idx)}
                          className="text-xs font-bold text-slate-400 hover:text-red-500"
                        >
                          Remove
                        </button>
                      )}

                      {item.status === 'done' && item.report && (
                        <div className="flex items-center gap-2">
                          {item.report.analysis_status === 'analyzed' ? (
                            <button
                              onClick={() => navigate(`/analysis/${item.report!.id}`)}
                              className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-600 active:scale-95 transition-all"
                            >
                              View Analysis <ArrowRight className="h-3 w-3" />
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleManualAnalyze(idx, item.report!.id)}
                                className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-primary-500 to-teal-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:brightness-105 active:scale-95 transition-all"
                              >
                                <Sparkles className="h-3 w-3" /> Analyze with AI
                              </button>
                              <button
                                onClick={() => navigate(`/analysis/${item.report!.id}`)}
                                className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 hover:underline"
                              >
                                <ClipboardEdit className="h-3.5 w-3.5" /> Review text
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {item.status !== 'idle' && (
                    <div className="mt-3">
                      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${barColor(item.status)}`}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>

                      {item.error && (
                        <div className="mt-2 flex items-start gap-1.5 text-xs text-red-500">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{item.error}</span>
                        </div>
                      )}

                      {item.report && (
                        <div className="mt-3 space-y-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <p className="flex items-center gap-1.5">
                            <ScanText className="h-3.5 w-3.5 text-slate-400" />
                            {item.report.extraction_engine
                              ? ENGINE_LABELS[item.report.extraction_engine] || item.report.extraction_engine
                              : 'No text could be extracted automatically'}
                            {item.report.page_count ? ` · ${item.report.page_count} page(s)` : ''}
                            {item.report.extracted_text
                              ? ` · ${item.report.extracted_text.length.toLocaleString()} characters`
                              : ''}
                          </p>
                          {item.report.extraction_warnings?.map((w, i) => (
                            <p key={i} className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>{w}</span>
                            </p>
                          ))}
                          {item.report.analysis_status === 'extraction_failed' && (
                            <p className="font-semibold text-amber-700 dark:text-amber-400">
                              You can still open this report and paste the text manually before analysing it.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {hasPending && (
              <div className="flex items-center justify-between gap-3 pt-3">
                <p className="text-[11px] text-slate-400">
                  Click below to start upload and analysis for pending reports.
                </p>
                <button
                  onClick={() => processPendingQueue(queue)}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/10 transition-transform active:scale-95 disabled:scale-100 disabled:opacity-50 cursor-pointer"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Upload &amp; Analyze Reports
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfigureGeminiModal
        isOpen={geminiModalOpen}
        onClose={() => setGeminiModalOpen(false)}
      />
    </div>
  );
};
