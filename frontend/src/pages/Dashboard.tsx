import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  FileText, Activity, TrendingUp, TrendingDown, 
  ArrowUpRight, Heart, Brain, Calendar, Info, Loader2 
} from 'lucide-react';
import { 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend 
} from 'recharts';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';

interface Biomarker {
  name: string;
  value: string;
  unit: string;
  status: string;
}

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

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await api.get('/reports/all');
      setReports(res.data);
    } catch (err) {
      console.error("Failed to fetch reports for dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to extract a biomarker value from a report
  const getBiomarkerValue = (report: Report, nameKeywords: string[]): number | null => {
    for (const bm of report.biomarkers ?? []) {
      const bmName = bm.name.toLowerCase();
      if (nameKeywords.some(keyword => bmName.includes(keyword))) {
        // Parse numeric value
        const match = bm.value.replace(/,/g, '').match(/[\d.]+/);
        if (match) {
          return parseFloat(match[0]);
        }
      }
    }
    return null;
  };

  // Only analysed reports carry results, so only they can be plotted.
  const analysedReports = reports.filter(r => r.analysis_status === 'analyzed');

  // Prepare trend data (ordered chronologically)
  const chartData = [...analysedReports]
    .reverse()
    .map(report => {
      const date = new Date(report.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      
      const sugar = getBiomarkerValue(report, ['glucose', 'sugar', 'fasting blood sugar']);
      const hemoglobin = getBiomarkerValue(report, ['hemoglobin', 'hb']);
      const cholesterol = getBiomarkerValue(report, ['total cholesterol', 'cholesterol']);
      const ldl = getBiomarkerValue(report, ['ldl']);
      const hdl = getBiomarkerValue(report, ['hdl']);
      const triglycerides = getBiomarkerValue(report, ['triglyceride']);

      return {
        date,
        'Health Score': report.health_score,
        'Blood Sugar': sugar,
        'Hemoglobin': hemoglobin,
        'Total Cholesterol': cholesterol,
        'LDL (Bad)': ldl,
        'HDL (Good)': hdl,
        'Triglycerides': triglycerides,
      };
    });

  const latestReport = analysedReports[0] ?? null;
  const totalUploads = reports.length;
  const pendingReview = reports.length - analysedReports.length;
  const currentHealthScore = latestReport ? latestReport.health_score : null;

  // Determine score color/grade
  const getScoreColor = (score: number | null) => {
    if (score === null || score === undefined) {
      return 'text-slate-500 border-slate-100 bg-slate-50/60 dark:bg-navy-800 dark:border-slate-800 dark:text-slate-300';
    }
    if (score >= 85) return 'text-emerald-500 border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/15 dark:border-emerald-950/20';
    if (score >= 70) return 'text-primary-500 border-primary-100 bg-primary-50/50 dark:bg-primary-950/15 dark:border-primary-950/20';
    if (score >= 50) return 'text-amber-500 border-amber-100 bg-amber-50/50 dark:bg-amber-950/15 dark:border-amber-950/20';
    return 'text-red-500 border-red-100 bg-red-50/50 dark:bg-red-950/15 dark:border-red-950/20';
  };

  const scoreLabel = (score: number | null): string => {
    if (score === null || score === undefined) return 'No analysed report yet';
    if (score >= 85) return 'Most parsed results are inside their printed ranges';
    if (score >= 70) return 'A few parsed results fall outside their printed ranges';
    if (score >= 50) return 'Several parsed results fall outside their printed ranges';
    return 'Many parsed results fall outside their printed ranges';
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-500" />
          <p className="mt-2 text-sm text-slate-400">Loading your health dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-primary-500 to-teal-500 p-8 text-white shadow-xl shadow-primary-500/10">
        <h1 className="text-2xl font-extrabold sm:text-3xl">
          {t('welcome')}, {user?.name}!
        </h1>
        <p className="mt-2 text-sm text-white/80 max-w-2xl">
          {analysedReports.length === 0
            ? 'Upload a report, check the extracted text and run the analysis to see your results here.'
            : `${analysedReports.length} report(s) analysed from the text in your documents. Review the findings, ask the assistant about them, or compare two dates.`}
        </p>
        {pendingReview > 0 && (
          <Link
            to="/history"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-xs font-bold text-white backdrop-blur hover:bg-white/25"
          >
            <Info className="h-3.5 w-3.5" />
            {pendingReview} report(s) still need their extracted text reviewed
          </Link>
        )}
      </div>

      {totalUploads === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-navy-800">
          <FileText className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
          <h3 className="mt-4 text-lg font-bold text-slate-700 dark:text-slate-200">No medical reports uploaded yet</h3>
          <p className="mt-1 text-sm text-slate-400 max-w-sm mx-auto">
            Upload your blood test reports in PDF or image format to start tracking your health markers.
          </p>
          <Link
            to="/upload"
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/10 hover:scale-105 transition-transform"
          >
            Upload First Report
          </Link>
        </div>
      ) : (
        <>
          {/* Metrics Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Health Score Card */}
            <div className={`rounded-3xl border p-6 flex items-center justify-between ${getScoreColor(currentHealthScore)}`}>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider opacity-75">
                  {t('healthScore')}
                </span>
                <p className="mt-2 text-4xl font-extrabold">
                  {currentHealthScore ?? '—'}
                  {currentHealthScore !== null && currentHealthScore !== undefined && (
                    <span className="text-sm font-normal opacity-70">/100</span>
                  )}
                </p>
                <p className="mt-2 text-xs opacity-80">{scoreLabel(currentHealthScore)}</p>
                <p className="mt-1 text-[10px] opacity-60">
                  An app heuristic over parsed results, not a clinical assessment.
                </p>
              </div>
              <div className="rounded-2xl bg-white/40 p-3 dark:bg-slate-900/10">
                <Heart className="h-8 w-8" />
              </div>
            </div>

            {/* Total Reports */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 flex items-center justify-between dark:border-slate-800 dark:bg-navy-800 text-slate-800 dark:text-slate-100">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {t('totalUploads')}
                </span>
                <p className="mt-2 text-4xl font-extrabold">{totalUploads}</p>
                <p className="mt-2 text-xs text-slate-400">Stored secure records</p>
              </div>
              <div className="rounded-2xl bg-primary-50 p-3 dark:bg-primary-950/20 text-primary-500">
                <FileText className="h-8 w-8" />
              </div>
            </div>

            {/* General Baseline values */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 flex items-center justify-between dark:border-slate-800 dark:bg-navy-800 text-slate-800 dark:text-slate-100 sm:col-span-2 lg:col-span-1">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  User Health Goals
                </span>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <p><span className="text-slate-400">Sugar:</span> {user?.fasting_sugar ? `${user.fasting_sugar} mg/dL` : 'Not Set'}</p>
                  <p><span className="text-slate-400">BP:</span> {user?.systolic_bp && user?.diastolic_bp ? `${user.systolic_bp}/${user.diastolic_bp}` : 'Not Set'}</p>
                  <p><span className="text-slate-400">Weight:</span> {user?.weight ? `${user.weight} kg` : 'Not Set'}</p>
                  <p><span className="text-slate-400">Age:</span> {user?.age ? `${user.age} yrs` : 'Not Set'}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-teal-50 p-3 dark:bg-teal-950/20 text-teal-500">
                <Activity className="h-8 w-8" />
              </div>
            </div>
          </div>

          {/* Interactive Charts Section */}
          {analysedReports.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-navy-800">
              <TrendingUp className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <h3 className="mt-3 font-bold text-slate-700 dark:text-slate-200">No trends to plot yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
                Charts are drawn from results that were actually read out of your reports. Analyse a
                report to start building a timeline — nothing is estimated to fill the gaps.
              </p>
            </div>
          ) : (
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Cholesterol Trends Chart */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 dark:text-slate-100">Cholesterol Profile Trends</h3>
                <span className="text-xs font-semibold text-slate-400">mg/dL</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:hidden" />
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" className="hidden dark:block" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 'dataMax + 40']} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                    <Line type="monotone" dataKey="Total Cholesterol" stroke="#1e3a8a" strokeWidth={2} activeDot={{ r: 6 }} connectNulls />
                    <Line type="monotone" dataKey="LDL (Bad)" stroke="#f59e0b" strokeWidth={2} connectNulls />
                    <Line type="monotone" dataKey="HDL (Good)" stroke="#10b981" strokeWidth={2} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Blood Sugar / HbA1c Trends */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 dark:text-slate-100">Blood Sugar Trends</h3>
                <span className="text-xs font-semibold text-slate-400">mg/dL</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:hidden" />
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" className="hidden dark:block" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} domain={[50, 'dataMax + 20']} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                    <Line type="monotone" dataKey="Blood Sugar" stroke="#ef4444" strokeWidth={2.5} activeDot={{ r: 6 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Hemoglobin Trend Chart */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 dark:text-slate-100">Hemoglobin Trends</h3>
                <span className="text-xs font-semibold text-slate-400">g/dL</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:hidden" />
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" className="hidden dark:block" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} domain={[8, 18]} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                    <Line type="monotone" dataKey="Hemoglobin" stroke="#06b6d4" strokeWidth={2.5} activeDot={{ r: 6 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* General Health Score Trends */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 dark:text-slate-100">Health Index Evolution</h3>
                <span className="text-xs font-semibold text-slate-400">Score</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:hidden" />
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" className="hidden dark:block" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} domain={[40, 100]} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                    <Line type="monotone" dataKey="Health Score" stroke="#10b981" strokeWidth={3} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          )}

          {/* AI recommendations + Recent reports */}
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Recent Uploads Table */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 lg:col-span-2 shadow-glass">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-700">
                <h3 className="font-bold text-slate-800 dark:text-slate-100">{t('recentUploads')}</h3>
                <Link to="/history" className="text-xs font-bold text-primary-500 hover:text-primary-600 flex items-center gap-1">
                  View All <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
              
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                  <thead>
                    <tr className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      <th className="pb-3">Report Name</th>
                      <th className="pb-3">Type</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Score</th>
                      <th className="pb-3">Uploaded Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {reports.slice(0, 4).map(report => (
                      <tr key={report.id} className="hover:bg-slate-50/50 dark:hover:bg-navy-700/20 cursor-pointer" onClick={() => navigate(`/analysis/${report.id}`)}>
                        <td className="py-3 font-semibold text-slate-800 dark:text-slate-200 max-w-[150px] truncate">{report.filename}</td>
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
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              report.health_score >= 85 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400' :
                              report.health_score >= 70 ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/20 dark:text-primary-400' :
                              'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400'
                            }`}>
                              {report.health_score}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-xs text-slate-400">{new Date(report.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Guidance Panel */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-4 dark:border-slate-700">
                <Brain className="h-5 w-5 text-primary-500" />
                <h3 className="font-bold text-slate-800 dark:text-slate-100">
                  {latestReport?.analysis_mode === 'llm' ? t('aiRecommendations') : 'Educational guidance'}
                </h3>
              </div>
              
              <div className="mt-4 space-y-4 max-h-72 overflow-y-auto pr-1">
                {latestReport && (latestReport.recommendations?.lifestyle?.length ?? 0) > 0 ? (
                  <>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-500"></span> Lifestyle changes
                      </p>
                      <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                        {latestReport.recommendations!.lifestyle!.slice(0, 3).map((item, idx) => (
                          <li key={idx} className="leading-relaxed pl-2.5 relative before:absolute before:left-0 before:top-1.5 before:h-1 before:w-1 before:rounded-full before:bg-slate-300">{item}</li>
                        ))}
                      </ul>
                    </div>
                    
                    {(latestReport.recommendations?.diet?.length ?? 0) > 0 && (
                      <div className="border-t border-slate-100 pt-3 dark:border-slate-700/50">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-teal-500"></span> Diet changes
                        </p>
                        <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                          {latestReport.recommendations!.diet!.slice(0, 3).map((item, idx) => (
                            <li key={idx} className="leading-relaxed pl-2.5 relative before:absolute before:left-0 before:top-1.5 before:h-1 before:w-1 before:rounded-full before:bg-slate-300">{item}</li>
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
                          ? 'Review the extracted text of a report and run the analysis to get guidance.'
                          : 'Guidance appears here once a report has been analysed.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <p className="mt-4 border-t border-slate-100 pt-3 text-[10px] leading-relaxed text-slate-400 dark:border-slate-700/50">
                General information only. This app does not prescribe medicines or adjust doses.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
