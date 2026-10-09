import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  MessageSquareCode, Send, Sparkles, FileText, Info, Loader2,
  AlertTriangle, Bot, ExternalLink
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSystemStatus } from '../context/SystemStatusContext';
import { useTranslation } from '../hooks/useTranslation';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface DropdownReport {
  id: string;
  filename: string;
  report_type: string;
  analysis_status?: string;
  created_at: string;
}

const detailOf = (err: any, fallback: string): string => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return detail.message;
  return fallback;
};

export const Chat: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { status: systemStatus } = useSystemStatus();
  const [searchParams] = useSearchParams();
  const requestedReport = searchParams.get('report');

  const [reports, setReports] = useState<DropdownReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [sources, setSources] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiGenerated, setAiGenerated] = useState<boolean | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    if (selectedReportId) {
      fetchChatHistory(selectedReportId);
    } else {
      setMessages([]);
    }
    setSources([]);
    setError(null);
  }, [selectedReportId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const fetchReports = async () => {
    try {
      const res = await api.get('/reports/all');
      const list: DropdownReport[] = res.data;
      setReports(list);
      // Prefer the report the user came from, but only if it can actually be queried.
      const usable = list.filter(r => r.analysis_status === 'analyzed');
      const wanted = usable.find(r => r.id === requestedReport);
      if (wanted) {
        setSelectedReportId(wanted.id);
      } else if (usable.length > 0) {
        setSelectedReportId(usable[0].id);
      } else if (list.length > 0) {
        setSelectedReportId(list[0].id);
      }
    } catch (err) {
      setError(detailOf(err, 'Could not load your reports.'));
    } finally {
      setReportsLoading(false);
    }
  };

  const fetchChatHistory = async (reportId: string) => {
    try {
      const res = await api.get(`/chat/history/${reportId}`);
      setMessages(res.data);
    } catch (err) {
      setError(detailOf(err, 'Could not load this conversation.'));
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedReportId || loading) return;

    const userMessageText = input.trim();
    setInput('');
    setLoading(true);
    setSources([]);
    setError(null);

    setMessages(prev => [...prev, {
      role: 'user',
      content: userMessageText,
      created_at: new Date().toISOString(),
    }]);

    try {
      const res = await api.post('/chat/send', {
        report_id: selectedReportId,
        message: userMessageText,
        language: user?.language || 'en',
      });

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.response,
        created_at: new Date().toISOString(),
      }]);
      setSources(res.data.sources || []);
      setNotice(res.data.notice || null);
      setAiGenerated(res.data.ai_generated);
    } catch (err: any) {
      const status = err?.response?.status;
      const message = status === 409
        ? 'This report has not been analysed yet, so there is nothing grounded to answer from. Open it, review the extracted text and run the analysis.'
        : detailOf(err, 'The assistant could not answer. Check that the backend server is reachable.');
      setError(message);
      // Roll back the optimistic user bubble so the transcript matches what the server stored.
      setMessages(prev => prev.slice(0, -1));
      setInput(userMessageText);
    } finally {
      setLoading(false);
    }
  };

  const clearChatHistory = async () => {
    if (!selectedReportId) return;
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;

    try {
      await api.post(`/chat/clear/${selectedReportId}`);
      setMessages([]);
      setSources([]);
      setNotice(null);
      setAiGenerated(null);
    } catch (err) {
      setError(detailOf(err, 'Could not clear this conversation.'));
    }
  };

  const selectedReport = reports.find(r => r.id === selectedReportId);
  const isAnalysed = selectedReport?.analysis_status === 'analyzed';
  const analysedCount = reports.filter(r => r.analysis_status === 'analyzed').length;

  const groundingNotice = notice
    || (systemStatus && !systemStatus.llm.configured
      ? `No AI model is configured (${systemStatus.llm.reason}). Answers are limited to text retrieved from your report and the bundled reference documents.`
      : null);

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-4xl mx-auto space-y-4 font-sans">
      {/* Header */}
      <div className="rounded-3xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-navy-800 shadow-glass flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquareCode className="h-6 w-6 text-primary-500" />
          <span className="font-extrabold text-slate-800 dark:text-slate-100">Report Assistant</span>
          {aiGenerated !== null && (
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              aiGenerated
                ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/30 dark:text-primary-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}>
              <Bot className="h-3 w-3" />
              {aiGenerated ? 'AI-generated' : 'Retrieved evidence only'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400 shrink-0">Report:</span>
          <select
            value={selectedReportId}
            onChange={(e) => setSelectedReportId(e.target.value)}
            disabled={reportsLoading}
            className="text-xs rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none dark:border-slate-700 dark:bg-navy-900 dark:text-white flex-1 sm:flex-none max-w-[16rem]"
          >
            {reports.length === 0 ? (
              <option value="">-- No reports found --</option>
            ) : (
              reports.map(r => (
                <option key={r.id} value={r.id}>
                  {r.filename}{r.analysis_status === 'analyzed' ? '' : ' (not analysed)'}
                </option>
              ))
            )}
          </select>

          {messages.length > 0 && (
            <button
              onClick={clearChatHistory}
              className="text-xs font-bold text-red-500 hover:underline px-2"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Grounding notice */}
      {groundingNotice && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800 dark:border-amber-950/30 dark:bg-amber-950/10 dark:text-amber-300 shrink-0">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{groundingNotice}</span>
          </p>
          <p className="mt-1.5 pl-5 text-amber-700/80 dark:text-amber-400/80">
            This assistant is not a doctor and is not a substitute for professional medical advice.
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass overflow-y-auto space-y-4">
        {reports.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-slate-400 text-xs">
            <div className="max-w-xs space-y-3">
              <FileText className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p>Upload and analyse a medical report before asking questions about it.</p>
              <Link to="/upload" className="inline-flex items-center gap-1 font-bold text-primary-500 hover:underline">
                Upload a report <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ) : analysedCount === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-slate-400 text-xs">
            <div className="max-w-sm space-y-3">
              <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
              <p className="font-bold text-slate-700 dark:text-slate-200">No analysed reports yet</p>
              <p>
                The assistant only answers from report text that has been reviewed and analysed, so it
                cannot invent details. Open a report, confirm the extracted text and run the analysis.
              </p>
              <Link
                to={`/analysis/${reports[0].id}`}
                className="inline-flex items-center gap-1 font-bold text-primary-500 hover:underline"
              >
                Review {reports[0].filename} <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-slate-400 text-xs">
            <div className="max-w-xs space-y-2">
              <Sparkles className="mx-auto h-8 w-8 text-primary-400" />
              <p className="font-bold text-slate-700 dark:text-slate-200">Ask about this report</p>
              <p>
                For example: “What was my LDL value?”, “Which results are outside the printed range?”,
                “What does this test measure?”
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-3xl p-4 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary-500 text-white rounded-br-none'
                    : 'bg-slate-50 text-slate-700 dark:bg-navy-900 dark:text-slate-200 rounded-bl-none border border-slate-100 dark:border-slate-800'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-3xl p-4 bg-slate-50 dark:bg-navy-900 text-slate-400 text-sm flex items-center gap-2 border border-slate-100 dark:border-slate-800 rounded-bl-none">
              <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
              <span>Searching the report and reference documents…</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Errors */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-950/30 dark:bg-red-950/10 dark:text-red-300 shrink-0">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </p>
          {selectedReport && !isAnalysed && (
            <Link
              to={`/analysis/${selectedReport.id}`}
              className="mt-2 inline-flex items-center gap-1 pl-5 font-bold text-red-600 hover:underline dark:text-red-400"
            >
              Open this report to review and analyse it <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}

      {/* RAG sources */}
      {sources.length > 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-navy-800/40 flex items-center gap-2 shrink-0">
          <Info className="h-4 w-4 text-primary-500 shrink-0" />
          <span className="text-[10px] text-slate-400">
            Grounded on: <span className="font-semibold text-slate-600 dark:text-slate-300">{sources.join(', ')}</span>
          </span>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={reports.length === 0 || !isAnalysed || loading}
          placeholder={
            reports.length === 0
              ? 'Upload a report first'
              : !isAnalysed
                ? 'Analyse this report before asking questions'
                : t('chatPlaceholder')
          }
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-primary-500 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-navy-800 dark:text-white dark:disabled:bg-navy-900"
        />
        <button
          type="submit"
          disabled={reports.length === 0 || !isAnalysed || loading || !input.trim()}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 text-white shadow-md shadow-primary-500/10 hover:scale-105 active:scale-95 transition-transform disabled:scale-100 disabled:opacity-50"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
};
