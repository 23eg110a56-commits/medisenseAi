import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  FileText, Activity, TrendingUp, TrendingDown, 
  ArrowUpRight, Heart, Brain, Calendar, Info, Loader2,
  Droplets, HeartPulse, Scale, Plus, AlertTriangle, CheckCircle2,
  Sparkles, ArrowRight, ShieldAlert, Stethoscope
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
  getBpStatus 
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

  const analysedReports = useMemo(
    () => reports.filter((r) => r.analysis_status === 'analyzed'),
    [reports]
  );

  // Merge report biomarkers and manual vitals into a timeline
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

    // Sort chronologically ascending
    return points.sort((a, b) => a.timestamp - b.timestamp);
  }, [analysedReports, vitals]);

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
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary-500" />
              Biomarker Evolution &amp; Clinical Trends
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Grounded chronological readings from your verified laboratory reports &amp; vitals logs
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
