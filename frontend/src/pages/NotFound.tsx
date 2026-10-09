import React from 'react';
import { Link } from 'react-router-dom';
import { HeartHandshake } from 'lucide-react';

export const NotFound: React.FC = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center dark:bg-navy-900 font-sans">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary-500 to-teal-500 text-white shadow-md shadow-primary-500/10 mb-6 animate-bounce">
        <HeartHandshake className="h-7 w-7" />
      </div>
      <h1 className="text-6xl font-extrabold text-slate-800 dark:text-white">404</h1>
      <h2 className="mt-2 text-xl font-bold text-slate-700 dark:text-slate-200">Page Not Found</h2>
      <p className="mt-2 text-sm text-slate-400 max-w-xs leading-relaxed">
        The link you followed may be broken or the medical record page may have been deleted.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 px-6 py-3.5 text-sm font-semibold text-white shadow-md hover:scale-105 transition-transform"
      >
        Go to Dashboard
      </Link>
    </div>
  );
};
