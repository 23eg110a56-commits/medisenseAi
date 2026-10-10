import React, { useState } from 'react';
import { Sparkles, X, Key, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import api from '../services/api';
import { useSystemStatus } from '../context/SystemStatusContext';

interface ConfigureGeminiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConfigureGeminiModal: React.FC<ConfigureGeminiModalProps> = ({ isOpen, onClose }) => {
  const { refresh } = useSystemStatus();
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('Please enter a valid Gemini API key.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/system/configure-gemini', { api_key: apiKey.trim() });
      if (res.data?.success) {
        setSuccess(true);
        refresh();
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to configure Gemini. Please verify the API key.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-navy-800 space-y-6">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-navy-700 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary-500 to-teal-400 text-white shadow-lg shadow-primary-500/25">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">
              Enable Google Gemini AI
            </h3>
            <p className="text-xs text-slate-400">
              Power report analysis & clinical chatbot with Gemini 2.5 Flash
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-primary-100 bg-primary-50/50 p-4 text-xs leading-relaxed text-slate-600 dark:border-primary-950/30 dark:bg-primary-950/10 dark:text-slate-300">
          <p className="font-semibold text-primary-700 dark:text-primary-300 mb-1">
            How to get a Free Google Gemini API Key:
          </p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Visit Google AI Studio (no credit card required).</li>
            <li>Click <strong>Create API Key</strong> and copy your key.</li>
            <li>Paste your key below to immediately activate full AI capabilities.</li>
          </ol>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 font-bold text-primary-600 hover:underline dark:text-primary-400"
          >
            Get Free Gemini API Key from Google AI Studio <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-950/30 dark:bg-red-950/20 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 dark:border-emerald-950/30 dark:bg-emerald-950/20 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Gemini AI successfully activated! Updating system...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="geminiKeyInput" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Gemini API Key
            </label>
            <div className="relative">
              <Key className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input
                id="geminiKeyInput"
                type="password"
                placeholder="AIzaSy..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={loading || success}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm font-mono outline-none focus:border-primary-500 focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading || success}
              className="rounded-2xl border border-slate-200 px-5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-navy-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || success || !apiKey.trim()}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-primary-500/20 transition-transform active:scale-95 disabled:scale-100 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Activating…
                </>
              ) : success ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Activated!
                </>
              ) : (
                'Activate Gemini AI'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
