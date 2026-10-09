import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { HeartHandshake, Loader2, ArrowLeft, Key } from 'lucide-react';

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Send OTP, 2: Verify & Reset
  
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email.");
      return;
    }
    
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setSuccess("An OTP has been generated.");
      if (res.data.dev_otp) {
        setDevOtp(res.data.dev_otp);
      }
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to generate OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || !newPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setError('');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email,
        otp,
        new_password: newPassword
      });
      setSuccess("Password reset successfully! Redirecting to login...");
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to reset password. Check if OTP is correct.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-navy-900 font-sans">
      <div className="w-full max-w-md space-y-8 rounded-3xl border border-slate-100 bg-white p-8 shadow-xl shadow-slate-100/40 dark:border-slate-800 dark:bg-navy-800 dark:shadow-none">
        
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary-500 to-teal-500 text-white shadow-md shadow-primary-500/10">
            <Key className="h-6 w-6" />
          </div>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Reset your password
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {step === 1 ? "Enter your email to receive a password reset code" : "Enter the OTP code and your new password"}
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

        {/* Sandbox Dev Mode Assistance */}
        {devOtp && (
          <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-xs font-bold text-primary-800 dark:text-primary-400 uppercase tracking-wider">
              Local Development Helper:
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              We simulated sending the email. Your reset OTP code is: <span className="font-extrabold text-sm text-primary-600 dark:text-primary-400">{devOtp}</span>
            </p>
          </div>
        )}

        {step === 1 ? (
          <form className="space-y-6" onSubmit={handleSendOtp}>
            <div>
              <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none transition-all focus:border-primary-500 focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white dark:focus:border-primary-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 py-4 text-sm font-semibold text-white shadow-lg shadow-primary-500/10 transition-transform active:scale-95 disabled:scale-100 disabled:opacity-75"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Sending Code...
                </>
              ) : (
                "Send Verification Code"
              )}
            </button>
          </form>
        ) : (
          <form className="space-y-5" onSubmit={handleResetPassword}>
            <div>
              <label htmlFor="otp" className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Enter 6-Digit OTP
              </label>
              <input
                id="otp"
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-center font-bold tracking-widest outline-none transition-all focus:border-primary-500 focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white dark:focus:border-primary-500"
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none transition-all focus:border-primary-500 focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white dark:focus:border-primary-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 py-4 text-sm font-semibold text-white shadow-lg shadow-primary-500/10 transition-transform active:scale-95 disabled:scale-100 disabled:opacity-75"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>
        )}

        <div className="flex justify-center border-t border-slate-100 pt-4 dark:border-slate-800">
          <Link to="/login" className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};
