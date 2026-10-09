import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud, File, AlertCircle, Loader2, ArrowRight,
  ScanText, FileWarning, ClipboardEdit
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSystemStatus } from '../context/SystemStatusContext';
import { useTranslation } from '../hooks/useTranslation';

interface ExtractedReport {
  id: string;
  filename: string;
  analysis_status: string;
  extraction_engine: string | null;
  page_count: number | null;
  extraction_warnings: string[];
  extracted_text: string;
}

type ItemStatus = 'idle' | 'uploading' | 'extracting' | 'done' | 'failed';

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
  vision_model: 'Vision model',
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
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
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
      // Surfaced inline rather than with alert() so several rejections stay readable.
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
      setQueue(prev => [...prev, ...accepted]);
    }
  };

  const removeFromQueue = (index: number) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
  };

  const patchItem = (index: number, patch: Partial<UploadQueueItem>) => {
    setQueue(prev => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const startUpload = async () => {
    if (busy) return;
    const pending = queue
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.status === 'idle');
    if (pending.length === 0) return;

    setBusy(true);
    for (const { item, index } of pending) {
      const formData = new FormData();
      formData.append('files', item.file);
      formData.append('language', language);

      patchItem(index, { status: 'uploading', progress: 5, error: undefined });

      try {
        const res = await api.post('/reports/upload', formData, {
          onUploadProgress: (event) => {
            if (!event.total) return;
            // Upload bytes only cover part of the work; OCR follows server-side.
            const pct = Math.min(70, Math.round((event.loaded / event.total) * 70));
            patchItem(index, { progress: Math.max(5, pct) });
          },
        });

        patchItem(index, { status: 'extracting', progress: 85 });

        const payload = res.data as { reports: ExtractedReport[]; errors: { filename: string; detail: string }[] };
        const uploaded = payload.reports?.[0];
        const perFileError = payload.errors?.find(e => e.filename === item.file.name);

        if (!uploaded) {
          patchItem(index, {
            status: 'failed',
            progress: 100,
            error: perFileError?.detail || 'The server could not store this file.',
          });
          continue;
        }

        patchItem(index, { status: 'done', progress: 100, report: uploaded });
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        patchItem(index, {
          status: 'failed',
          progress: 100,
          error: typeof detail === 'string' ? detail : detail?.message || 'Upload failed. Check your connection and try again.',
        });
      }
    }
    setBusy(false);
    await refreshProfile();
  };

  const statusText = (item: UploadQueueItem): string => {
    switch (item.status) {
      case 'idle': return 'Queued';
      case 'uploading': return 'Uploading…';
      case 'extracting': return 'Extracting text (OCR)…';
      case 'done': return item.report?.analysis_status === 'extraction_failed' ? 'Needs review' : 'Text extracted';
      case 'failed': return 'Failed';
    }
  };

  const barColor = (s: ItemStatus) => {
    if (s === 'done') return 'bg-emerald-500';
    if (s === 'failed') return 'bg-red-500';
    if (s === 'extracting') return 'bg-teal-500 animate-pulse';
    return 'bg-primary-500';
  };

  const hasPending = queue.some(item => item.status === 'idle');
  const ocrUnavailable = systemStatus ? !systemStatus.ocr.any_engine_available : false;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <UploadCloud className="h-8 w-8 text-primary-500" />
          {t('uploadReport')}
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Upload blood work, lipid profiles, CBC, thyroid or imaging reports. Uploading extracts the
          text only — you review and correct it before any analysis runs.
        </p>
      </div>

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
        <div className="max-w-xs">
          <label htmlFor="uploadLang" className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            Analysis Output Language
          </label>
          <select
            id="uploadLang"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
          >
            <option value="en">English</option>
            <option value="hi">Hindi (हिन्दी)</option>
            <option value="te">Telugu (తెలుగు)</option>
          </select>
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
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Files ({queue.length})
            </h3>
            <div className="space-y-3">
              {queue.map((item, idx) => (
                <div
                  key={`${item.file.name}-${idx}`}
                  className="rounded-2xl border border-slate-100 p-4 dark:border-slate-700/50 dark:bg-navy-800 bg-slate-50/50"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 truncate">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-400 dark:bg-navy-900 border border-slate-100 dark:border-slate-800">
                        {item.status === 'failed' ? <FileWarning className="h-5 w-5 text-red-400" /> : <File className="h-5 w-5" />}
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
                        <button
                          onClick={() => navigate(`/analysis/${item.report!.id}`)}
                          className="flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline dark:text-primary-400"
                        >
                          <ClipboardEdit className="h-3.5 w-3.5" /> Review text <ArrowRight className="h-3 w-3" />
                        </button>
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

            <div className="flex items-center justify-between gap-3 pt-3">
              <p className="text-[11px] text-slate-400">
                Step 1 of 2 — upload and extract. Analysis runs after you confirm the text.
              </p>
              <button
                onClick={startUpload}
                disabled={busy || !hasPending}
                className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-primary-500/10 transition-transform active:scale-95 disabled:scale-100 disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  'Upload & extract text'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
