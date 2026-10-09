import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { HeartHandshake, Eye, EyeOff, Loader2 } from 'lucide-react';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const sessionExpired = searchParams.get('expired') === 'true';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      if (!err.response) {
        setError("Cannot connect to backend server. Please verify the FastAPI backend is running on port 8000.");
      } else {
        setError(
          err.response?.data?.detail || 
          "Incorrect email or password. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-navy-900 font-sans">
      <div className="w-full max-w-md space-y-8 rounded-3xl border border-slate-100 bg-white p-8 shadow-xl shadow-slate-100/40 dark:border-slate-800 dark:bg-navy-800 dark:shadow-none">
        
        {/* Brand logo */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary-500 to-teal-500 text-white shadow-md shadow-primary-500/10">
            <HeartHandshake className="h-6 w-6" />
          </div>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back to MediSense AI
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Enter your details to access your medical records
          </p>
        </div>

        {sessionExpired && (
          <div className="rounded-xl bg-amber-50 p-3 text-center text-xs font-semibold text-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
            Your session has expired. Please log in again.
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 p-3 text-center text-xs font-semibold text-red-800 dark:bg-red-950/20 dark:text-red-400">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
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
            
            <div className="relative">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Password
                </label>
                <Link to="/forgot-password" className="text-xs font-semibold text-primary-500 hover:text-primary-600">
                  Forgot Password?
                </Link>
              </div>
              <div className="relative mt-2">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 pr-12 text-sm outline-none transition-all focus:border-primary-500 focus:bg-white dark:border-slate-700 dark:bg-navy-900 dark:text-white dark:focus:border-primary-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 py-4 text-sm font-semibold text-white shadow-lg shadow-primary-500/10 transition-transform active:scale-95 disabled:scale-100 disabled:opacity-75"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Signing In...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400">
          Don't have an account?{" "}
          <Link to="/register" className="font-semibold text-primary-500 hover:text-primary-600">
            Create Account
          </Link>
        </p>
      </div>
    </div>
  );
};
