import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Activity, AlertCircle, Save, Loader2 } from 'lucide-react';

export const Profile: React.FC = () => {
  const { user, updateProfile } = useAuth();
  
  const [name, setName] = useState(user?.name || '');
  const [age, setAge] = useState(user?.age ? String(user.age) : '');
  const [gender, setGender] = useState(user?.gender || '');
  const [weight, setWeight] = useState(user?.weight ? String(user.weight) : '');
  const [height, setHeight] = useState(user?.height ? String(user.height) : '');
  const [systolicBp, setSystolicBp] = useState(user?.systolic_bp ? String(user.systolic_bp) : '');
  const [diastolicBp, setDiastolicBp] = useState(user?.diastolic_bp ? String(user.diastolic_bp) : '');
  const [fastingSugar, setFastingSugar] = useState(user?.fasting_sugar ? String(user.fasting_sugar) : '');
  const [language, setLanguage] = useState(user?.language || 'en');
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
       setError("Name is required.");
       return;
    }
    
    setError('');
    setSuccess('');
    setLoading(true);
    
    try {
      await updateProfile({
        name,
        age: age ? parseInt(age) : undefined,
        gender: gender || undefined,
        weight: weight ? parseFloat(weight) : undefined,
        height: height ? parseFloat(height) : undefined,
        systolic_bp: systolicBp ? parseInt(systolicBp) : undefined,
        diastolic_bp: diastolicBp ? parseInt(diastolicBp) : undefined,
        fasting_sugar: fastingSugar ? parseFloat(fastingSugar) : undefined,
        language
      });
      setSuccess("Profile updated successfully!");
    } catch (err) {
      console.error(err);
      setError("Failed to update profile info. Check formatting.");
    } finally {
      setLoading(false);
    }
  };

  // Compute current BMI if weight and height are present
  const w = parseFloat(weight);
  const h = parseFloat(height);
  const bmi = w && h ? (w / (h * h)).toFixed(1) : null;

  const getBmiCategory = (val: number) => {
    if (val < 18.5) return { label: 'Underweight', color: 'text-blue-500' };
    if (val < 25) return { label: 'Normal weight', color: 'text-emerald-500' };
    if (val < 30) return { label: 'Overweight', color: 'text-amber-500' };
    return { label: 'Obese', color: 'text-red-500' };
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 font-sans">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <User className="h-8 w-8 text-primary-500" />
          User Profile & Health Parameters
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Update your profile details and standard health baselines. We use these to configure targets on your dashboard.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-center text-xs font-semibold text-red-800 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl bg-emerald-50 p-3 text-center text-xs font-semibold text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400">
          {success}
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-3">
        {/* Left Card: BMI and general goals info */}
        <div className="md:col-span-1 space-y-6">
          <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Body Mass Index (BMI)</span>
            {bmi ? (
              <div className="mt-4">
                <p className="text-5xl font-extrabold text-slate-800 dark:text-white">{bmi}</p>
                <p className={`text-xs font-bold mt-2 ${getBmiCategory(parseFloat(bmi)).color}`}>
                  {getBmiCategory(parseFloat(bmi)).label}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 mt-4 leading-relaxed">
                Enter your Height and Weight to calculate your Body Mass Index (BMI).
              </p>
            )}
          </div>
          
          <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-700">
              <Activity className="h-4.5 w-4.5 text-teal-500" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Why provide baselines?</h3>
            </div>
            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              Baselines represent target goals recommended by your doctors. MediSense references these to mark values on trend charts.
            </p>
          </div>
        </div>

        {/* Right Form panel */}
        <form onSubmit={handleSubmit} className="md:col-span-2 rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass space-y-6">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 pb-3 dark:border-slate-700">
            Account and Health Variables
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Age (years)</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g. 35"
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
              >
                <option value="">Choose Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Language Preference</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
              >
                <option value="en">English</option>
                <option value="hi">Hindi (हिन्दी)</option>
                <option value="te">Telugu (తెలుగు)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Weight (kg)</label>
              <input
                type="number"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="e.g. 70.5"
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Height (meters)</label>
              <input
                type="number"
                step="0.01"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="e.g. 1.75"
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Target Fasting Blood Sugar (mg/dL)</label>
              <input
                type="number"
                value={fastingSugar}
                onChange={(e) => setFastingSugar(e.target.value)}
                placeholder="e.g. 95"
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Target Systolic BP</label>
                <input
                  type="number"
                  value={systolicBp}
                  onChange={(e) => setSystolicBp(e.target.value)}
                  placeholder="e.g. 120"
                  className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Target Diastolic BP</label>
                <input
                  type="number"
                  value={diastolicBp}
                  onChange={(e) => setDiastolicBp(e.target.value)}
                  placeholder="e.g. 80"
                  className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-primary-500/10 transition-transform active:scale-95 disabled:scale-100 disabled:opacity-75"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  Saving Profile...
                </>
              ) : (
                <>
                  <Save className="h-4.5 w-4.5" />
                  Save Profile
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
