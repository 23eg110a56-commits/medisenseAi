import React, { useState } from 'react';
import { X, Activity, Droplets, HeartPulse, Scale, Loader2, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import api from '../services/api';
import { getGlucoseStatus, getHemoglobinStatus, getBpStatus } from '../utils/healthMetrics';

interface QuickLogVitalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  userGender?: string;
}

export const QuickLogVitalsModal: React.FC<QuickLogVitalsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  userGender,
}) => {
  const [bloodSugar, setBloodSugar] = useState('');
  const [sugarType, setSugarType] = useState('fasting');
  const [hba1c, setHba1c] = useState('');
  const [hemoglobin, setHemoglobin] = useState('');
  const [systolicBp, setSystolicBp] = useState('');
  const [diastolicBp, setDiastolicBp] = useState('');
  const [weight, setWeight] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  // Real-time status previews
  const sugarVal = bloodSugar ? parseFloat(bloodSugar) : null;
  const sugarStatus = sugarVal && !isNaN(sugarVal) ? getGlucoseStatus(sugarVal, sugarType) : null;

  const hbVal = hemoglobin ? parseFloat(hemoglobin) : null;
  const hbStatus = hbVal && !isNaN(hbVal) ? getHemoglobinStatus(hbVal, userGender) : null;

  const sysVal = systolicBp ? parseInt(systolicBp) : null;
  const diaVal = diastolicBp ? parseInt(diastolicBp) : null;
  const bpStatus = sysVal && diaVal ? getBpStatus(sysVal, diaVal) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const hasAnyMetric = [
      bloodSugar,
      hba1c,
      hemoglobin,
      systolicBp,
      diastolicBp,
      weight,
      heartRate,
    ].some((v) => v.trim() !== '');

    if (!hasAnyMetric) {
      setError('Please provide at least one health measurement (e.g. blood sugar, hemoglobin, BP).');
      return;
    }

    setLoading(true);
    try {
      await api.post('/vitals', {
        blood_sugar: sugarVal && !isNaN(sugarVal) ? sugarVal : undefined,
        sugar_type: sugarType,
        hba1c: hba1c ? parseFloat(hba1c) : undefined,
        hemoglobin: hbVal && !isNaN(hbVal) ? hbVal : undefined,
        systolic_bp: sysVal || undefined,
        diastolic_bp: diaVal || undefined,
        weight: weight ? parseFloat(weight) : undefined,
        heart_rate: heartRate ? parseInt(heartRate) : undefined,
        notes: notes.trim() || undefined,
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onSaved();
        onClose();
      }, 1000);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to record reading. Please check values.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-navy-800 space-y-6 my-8">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-navy-700 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-rose-500 to-primary-500 text-white shadow-lg shadow-rose-500/20">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">
              Log Health Reading
            </h3>
            <p className="text-xs text-slate-400">
              Track Blood Sugar, Hemoglobin, Blood Pressure, or Weight directly
            </p>
          </div>
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
            <span>Health reading saved! Updating dashboard charts...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Section 1: Blood Sugar & HbA1c */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-navy-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Droplets className="h-4 w-4 text-rose-500" />
                Blood Sugar &amp; Glycemic Levels
              </span>
              {sugarStatus && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sugarStatus.color}`}>
                  {sugarStatus.badge}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Blood Glucose (mg/dL)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 95"
                  value={bloodSugar}
                  onChange={(e) => setBloodSugar(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-500 dark:border-slate-700 dark:bg-navy-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Reading Type
                </label>
                <select
                  value={sugarType}
                  onChange={(e) => setSugarType(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-500 dark:border-slate-700 dark:bg-navy-800 dark:text-white"
                >
                  <option value="fasting">Fasting (FBS)</option>
                  <option value="post_meal">Post-Meal (PPBS)</option>
                  <option value="random">Random (RBS)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  HbA1c (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 5.6"
                  value={hba1c}
                  onChange={(e) => setHba1c(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-500 dark:border-slate-700 dark:bg-navy-800 dark:text-white"
                />
              </div>
            </div>
            {sugarStatus?.tip && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                {sugarStatus.tip}
              </p>
            )}
          </div>

          {/* Section 2: Hemoglobin & Blood Count */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-navy-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-cyan-500" />
                Hemoglobin &amp; Hematology
              </span>
              {hbStatus && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${hbStatus.color}`}>
                  {hbStatus.badge}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Hemoglobin (Hb in g/dL)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 14.2"
                  value={hemoglobin}
                  onChange={(e) => setHemoglobin(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-navy-800 dark:text-white"
                />
              </div>
              <div className="flex items-center text-[11px] text-slate-400 pt-5">
                Optimal: 13.5–17.5 g/dL (Men) / 12.0–15.5 g/dL (Women)
              </div>
            </div>
            {hbStatus?.tip && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                {hbStatus.tip}
              </p>
            )}
          </div>

          {/* Section 3: Blood Pressure & Vitals */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-navy-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <HeartPulse className="h-4 w-4 text-teal-500" />
                Cardiovascular Vitals &amp; Weight
              </span>
              {bpStatus && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${bpStatus.color}`}>
                  {bpStatus.badge}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Systolic (mmHg)
                </label>
                <input
                  type="number"
                  placeholder="120"
                  value={systolicBp}
                  onChange={(e) => setSystolicBp(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-navy-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Diastolic (mmHg)
                </label>
                <input
                  type="number"
                  placeholder="80"
                  value={diastolicBp}
                  onChange={(e) => setDiastolicBp(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-navy-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="70"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-navy-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Heart Rate (bpm)
                </label>
                <input
                  type="number"
                  placeholder="72"
                  value={heartRate}
                  onChange={(e) => setHeartRate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-navy-800 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Personal Notes / Context (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Checked with home glucometer before breakfast"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none focus:border-primary-500 focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
            />
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
              disabled={loading || success}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 via-primary-500 to-teal-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-primary-500/20 hover:brightness-105 active:scale-95 transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : success ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Saved!
                </>
              ) : (
                'Save Vital Reading'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
