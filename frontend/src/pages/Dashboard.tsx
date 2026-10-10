import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  FileText, Activity, TrendingUp, TrendingDown, 
  ArrowUpRight, Heart, Brain, Calendar, Info, Loader2,
  Droplets, HeartPulse, Scale, Plus, AlertTriangle, CheckCircle2,
  Sparkles, ArrowRight, ShieldAlert, Stethoscope,
  Calculator, RotateCcw, Save, Zap, ChevronDown, ChevronUp,
  FilePlus, ClipboardCheck, Check, MessageSquare
} from 'lucide-react';
import { 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ReferenceLine, AreaChart, Area 
} from 'recharts';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { 
  Biomarker, 
  extractBiomarkerValue, 
  getGlucoseStatus, 
  getHba1cDetails, 
  getHemoglobinStatus, 
  getLipidStatus, 
  getBpStatus,
  parseBiomarkersFromText,
  computeComprehensiveClinicalOperations,
  ClinicalOperationsResult,
  ExtractedClinicalData,
  SAMPLE_TEXT_REPORTS
} from '../utils/healthMetrics';
import { QuickLogVitalsModal } from '../components/QuickLogVitalsModal';

interface Report {
  id: string;
  filename: string;
  report_type: string;
  summary: string;
  health_score: number | null;
  analysis_status?: string;
  analysis_mode?: 'rule_based' | 'llm' | null;
  biomarkers: Biomarker[];
  recommendations: {
    diet?: string[];
    lifestyle?: string[];
  };
  created_at: string;
}

interface VitalLog {
  id: string;
  blood_sugar?: number | null;
  sugar_type?: string;
  hba1c?: number | null;
  hemoglobin?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  weight?: number | null;
  heart_rate?: number | null;
  notes?: string | null;
  recorded_at: string;
}

type TrendTab = 'sugar' | 'hemoglobin' | 'lipids' | 'metabolic' | 'overall';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [reports, setReports] = useState<Report[]>([]);
  const [vitals, setVitals] = useState<VitalLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TrendTab>('sugar');

  // Text Report Studio & Clinical Operations State
  const [reportText, setReportText] = useState<string>('');
  const [textReportTitle, setTextReportTitle] = useState<string>('Clinical Text Report');
  const [textAnalysis, setTextAnalysis] = useState<ClinicalOperationsResult | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedClinicalData | null>(null);
  const [includeTextInGraph, setIncludeTextInGraph] = useState<boolean>(true);
  const [isSavingTextReport, setIsSavingTextReport] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [showStudio, setShowStudio] = useState<boolean>(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [reportsRes, vitalsRes] = await Promise.allSettled([
        api.get('/reports/all'),
        api.get('/vitals/all'),
      ]);

      if (reportsRes.status === 'fulfilled') {
        setReports(reportsRes.value.data || []);
      }
      if (vitalsRes.status === 'fulfilled') {
        setVitals(vitalsRes.value.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Analyze pasted or selected text
  const handleAnalyzeText = (textToAnalyze?: string) => {
    const targetText = textToAnalyze !== undefined ? textToAnalyze : reportText;
    if (!targetText.trim()) return;

    const parsed = parseBiomarkersFromText(targetText);
    const operations = computeComprehensiveClinicalOperations(parsed, user?.age || 40);

    setExtractedData(parsed);
    setTextAnalysis(operations);
    setSaveSuccessMsg(null);
    setSaveErrorMsg(null);
  };

  // Load pre-made sample report
  const handleLoadSample = (sampleId: string) => {
    const sample = SAMPLE_TEXT_REPORTS.find((s) => s.id === sampleId);
    if (!sample) return;
    setReportText(sample.text);
    setTextReportTitle(sample.title);
    handleAnalyzeText(sample.text);
  };

  // Save text report to MongoDB Atlas
  const handleSaveTextReport = async () => {
    if (!reportText.trim()) return;
    setIsSavingTextReport(true);
    setSaveSuccessMsg(null);
    setSaveErrorMsg(null);

    try {
      await api.post('/reports/text-report', {
        title: textReportTitle || 'Clinical Text Report',
        extracted_text: reportText,
        language: user?.language || 'en',
      });
      setSaveSuccessMsg('Report successfully saved to your medical records! Graph updated.');
      await loadDashboardData();
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to save text report.';
      setSaveErrorMsg(typeof msg === 'string' ? msg : 'Error saving report.');
    } finally {
      setIsSavingTextReport(false);
    }
  };

  // Clear studio
  const handleClearStudio = () => {
    setReportText('');
    setTextAnalysis(null);
    setExtractedData(null);
    setSaveSuccessMsg(null);
    setSaveErrorMsg(null);
  };

  const analysedReports = useMemo(
    () => reports.filter((r) => r.analysis_status === 'analyzed'),
    [reports]
  );

  // Merge report biomarkers, manual vitals, and live text report analysis into a timeline
  const timelineData = useMemo(() => {
    interface TimelinePoint {
      timestamp: number;
      date: string;
      source: 'report' | 'vital';
      healthScore?: number | null;
      bloodSugar?: number | null;
      sugarType?: string;
      hba1c?: number | null;
      hemoglobin?: number | null;
      totalCholesterol?: number | null;
      ldl?: number | null;
      hdl?: number | null;
      triglycerides?: number | null;
      creatinine?: number | null;
      alt?: number | null;
      ast?: number | null;
      systolicBp?: number | null;
      diastolicBp?: number | null;
      weight?: number | null;
    }

    const points: TimelinePoint[] = [];

    // 1. Points from Lab Reports
    for (const rep of analysedReports) {
      const ts = new Date(rep.created_at).getTime();
      const dateStr = new Date(rep.created_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });

      const sugar = extractBiomarkerValue(rep.biomarkers, [
        'fasting blood sugar', 'fasting glucose', 'fbs', 'blood glucose', 'glucose', 'sugar', 'rbs', 'ppbs'
      ]);
      const hba1c = extractBiomarkerValue(rep.biomarkers, [
        'hba1c', 'glycated hemoglobin', 'glycohemoglobin', 'hemoglobin a1c'
      ]);
      const hb = extractBiomarkerValue(rep.biomarkers, [
        'hemoglobin', 'haemoglobin', 'hb', 'hgb', 'total hemoglobin'
      ]);
      const chol = extractBiomarkerValue(rep.biomarkers, ['total cholesterol', 'cholesterol']);
      const ldl = extractBiomarkerValue(rep.biomarkers, ['ldl', 'low density']);
      const hdl = extractBiomarkerValue(rep.biomarkers, ['hdl', 'high density']);
      const trig = extractBiomarkerValue(rep.biomarkers, ['triglyceride']);
      const creat = extractBiomarkerValue(rep.biomarkers, ['creatinine', 'serum creatinine']);
      const alt = extractBiomarkerValue(rep.biomarkers, ['alt', 'sgpt', 'alanine']);
      const ast = extractBiomarkerValue(rep.biomarkers, ['ast', 'sgot', 'aspartate']);

      points.push({
        timestamp: ts,
        date: dateStr,
        source: 'report',
        healthScore: rep.health_score,
        bloodSugar: sugar,
        sugarType: 'fasting',
        hba1c,
        hemoglobin: hb,
        totalCholesterol: chol,
        ldl,
        hdl,
        triglycerides: trig,
        creatinine: creat,
        alt,
        ast,
      });
    }

    // 2. Points from Manual Vitals
    for (const v of vitals) {
      const ts = new Date(v.recorded_at).getTime();
      const dateStr = new Date(v.recorded_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });

      points.push({
        timestamp: ts,
        date: dateStr,
        source: 'vital',
        bloodSugar: v.blood_sugar,
        sugarType: v.sugar_type || 'fasting',
        hba1c: v.hba1c,
        hemoglobin: v.hemoglobin,
        systolicBp: v.systolic_bp,
        diastolicBp: v.diastolic_bp,
        weight: v.weight,
      });
    }

    // 3. Point from Live Text Report Studio Analysis
    if (includeTextInGraph && extractedData && textAnalysis) {
      const m = extractedData.metrics;
      const sugarVal = m.fbs ?? m.ppbs ?? m.rbs;
      const hasAnyMetric =
        sugarVal !== null ||
        m.hba1c !== null ||
        m.hemoglobin !== null ||
        m.totalCholesterol !== null ||
        m.creatinine !== null;

      if (hasAnyMetric) {
        points.push({
          timestamp: Date.now(),
          date: 'Text Report (Live)',
          source: 'report',
          healthScore: textAnalysis.calculations.healthScore,
          bloodSugar: sugarVal,
          sugarType: m.fbs ? 'fasting' : 'post_meal',
          hba1c: m.hba1c,
          hemoglobin: m.hemoglobin,
          totalCholesterol: m.totalCholesterol,
          ldl: m.ldl,
          hdl: m.hdl,
          triglycerides: m.triglycerides,
          creatinine: m.creatinine,
          alt: m.alt,
          ast: m.ast,
          systolicBp: m.systolicBp,
          diastolicBp: m.diastolicBp,
          weight: m.weight,
        });
      }
    }

    // Sort chronologically ascending
    return points.sort((a, b) => a.timestamp - b.timestamp);
  }, [analysedReports, vitals, includeTextInGraph, extractedData, textAnalysis]);

  // Derived latest metrics
  const latestSugarPoint = useMemo(() => {
    const valid = timelineData.filter((p) => p.bloodSugar !== null && p.bloodSugar !== undefined);
    return valid.length > 0 ? valid[valid.length - 1] : null;
  }, [timelineData]);

  const prevSugarPoint = useMemo(() => {
    const valid = timelineData.filter((p) => p.bloodSugar !== null && p.bloodSugar !== undefined);
    return valid.length > 1 ? valid[valid.length - 2] : null;
  }, [timelineData]);

  const latestHbPoint = useMemo(() => {
    const valid = timelineData.filter((p) => p.hemoglobin !== null && p.hemoglobin !== undefined);
    return valid.length > 0 ? valid[valid.length - 1] : null;
  }, [timelineData]);

  const prevHbPoint = useMemo(() => {
    const valid = timelineData.filter((p) => p.hemoglobin !== null && p.hemoglobin !== undefined);
    return valid.length > 1 ? valid[valid.length - 2] : null;
  }, [timelineData]);

  const latestHba1c = useMemo(() => {
    const valid = timelineData.filter((p) => p.hba1c !== null && p.hba1c !== undefined);
    return valid.length > 0 ? valid[valid.length - 1].hba1c! : null;
  }, [timelineData]);

  const latestLipidPoint = useMemo(() => {
    const valid = timelineData.filter((p) => p.totalCholesterol || p.ldl || p.hdl);
    return valid.length > 0 ? valid[valid.length - 1] : null;
  }, [timelineData]);

  // Metric Statuses
  const sugarStatus = getGlucoseStatus(
    latestSugarPoint?.bloodSugar ?? user?.fasting_sugar ?? null,
    latestSugarPoint?.sugarType ?? 'fasting'
  );
  const hba1cStatus = getHba1cDetails(latestHba1c);
  const hbStatus = getHemoglobinStatus(latestHbPoint?.hemoglobin ?? null, user?.gender);
  const lipidStatus = getLipidStatus(
    latestLipidPoint?.totalCholesterol ?? null,
    latestLipidPoint?.ldl ?? null,
    latestLipidPoint?.hdl ?? null
  );

  // BMI calculation
  const userWeight = vitals.find((v) => v.weight)?.weight || user?.weight;
  const userHeight = user?.height;
  const bmiVal = userWeight && userHeight ? (userWeight / (userHeight * userHeight)).toFixed(1) : null;
  const bpStatus = getBpStatus(user?.systolic_bp || null, user?.diastolic_bp || null);

  const latestReport = analysedReports[0] ?? null;
  const totalUploads = reports.length;
  const pendingReview = reports.length - analysedReports.length;
  const currentHealthScore = latestReport ? latestReport.health_score : null;

  // Score coloring
  const getScoreColor = (score: number | null) => {
    if (score === null || score === undefined) {
      return 'text-slate-500 border-slate-100 bg-slate-50/60 dark:bg-navy-800 dark:border-slate-800 dark:text-slate-300';
    }
    if (score >= 85) return 'text-emerald-500 border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/15 dark:border-emerald-950/20';
    if (score >= 70) return 'text-primary-500 border-primary-100 bg-primary-50/50 dark:bg-primary-950/15 dark:border-primary-950/20';
    if (score >= 50) return 'text-amber-500 border-amber-100 bg-amber-50/50 dark:bg-amber-950/15 dark:border-amber-950/20';
    return 'text-red-500 border-red-100 bg-red-50/50 dark:bg-red-950/15 dark:border-red-950/20';
  };

  // Compute stat summary for current active tab
  const tabStats = useMemo(() => {
    if (activeTab === 'sugar') {
      const vals = timelineData.map((p) => p.bloodSugar).filter((v): v is number => typeof v === 'number');
      if (vals.length === 0) return null;
      return {
        unit: 'mg/dL',
        latest: vals[vals.length - 1],
        avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }
    if (activeTab === 'hemoglobin') {
      const vals = timelineData.map((p) => p.hemoglobin).filter((v): v is number => typeof v === 'number');
      if (vals.length === 0) return null;
      return {
        unit: 'g/dL',
        latest: vals[vals.length - 1],
        avg: parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)),
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }
    if (activeTab === 'lipids') {
      const vals = timelineData.map((p) => p.totalCholesterol).filter((v): v is number => typeof v === 'number');
      if (vals.length === 0) return null;
      return {
        unit: 'mg/dL',
        latest: vals[vals.length - 1],
        avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }
    if (activeTab === 'overall') {
      const vals = timelineData.map((p) => p.healthScore).filter((v): v is number => typeof v === 'number');
      if (vals.length === 0) return null;
      return {
        unit: 'pts',
        latest: vals[vals.length - 1],
        avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }
    return null;
  }, [activeTab, timelineData]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-500" />
          <p className="mt-2 text-sm text-slate-400">Loading your health dashboard &amp; clinical trends...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome & Quick Action Header */}
      <div className="rounded-3xl bg-gradient-to-r from-primary-600 via-primary-500 to-teal-500 p-8 text-white shadow-xl shadow-primary-500/10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold tracking-wide uppercase text-white backdrop-blur">
              <Sparkles className="h-3 w-3" /> Personalized Health Intelligence
            </span>
            <h1 className="mt-3 text-2xl font-extrabold sm:text-3xl">
              {t('welcome')}, {user?.name}!
            </h1>
            <p className="mt-2 text-sm text-white/90 max-w-xl leading-relaxed">
              Tracking your blood glucose, hemoglobin vitality, lipid profiles, and comprehensive lab metrics with grounded AI.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setLogModalOpen(true)}
              className="flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-xs font-bold text-primary-600 shadow-md hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4 text-rose-500" /> Quick Log Reading
            </button>
            <Link
              to="/upload"
              className="flex items-center gap-2 rounded-2xl bg-white/20 px-5 py-3 text-xs font-bold text-white backdrop-blur hover:bg-white/30 active:scale-95 transition-all"
            >
              <FileText className="h-4 w-4" /> Upload Lab Report
            </Link>
          </div>
        </div>

        {pendingReview > 0 && (
          <div className="mt-5 border-t border-white/20 pt-4">
            <Link
              to="/history"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400/25 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-400/35 transition-colors"
            >
              <Info className="h-3.5 w-3.5" />
              {pendingReview} uploaded report(s) awaiting text verification &amp; analysis →
            </Link>
          </div>
        )}
      </div>

      {/* 📝 CLINICAL TEXT REPORT STUDIO & MULTI-METHOD DIAGNOSTIC ENGINE */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass space-y-6 transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5 dark:border-slate-700">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-teal-500 text-white shadow-md shadow-primary-500/20">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-slate-800 dark:text-white">
                  Clinical Text Report Studio &amp; Multi-Method Diagnostic Engine
                </h2>
                <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[10px] font-extrabold text-primary-600 dark:bg-primary-950/30 dark:text-primary-400 border border-primary-200/60 dark:border-primary-800/40">
                  Text-Driven Analytics
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Paste any laboratory text, doctor consultation notes, or SMS test results to instantaneously drive dashboard trends, compute clinical risk indices, and generate executive medical summaries.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center">
            <button
              onClick={() => setShowStudio(!showStudio)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-navy-700 transition"
            >
              {showStudio ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showStudio ? 'Collapse Studio' : 'Expand Studio'}
            </button>
          </div>
        </div>

        {showStudio && (
          <div className="space-y-5 animate-fade-in">
            {/* Quick Presets Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl dark:bg-navy-900/50 border border-slate-100 dark:border-slate-700/50">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" /> One-Click Presets:
                </span>
                <button
                  type="button"
                  onClick={() => handleLoadSample('sample_comprehensive')}
                  className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm border border-slate-200 hover:border-teal-500 hover:text-teal-600 dark:bg-navy-800 dark:text-slate-200 dark:border-slate-700 transition"
                >
                  🧪 Comprehensive Panel (Sugar, Lipids, CBC)
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample('sample_diabetes')}
                  className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm border border-slate-200 hover:border-rose-500 hover:text-rose-600 dark:bg-navy-800 dark:text-slate-200 dark:border-slate-700 transition"
                >
                  🩸 Diabetic &amp; Glycemic Note
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample('sample_anemia')}
                  className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm border border-slate-200 hover:border-cyan-500 hover:text-cyan-600 dark:bg-navy-800 dark:text-slate-200 dark:border-slate-700 transition"
                >
                  🩺 CBC Anemia Profile
                </button>
              </div>

              {reportText && (
                <button
                  type="button"
                  onClick={handleClearStudio}
                  className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-rose-500 transition"
                >
                  <RotateCcw className="h-3 w-3" /> Clear Text
                </button>
              )}
            </div>

            {/* Textarea Input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary-500" /> Medical Report Text / Clinical Notes
                </label>
                <span className="text-[11px] text-slate-400">
                  {reportText.length} characters • {reportText.split(/\r?\n/).filter(Boolean).length} lines
                </span>
              </div>
              <textarea
                rows={6}
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                placeholder={`Paste medical text here... E.g.
Fasting Blood Sugar: 98 mg/dL (Normal < 100)
HbA1c: 5.4 % (Optimal < 5.7)
Hemoglobin: 14.8 g/dL (Reference 13.5 - 17.5)
Total Cholesterol: 195 mg/dL, Triglycerides: 142 mg/dL, HDL: 52 mg/dL
Serum Creatinine: 0.95 mg/dL, Blood Pressure: 118/78 mmHg`}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-4 font-mono text-xs leading-relaxed text-slate-800 outline-none transition focus:border-primary-500 focus:bg-white dark:border-slate-700 dark:bg-navy-900/60 dark:text-slate-200 dark:focus:bg-navy-900"
              />
            </div>

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleAnalyzeText()}
                  disabled={!reportText.trim()}
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary-600 via-primary-500 to-teal-500 px-6 py-3 text-xs font-extrabold text-white shadow-md shadow-primary-500/20 hover:brightness-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition cursor-pointer"
                >
                  <Zap className="h-4 w-4" /> ⚡ Analyze &amp; Update Dashboard Graphs
                </button>

                <button
                  type="button"
                  onClick={handleSaveTextReport}
                  disabled={!reportText.trim() || isSavingTextReport}
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-bold text-slate-700 hover:border-slate-300 hover:bg-slate-50 active:scale-95 disabled:opacity-50 disabled:pointer-events-none dark:border-slate-700 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700 transition cursor-pointer"
                >
                  {isSavingTextReport ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
                  ) : (
                    <Save className="h-4 w-4 text-primary-500" />
                  )}
                  Save to Permanent Records
                </button>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTextInGraph}
                  onChange={(e) => setIncludeTextInGraph(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                />
                Include in Trend Graphs &amp; Vitals
              </label>
            </div>

            {/* Status Notifications */}
            {saveSuccessMsg && (
              <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-3.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}
            {saveErrorMsg && (
              <div className="flex items-center gap-2 rounded-2xl bg-rose-50 p-3.5 text-xs font-bold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                <span>{saveErrorMsg}</span>
              </div>
            )}

            {/* ANALYSIS RESULTS SUITE */}
            {textAnalysis && extractedData && (
              <div className="space-y-6 pt-3 border-t border-slate-100 dark:border-slate-700/60 animate-fade-in">
                
                {/* 1. CLEAR & BRIEF EXECUTIVE SUMMARY */}
                <div className="rounded-3xl border border-teal-200/80 bg-gradient-to-br from-teal-50/70 via-emerald-50/40 to-white p-6 dark:border-teal-800/40 dark:bg-navy-900/60 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm font-bold">
                        ✚
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                          Clear &amp; Brief Clinical Summary
                        </span>
                        <h3 className="text-base font-extrabold text-slate-800 dark:text-white">
                          Executive Patient Health Synthesis
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-extrabold border ${
                        textAnalysis.executiveSummary.status === 'Optimal'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : textAnalysis.executiveSummary.status === 'Mild Attention'
                          ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
                      }`}>
                        ● {textAnalysis.executiveSummary.badge}
                      </span>
                      <span className="rounded-full bg-white dark:bg-navy-800 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                        Score: {textAnalysis.calculations.healthScore}/100
                      </span>
                    </div>
                  </div>

                  {/* Brief Narrative Paragraph */}
                  <p className="text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-navy-800/80 p-4 rounded-2xl border border-teal-100/60 dark:border-teal-900/40">
                    {textAnalysis.executiveSummary.briefSummary}
                  </p>

                  {/* Highlights vs Attention points */}
                  <div className="grid gap-3 sm:grid-cols-2 pt-1">
                    <div className="rounded-2xl bg-emerald-50/70 p-3.5 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                      <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" /> What Is Going Well
                      </span>
                      <ul className="mt-2 space-y-1 text-xs text-slate-700 dark:text-slate-300">
                        {textAnalysis.executiveSummary.highlights.map((h, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-emerald-500 font-bold">•</span> {h}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-2xl bg-amber-50/70 p-3.5 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
                      <span className="text-xs font-extrabold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> Areas For Attention
                      </span>
                      {textAnalysis.executiveSummary.attentionItems.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-xs text-slate-700 dark:text-slate-300">
                          {textAnalysis.executiveSummary.attentionItems.map((a, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-amber-500 font-bold">•</span> {a}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          No out-of-range red flags detected in this report.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Immediate Action */}
                  <div className="flex items-center gap-2 pt-1 text-xs text-slate-600 dark:text-slate-300 font-medium">
                    <span className="font-bold text-teal-700 dark:text-teal-400">Recommended Action:</span>
                    <span>{textAnalysis.executiveSummary.primaryAction}</span>
                  </div>
                </div>

                {/* 2. MULTI-METHOD CLINICAL OPERATIONS & RISK CALCULATIONS */}
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-3">
                    <Calculator className="h-4 w-4 text-primary-500" />
                    Multi-Method Clinical Operations &amp; Diagnostic Calculations
                  </h3>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Op 1: Glycemic & eAG */}
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-700/60 dark:bg-navy-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <Droplets className="h-3.5 w-3.5 text-rose-500" /> Glycemic Control (ADA)
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">eAG Calculation</span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        <p>
                          <strong>Estimated Avg Glucose (eAG):</strong>{' '}
                          {textAnalysis.calculations.eag ? `${textAnalysis.calculations.eag} mg/dL` : 'Need HbA1c'}
                        </p>
                        <p>
                          <strong>FBS:</strong> {extractedData.metrics.fbs ?? '--'} mg/dL •{' '}
                          <strong>HbA1c:</strong> {extractedData.metrics.hba1c ?? '--'}%
                        </p>
                      </div>
                    </div>

                    {/* Op 2: Atherogenic Index AIP */}
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-700/60 dark:bg-navy-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <HeartPulse className="h-3.5 w-3.5 text-teal-500" /> Atherogenic Index (AIP)
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">Cardio Plaque Risk</span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        <p>
                          <strong>AIP:</strong>{' '}
                          {textAnalysis.calculations.aip !== null ? (
                            <span className="font-bold text-teal-600 dark:text-teal-400">
                              {textAnalysis.calculations.aip} ({textAnalysis.calculations.aipCategory})
                            </span>
                          ) : (
                            'Need TG & HDL'
                          )}
                        </p>
                        <p>
                          <strong>LDL/HDL Ratio:</strong> {textAnalysis.calculations.ldlHdlRatio ?? '--'} (Ideal &lt; 2.5)
                        </p>
                      </div>
                    </div>

                    {/* Op 3: Renal eGFR Staging */}
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-700/60 dark:bg-navy-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <Stethoscope className="h-3.5 w-3.5 text-amber-500" /> Renal eGFR Staging
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">Kidney Filtration</span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        <p>
                          <strong>Est. GFR:</strong>{' '}
                          {textAnalysis.calculations.eGfr ? (
                            <span className="font-bold text-amber-600 dark:text-amber-400">
                              ~{textAnalysis.calculations.eGfr} mL/min
                            </span>
                          ) : (
                            'Need Creatinine'
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {textAnalysis.calculations.eGfrStage || 'Normal glomerular filtration baseline'}
                        </p>
                      </div>
                    </div>

                    {/* Op 4: Hemodynamics (MAP & Pulse Pressure) */}
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-700/60 dark:bg-navy-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5 text-blue-500" /> Mean Arterial Pressure (MAP)
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">Perfusion Index</span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        <p>
                          <strong>MAP:</strong>{' '}
                          {textAnalysis.calculations.map ? `${textAnalysis.calculations.map} mmHg (Target: 70–100)` : 'Need BP'}
                        </p>
                        <p>
                          <strong>Pulse Pressure:</strong>{' '}
                          {textAnalysis.calculations.pulsePressure ? `${textAnalysis.calculations.pulsePressure} mmHg` : '--'}
                        </p>
                      </div>
                    </div>

                    {/* Op 5: Hematology & Oxygenation */}
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-700/60 dark:bg-navy-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5 text-cyan-500" /> Hematology &amp; Anemia Index
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">WHO Guidelines</span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        <p>
                          <strong>Hemoglobin:</strong> {extractedData.metrics.hemoglobin ?? '--'} g/dL
                        </p>
                        <p>
                          <strong>RBC Count:</strong> {extractedData.metrics.rbc ?? '--'} M/mcL •{' '}
                          <strong>HCT:</strong> {extractedData.metrics.hematocrit ?? '--'}%
                        </p>
                      </div>
                    </div>

                    {/* Op 6: Liver Enzymes De Ritis */}
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-700/60 dark:bg-navy-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <Stethoscope className="h-3.5 w-3.5 text-purple-500" /> Hepatic Enzyme Balance
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">De Ritis Ratio</span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        <p>
                          <strong>AST / ALT Ratio:</strong>{' '}
                          {textAnalysis.calculations.deRitisRatio ? `${textAnalysis.calculations.deRitisRatio}` : 'Need ALT & AST'}
                        </p>
                        <p>
                          <strong>ALT:</strong> {extractedData.metrics.alt ?? '--'} U/L •{' '}
                          <strong>AST:</strong> {extractedData.metrics.ast ?? '--'} U/L
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. CLINICAL ACTION PLAN & QUESTIONS TO ASK DOCTOR */}
                <div className="grid gap-4 sm:grid-cols-2 pt-1">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-700/60 dark:bg-navy-900/40 space-y-2">
                    <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4 text-primary-500" /> Targeted Questions for Your Doctor
                    </span>
                    <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                      {textAnalysis.doctorQuestions.map((q, idx) => (
                        <li key={idx} className="leading-relaxed pl-2 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-primary-500">
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-700/60 dark:bg-navy-900/40 space-y-2">
                    <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <Brain className="h-4 w-4 text-teal-500" /> Personalized Nutrition &amp; Habits
                    </span>
                    <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                      {textAnalysis.lifestylePlan.diet.slice(0, 2).map((d, idx) => (
                        <li key={`d-${idx}`} className="leading-relaxed pl-2 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-teal-500">
                          {d}
                        </li>
                      ))}
                      {textAnalysis.lifestylePlan.lifestyle.slice(0, 1).map((l, idx) => (
                        <li key={`l-${idx}`} className="leading-relaxed pl-2 relative before:absolute before:left-0 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-teal-500">
                          {l}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 4. EXTRACTED BIOMARKERS TABLE */}
                {extractedData.biomarkers.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Extracted Biomarkers from Text ({extractedData.biomarkers.length})
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-navy-800">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-400 font-bold dark:border-slate-700/60 dark:bg-navy-900/50">
                            <th className="p-3">Biomarker Name</th>
                            <th className="p-3">Extracted Value</th>
                            <th className="p-3">Unit</th>
                            <th className="p-3">Clinical Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40 text-slate-700 dark:text-slate-300">
                          {extractedData.biomarkers.map((bm, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-navy-700/30">
                              <td className="p-3 font-semibold">{bm.name}</td>
                              <td className="p-3 font-bold">{bm.value}</td>
                              <td className="p-3 text-slate-400">{bm.unit}</td>
                              <td className="p-3">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  bm.status === 'Normal'
                                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20'
                                    : bm.status === 'High'
                                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/20'
                                    : 'bg-amber-50 text-amber-600 dark:bg-amber-950/20'
                                }`}>
                                  {bm.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CORE CLINICAL VITALS ROW */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. BLOOD SUGAR CARD */}
        <div className="rounded-3xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-navy-800 shadow-glass relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Droplets className="h-4 w-4 text-rose-500" /> Blood Sugar
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {latestSugarPoint?.sugarType === 'post_meal' ? 'Post-Meal' : 'Fasting'}
            </span>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800 dark:text-white">
              {latestSugarPoint?.bloodSugar ?? user?.fasting_sugar ?? '—'}
            </span>
            <span className="text-xs font-semibold text-slate-400">mg/dL</span>

            {latestSugarPoint?.bloodSugar && prevSugarPoint?.bloodSugar && (
              <span className={`ml-auto text-xs font-bold flex items-center ${
                latestSugarPoint.bloodSugar <= prevSugarPoint.bloodSugar ? 'text-emerald-500' : 'text-rose-500'
              }`}>
                {latestSugarPoint.bloodSugar <= prevSugarPoint.bloodSugar ? (
                  <TrendingDown className="h-3.5 w-3.5 mr-0.5" />
                ) : (
                  <TrendingUp className="h-3.5 w-3.5 mr-0.5" />
                )}
                {Math.abs(Math.round(latestSugarPoint.bloodSugar - prevSugarPoint.bloodSugar))}
              </span>
            )}
          </div>

          {sugarStatus ? (
            <div className="mt-2.5">
              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${sugarStatus.color}`}>
                {sugarStatus.badge}
              </span>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                {sugarStatus.tip}
              </p>
            </div>
          ) : (
            <p className="mt-2.5 text-[11px] text-slate-400">
              Log your fasting or post-meal glucose to monitor insulin control.
            </p>
          )}

          {latestHba1c && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">HbA1c (3-mo avg):</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{latestHba1c}%</span>
            </div>
          )}
        </div>

        {/* 2. HEMOGLOBIN CARD */}
        <div className="rounded-3xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-navy-800 shadow-glass relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-cyan-500" /> Hemoglobin
            </span>
            <span className="text-[10px] font-bold text-slate-400">Blood Count</span>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800 dark:text-white">
              {latestHbPoint?.hemoglobin ?? '—'}
            </span>
            <span className="text-xs font-semibold text-slate-400">g/dL</span>

            {latestHbPoint?.hemoglobin && prevHbPoint?.hemoglobin && (
              <span className={`ml-auto text-xs font-bold flex items-center ${
                latestHbPoint.hemoglobin >= prevHbPoint.hemoglobin ? 'text-emerald-500' : 'text-amber-500'
              }`}>
                {latestHbPoint.hemoglobin >= prevHbPoint.hemoglobin ? (
                  <TrendingUp className="h-3.5 w-3.5 mr-0.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 mr-0.5" />
                )}
                {Math.abs(parseFloat((latestHbPoint.hemoglobin - prevHbPoint.hemoglobin).toFixed(1)))}
              </span>
            )}
          </div>

          {hbStatus ? (
            <div className="mt-2.5">
              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${hbStatus.color}`}>
                {hbStatus.badge}
              </span>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                {hbStatus.tip}
              </p>
            </div>
          ) : (
            <p className="mt-2.5 text-[11px] text-slate-400">
              Upload a CBC report or log hemoglobin to monitor oxygen delivery and anemia.
            </p>
          )}

          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Target Range:</span>
            <span className="font-semibold text-slate-600 dark:text-slate-300">12.0 – 17.5 g/dL</span>
          </div>
        </div>

        {/* 3. CARDIOVASCULAR & LIPID CARD */}
        <div className="rounded-3xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-navy-800 shadow-glass relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <HeartPulse className="h-4 w-4 text-teal-500" /> Lipid Health
            </span>
            <span className="text-[10px] font-bold text-slate-400">Cholesterol</span>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800 dark:text-white">
              {latestLipidPoint?.totalCholesterol ?? '—'}
            </span>
            <span className="text-xs font-semibold text-slate-400">mg/dL</span>
          </div>

          {lipidStatus ? (
            <div className="mt-2.5">
              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${lipidStatus.color}`}>
                {lipidStatus.badge}
              </span>
              {lipidStatus.ratio && (
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  LDL/HDL Atherogenic Ratio: <span className="font-bold text-slate-700 dark:text-slate-300">{lipidStatus.ratio}</span> (Ideal &lt;3.0)
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2.5 text-[11px] text-slate-400">
              Lipid profile measures heart health, plaque risks, and arterial protection.
            </p>
          )}

          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">LDL / HDL:</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">
              {latestLipidPoint?.ldl ?? '—'} / {latestLipidPoint?.hdl ?? '—'}
            </span>
          </div>
        </div>

        {/* 4. BMI & OVERALL HEALTH SCORE */}
        <div className={`rounded-3xl border p-5 flex flex-col justify-between ${getScoreColor(currentHealthScore)} shadow-glass`}>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                <Heart className="h-4 w-4" /> Overall Health
              </span>
              <span className="text-[10px] font-bold opacity-75">Score</span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold">
                {currentHealthScore ?? '—'}
              </span>
              {currentHealthScore !== null && currentHealthScore !== undefined && (
                <span className="text-xs font-normal opacity-70">/100</span>
              )}
            </div>

            <p className="mt-2 text-[11px] opacity-85 leading-relaxed">
              {currentHealthScore !== null
                ? currentHealthScore >= 80 ? 'Most biomarkers within healthy targets.' : 'A few abnormal biomarkers detected.'
                : 'Upload reports to generate clinical health index.'}
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-current/15 flex items-center justify-between text-[11px]">
            <span>BMI: {bmiVal ? `${bmiVal} kg/m²` : 'Not Set'}</span>
            <span>BP: {user?.systolic_bp && user?.diastolic_bp ? `${user.systolic_bp}/${user.diastolic_bp}` : '—'}</span>
          </div>
        </div>
      </div>

      {/* INTERACTIVE CLINICAL TRENDS SUITE */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5 dark:border-slate-700">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary-500" />
                Biomarker Evolution &amp; Clinical Trends
              </h2>
              {includeTextInGraph && extractedData && (
                <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-extrabold text-teal-700 dark:bg-teal-950/30 dark:text-teal-300 border border-teal-200 flex items-center gap-1">
                  <Zap className="h-3 w-3 text-amber-500" /> Text Report Plotted
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Grounded chronological readings from your medical text reports, laboratory documents &amp; vitals logs
            </p>
          </div>

          {/* Tab Selector */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-100 p-1.5 dark:bg-navy-900/60 self-start md:self-center">
            <button
              onClick={() => setActiveTab('sugar')}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'sugar'
                  ? 'bg-white text-rose-600 shadow-sm dark:bg-navy-800 dark:text-rose-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              <Droplets className="h-3.5 w-3.5" /> Blood Sugar
            </button>

            <button
              onClick={() => setActiveTab('hemoglobin')}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'hemoglobin'
                  ? 'bg-white text-cyan-600 shadow-sm dark:bg-navy-800 dark:text-cyan-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              <Activity className="h-3.5 w-3.5" /> Hemoglobin
            </button>

            <button
              onClick={() => setActiveTab('lipids')}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'lipids'
                  ? 'bg-white text-teal-600 shadow-sm dark:bg-navy-800 dark:text-teal-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              <HeartPulse className="h-3.5 w-3.5" /> Cholesterol
            </button>

            <button
              onClick={() => setActiveTab('metabolic')}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'metabolic'
                  ? 'bg-white text-amber-600 shadow-sm dark:bg-navy-800 dark:text-amber-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              <Stethoscope className="h-3.5 w-3.5" /> Kidney &amp; Liver
            </button>

            <button
              onClick={() => setActiveTab('overall')}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'overall'
                  ? 'bg-white text-emerald-600 shadow-sm dark:bg-navy-800 dark:text-emerald-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              <Heart className="h-3.5 w-3.5" /> Health Index
            </button>
          </div>
        </div>

        {/* Chart View Area */}
        {timelineData.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center dark:border-slate-700/60 dark:bg-navy-900/20">
            <Activity className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <h4 className="mt-3 font-bold text-slate-700 dark:text-slate-200">No trend data logged yet</h4>
            <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
              Upload blood reports or log your vitals to start plotting clinical trends.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => setLogModalOpen(true)}
                className="rounded-xl bg-primary-500 px-4 py-2 text-xs font-bold text-white shadow-sm"
              >
                Log First Reading
              </button>
              <Link
                to="/upload"
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                Upload Lab Report
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {activeTab === 'sugar' ? (
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} domain={[50, 'dataMax + 30']} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <ReferenceLine y={100} stroke="#10b981" strokeDasharray="4 4" label={{ value: 'Normal Max (100)', fill: '#10b981', fontSize: 10, position: 'right' }} />
                    <ReferenceLine y={126} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Diabetic Alert (126)', fill: '#ef4444', fontSize: 10, position: 'right' }} />
                    <Line type="monotone" dataKey="bloodSugar" name="Blood Glucose (mg/dL)" stroke="#f43f5e" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 8 }} connectNulls />
                  </LineChart>
                ) : activeTab === 'hemoglobin' ? (
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} domain={[8, 19]} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <ReferenceLine y={12.0} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Anemia Threshold (12.0)', fill: '#f59e0b', fontSize: 10, position: 'right' }} />
                    <ReferenceLine y={15.0} stroke="#06b6d4" strokeDasharray="4 4" label={{ value: 'Optimal Target (15.0)', fill: '#06b6d4', fontSize: 10, position: 'right' }} />
                    <Line type="monotone" dataKey="hemoglobin" name="Hemoglobin (g/dL)" stroke="#06b6d4" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 8 }} connectNulls />
                  </LineChart>
                ) : activeTab === 'lipids' ? (
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 'dataMax + 40']} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <ReferenceLine y={200} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Desirable Limit (200)', fill: '#ef4444', fontSize: 10, position: 'right' }} />
                    <Line type="monotone" dataKey="totalCholesterol" name="Total Cholesterol" stroke="#1e3a8a" strokeWidth={2.5} connectNulls />
                    <Line type="monotone" dataKey="ldl" name="LDL (Bad)" stroke="#f59e0b" strokeWidth={2} connectNulls />
                    <Line type="monotone" dataKey="hdl" name="HDL (Good)" stroke="#10b981" strokeWidth={2} connectNulls />
                    <Line type="monotone" dataKey="triglycerides" name="Triglycerides" stroke="#8b5cf6" strokeWidth={2} connectNulls />
                  </LineChart>
                ) : activeTab === 'metabolic' ? (
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 'dataMax + 20']} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Line type="monotone" dataKey="creatinine" name="Serum Creatinine (mg/dL)" stroke="#f59e0b" strokeWidth={2.5} connectNulls />
                    <Line type="monotone" dataKey="alt" name="SGPT / ALT (U/L)" stroke="#14b8a6" strokeWidth={2} connectNulls />
                    <Line type="monotone" dataKey="ast" name="SGOT / AST (U/L)" stroke="#8b5cf6" strokeWidth={2} connectNulls />
                  </LineChart>
                ) : (
                  <AreaChart data={timelineData}>
                    <defs>
                      <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} domain={[40, 100]} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Area type="monotone" dataKey="healthScore" name="Health Score Index (0–100)" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#scoreGrad)" connectNulls />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Statistical Summary Row */}
            {tabStats && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-navy-900/40 text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Latest</span>
                  <p className="text-base font-extrabold text-slate-800 dark:text-white mt-0.5">
                    {tabStats.latest} <span className="text-xs font-normal text-slate-400">{tabStats.unit}</span>
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-navy-900/40 text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Average</span>
                  <p className="text-base font-extrabold text-slate-800 dark:text-white mt-0.5">
                    {tabStats.avg} <span className="text-xs font-normal text-slate-400">{tabStats.unit}</span>
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-navy-900/40 text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Lowest</span>
                  <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {tabStats.min} <span className="text-xs font-normal text-slate-400">{tabStats.unit}</span>
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-navy-900/40 text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Highest</span>
                  <p className="text-base font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
                    {tabStats.max} <span className="text-xs font-normal text-slate-400">{tabStats.unit}</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* RECENT REPORTS & CLINICAL INSIGHTS ROW */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Recent Reports Table */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 lg:col-span-2 shadow-glass space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-700">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100">{t('recentUploads')}</h3>
              <p className="text-xs text-slate-400">Stored medical records and OCR extractions</p>
            </div>
            <Link to="/history" className="text-xs font-bold text-primary-500 hover:text-primary-600 flex items-center gap-1">
              View All <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead>
                <tr className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-3">Report Name</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Score</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {reports.slice(0, 5).map((report) => (
                  <tr
                    key={report.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-navy-700/20 cursor-pointer"
                    onClick={() => navigate(`/analysis/${report.id}`)}
                  >
                    <td className="py-3 font-semibold text-slate-800 dark:text-slate-200 max-w-[170px] truncate">
                      {report.filename}
                    </td>
                    <td className="py-3 text-xs">{report.report_type}</td>
                    <td className="py-3">
                      {report.analysis_status === 'analyzed' ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400">
                          Analysed
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:bg-amber-950/20 dark:text-amber-400">
                          {report.analysis_status === 'extraction_failed' ? 'Needs text' : 'Review text'}
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {report.health_score === null || report.health_score === undefined ? (
                        <span className="text-xs font-bold text-slate-300 dark:text-slate-600">—</span>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            report.health_score >= 85
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400'
                              : report.health_score >= 70
                              ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/20 dark:text-primary-400'
                              : 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400'
                          }`}
                        >
                          {report.health_score}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-xs text-slate-400">
                      {new Date(report.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Clinical Guidance Panel */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4 dark:border-slate-700">
              <Brain className="h-5 w-5 text-primary-500" />
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">
                  {latestReport?.analysis_mode === 'llm' ? t('aiRecommendations') : 'Clinical Guidance'}
                </h3>
                <p className="text-[11px] text-slate-400">AI lifestyle &amp; diet pointers</p>
              </div>
            </div>

            <div className="mt-4 space-y-4 max-h-80 overflow-y-auto pr-1">
              {latestReport && (latestReport.recommendations?.lifestyle?.length ?? 0) > 0 ? (
                <>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-500"></span> Lifestyle actions
                    </p>
                    <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                      {latestReport.recommendations!.lifestyle!.slice(0, 3).map((item, idx) => (
                        <li key={idx} className="leading-relaxed pl-2.5 relative before:absolute before:left-0 before:top-1.5 before:h-1 before:w-1 before:rounded-full before:bg-slate-300">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {(latestReport.recommendations?.diet?.length ?? 0) > 0 && (
                    <div className="border-t border-slate-100 pt-3 dark:border-slate-700/50">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-teal-500"></span> Diet considerations
                      </p>
                      <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                        {latestReport.recommendations!.diet!.slice(0, 3).map((item, idx) => (
                          <li key={idx} className="leading-relaxed pl-2.5 relative before:absolute before:left-0 before:top-1.5 before:h-1 before:w-1 before:rounded-full before:bg-slate-300">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-36 items-center justify-center text-center text-xs text-slate-400">
                  <div className="flex flex-col items-center px-2">
                    <Info className="h-6 w-6 text-slate-300 mb-1" />
                    <p>
                      {pendingReview > 0
                        ? 'Review the extracted text of a report to generate recommendations.'
                        : 'Guidance appears here once reports are analysed.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700/50 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">Have questions?</span>
            <Link
              to="/chat"
              className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline dark:text-primary-400"
            >
              Ask AI Assistant <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* QUICK LOG VITALS MODAL */}
      <QuickLogVitalsModal
        isOpen={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        onSaved={loadDashboardData}
        userGender={user?.gender}
      />
    </div>
  );
};
