import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud, File, AlertCircle, Loader2, ArrowRight,
  ScanText, FileWarning, ClipboardEdit, Sparkles, CheckCircle2, Cpu, RotateCcw
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
  id: string;
  file: File;
  status: ItemStatus;
  progress: number;
  error?: string;
  report?: ExtractedReport;
}

const ENGINE_LABELS: Record<string, string> = {
  pdf_text_layer: 'Digital PDF text layer',
  easyocr: 'EasyOCR (on-device AI)',
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
  const allowedExtensions = systemStatus?.limits.allowed_extensions ?? ['pdf', 'png', 'jpg', 'jpeg', 'webp'];

  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [language, setLanguage] = useState(user?.language || 'en');
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [geminiModalOpen, setGeminiModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
    // Clear value so the same file can be re-selected if desired
    e.target.value = '';
  };

  const patchQueueItem = (itemId: string, patch: Partial<UploadQueueItem>) => {
    setQueue(prev => prev.map(item => item.id === itemId ? { ...item, ...patch } : item));
  };

  const handleFiles = (incomingFiles: File[]) => {
    const accepted: UploadQueueItem[] = [];
    const rejected: UploadQueueItem[] = [];

    for (const file of incomingFiles) {
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';

      if (!allowedExtensions.includes(ext)) {
        rejected.push({
          id: uniqueId,
          file,
          status: 'failed',
          progress: 100,
          error: `'${file.name}' is not supported. Allowed formats: ${allowedExtensions.map(e => e.toUpperCase()).join(', ')}.`,
        });
        continue;
      }

      if (file.size === 0) {
        rejected.push({
          id: uniqueId,
          file,
          status: 'failed',
          progress: 100,
          error: `'${file.name}' is empty (0 bytes).`,
        });
        continue;
      }

      if (file.size > maxBytes) {
        rejected.push({
          id: uniqueId,
          file,
          status: 'failed',
          progress: 100,
          error: `'${file.name}' exceeds the ${maxMb} MB upload limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
        });
        continue;
      }

      accepted.push({
        id: uniqueId,
        file,
        status: 'idle',
        progress: 0,
      });
    }

    const allNew = [...rejected, ...accepted];
    setQueue(prev => [...prev, ...allNew]);

    if (accepted.length > 0) {
      startUploadBatch(accepted);
    }
  };

  const startUploadBatch = async (items: UploadQueueItem[]) => {
    setBusy(true);

    for (const item of items) {
      patchQueueItem(item.id, { status: 'uploading', progress: 15, error: undefined });

      const formData = new FormData();
      formData.append('files', item.file);
      formData.append('language', language);

      try {
        const res = await api.post('/reports/upload', formData, {
          onUploadProgress: (event) => {
            if (!event.total) return;
            const pct = Math.min(70, Math.round((event.loaded / event.total) * 70));
            patchQueueItem(item.id, { progress: Math.max(15, pct) });
          },
        });

        patchQueueItem(item.id, { status: 'extracting', progress: 85 });

        const payload = res.data as { reports: ExtractedReport[]; errors: { filename: string; detail: string }[] };
        const uploadedReport = payload.reports?.[0];
        const perFileError = payload.errors?.find(e => e.filename === item.file.name);

        if (!uploadedReport) {
          patchQueueItem(item.id, {
            status: 'failed',
            progress: 100,
            error: perFileError?.detail || 'The server could not store this file. Please try again.',
          });
          continue;
        }

        const hasText = uploadedReport.extracted_text && uploadedReport.extracted_text.trim().length > 0;

        // Auto-analyze flow
        if (autoAnalyze && hasText) {
          patchQueueItem(item.id, { status: 'analyzing', progress: 92, report: uploadedReport });
          try {
            await api.post(`/reports/${uploadedReport.id}/analyze`, { language });
            patchQueueItem(item.id, {
              status: 'done',
              progress: 100,
              report: { ...uploadedReport, analysis_status: 'analyzed' },
            });
            await refreshProfile();

            // If single file uploaded, navigate directly to analysis page
            if (items.length === 1) {
              navigate(`/analysis/${uploadedReport.id}`);
              return;
            }
          } catch {
            patchQueueItem(item.id, { status: 'done', progress: 100, report: uploadedReport });
          }
        } else {
          patchQueueItem(item.id, { status: 'done', progress: 100, report: uploadedReport });

          // If single file and no text was extracted, take user to the report to review/paste
          if (items.length === 1 && !hasText) {
            navigate(`/analysis/${uploadedReport.id}`);
            return;
          }
        }
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        patchQueueItem(item.id, {
          status: 'failed',
          progress: 100,
          error: typeof detail === 'string' ? detail : detail?.message || 'Upload failed. Check your file format or connection.',
        });
      }
    }

    setBusy(false);
    await refreshProfile();
  };

  const handleManualAnalyze = async (item: UploadQueueItem) => {
    if (!item.report) return;
    patchQueueItem(item.id, { status: 'analyzing', progress: 90 });
    try {
      await api.post(`/reports/${item.report.id}/analyze`, { language });
      patchQueueItem(item.id, { status: 'done', progress: 100, report: { ...item.report, analysis_status: 'analyzed' } });
      await refreshProfile();
      navigate(`/analysis/${item.report.id}`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      patchQueueItem(item.id, {
        status: 'done',
        error: typeof detail === 'string' ? detail : 'Analysis failed. Try reviewing the text first.',
      });
    }
  };

  const retryItem = (item: UploadQueueItem) => {
    startUploadBatch([item]);
  };

  const removeFromQueue = (itemId: string) => {
    setQueue(prev => prev.filter(i => i.id !== itemId));
  };

  const statusBadge = (item: UploadQueueItem) => {
    switch (item.status) {
      case 'idle':
        return <span className="text-xs font-semibold text-slate-500">Queued</span>;
      case 'uploading':
        return <span className="text-xs font-semibold text-primary-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</span>;
      case 'extracting':
        return <span className="text-xs font-semibold text-teal-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Extracting OCR…</span>;
      case 'analyzing':
        return <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1"><Sparkles className="h-3 w-3 animate-spin" /> Analyzing with AI…</span>;
      case 'done':
        if (item.report?.analysis_status === 'analyzed') {
          return <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Analysis Complete</span>;
        }
        if (!item.report?.extracted_text?.trim()) {
          return <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Needs Text Review</span>;
        }
        return <span className="text-xs font-semibold text-emerald-500">Text Extracted</span>;
      case 'failed':
        return <span className="text-xs font-bold text-red-500">Failed</span>;
    }
  };

  const barColor = (s: ItemStatus) => {
    if (s === 'done') return 'bg-emerald-500';
    if (s === 'failed') return 'bg-red-500';
    if (s === 'analyzing') return 'bg-gradient-to-r from-purple-500 to-primary-500 animate-pulse';
    if (s === 'extracting') return 'bg-teal-500 animate-pulse';
    return 'bg-primary-500';
  };

  const llmUnavailable = systemStatus ? !systemStatus.llm.configured : false;

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <UploadCloud className="h-8 w-8 text-primary-500" />
          {t('uploadReport')}
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Upload medical reports (Blood Work, CBC, Lipid Profile, Thyroid, Imaging). MediSense AI extracts
          test results and computes personalized health scores and risk insights.
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
            className="shrink-0 flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-transform active:scale-95 cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" /> Configure Gemini Key
          </button>
        </div>
      )}

      {/* Hidden native input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
      />

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

        {/* Dropzone container */}
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
              ? 'border-primary-500 bg-primary-50/40 dark:bg-primary-950/20 scale-[0.99]'
              : 'border-slate-200 hover:border-primary-400 hover:bg-slate-50/50 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800/10'
          }`}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-500 dark:bg-primary-950/20">
            <UploadCloud className="h-8 w-8" />
          </div>

          <h3 className="mt-4 font-bold text-slate-700 dark:text-slate-200 text-base">
            Drag &amp; drop reports here, or choose from device
          </h3>
          <p className="mt-1.5 text-xs text-slate-400">
            Supports {allowedExtensions.map(e => e.toUpperCase()).join(', ')} up to {maxMb} MB each
          </p>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="mt-5 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-primary-500/15 hover:brightness-105 active:scale-95 transition-all cursor-pointer"
          >
            Browse Files
          </button>
        </div>

        {/* Uploaded Queue */}
        {queue.length > 0 && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Reports ({queue.length})
              </h3>
              {queue.length > 1 && (
                <button
                  onClick={() => setQueue([])}
                  className="text-xs text-slate-400 hover:text-red-500 font-semibold"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="space-y-3">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-100 p-4 dark:border-slate-700/50 dark:bg-navy-800 bg-slate-50/50 shadow-sm transition-all"
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
                          {item.file.size ? `${(item.file.size / 1024 / 1024).toFixed(2)} MB` : 'Invalid file'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {statusBadge(item)}

                      {item.status === 'failed' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => retryItem(item)}
                            className="flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline"
                          >
                            <RotateCcw className="h-3 w-3" /> Retry
                          </button>
                          <button
                            onClick={() => removeFromQueue(item.id)}
                            className="text-xs font-bold text-slate-400 hover:text-red-500"
                          >
                            Remove
                          </button>
                        </div>
                      )}

                      {item.status === 'idle' && (
                        <button
                          onClick={() => removeFromQueue(item.id)}
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
                              className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-600 active:scale-95 transition-all cursor-pointer"
                            >
                              View Analysis <ArrowRight className="h-3 w-3" />
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleManualAnalyze(item)}
                                className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-primary-500 to-teal-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:brightness-105 active:scale-95 transition-all cursor-pointer"
                              >
                                <Sparkles className="h-3 w-3" /> Analyze with AI
                              </button>
                              <button
                                onClick={() => navigate(`/analysis/${item.report!.id}`)}
                                className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 hover:underline cursor-pointer"
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
                        <div className="mt-3 space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
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
                          {!item.report.extracted_text?.trim() && (
                            <p className="font-semibold text-amber-700 dark:text-amber-400">
                              No readable text found in this scan. You can open this report and paste the values manually before analyzing.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
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
