import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Brain, LineChart, FileText, ArrowRight, HeartHandshake } from 'lucide-react';

export const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-navy-900 dark:text-slate-100 font-sans">
      {/* Header */}
      <header className="mx-auto max-w-7xl px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-primary-500 to-teal-500 text-white shadow-md shadow-primary-500/10">
            <HeartHandshake className="h-5 w-5" />
          </div>
          <span className="text-xl font-extrabold bg-gradient-to-r from-primary-600 to-teal-600 bg-clip-text text-transparent dark:from-primary-400 dark:to-teal-400">
            MediSense AI
          </span>
        </div>
        <Link
          to="/login"
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-navy-900 dark:hover:bg-slate-100 shadow transition-all"
        >
          Sign In
        </Link>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-5xl px-6 pt-16 pb-24 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3.5 py-1.5 text-xs font-semibold text-primary-600 dark:bg-primary-950/20 dark:text-primary-400">
          <Brain className="h-4 w-4" /> AI-Powered Clinical Intelligence
        </div>
        
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-6xl bg-gradient-to-r from-navy-900 via-primary-900 to-teal-900 bg-clip-text text-transparent dark:from-white dark:via-slate-100 dark:to-slate-300">
          Demystify Your Medical Reports <br />
          <span className="bg-gradient-to-r from-primary-500 to-teal-500 bg-clip-text text-transparent">
            In Plain Language
          </span>
        </h1>
        
        <p className="mx-auto mt-6 max-w-2xl text-base text-slate-500 dark:text-slate-400 sm:text-lg leading-relaxed">
          Upload your blood tests, CBC, lipid profiles, and diagnostic reports. Extract biomarkers instantly, track historical trends, and consult our context-aware clinical chatbot.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            to="/register"
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary-500 to-teal-500 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-primary-500/20 hover:scale-105 transition-all"
          >
            Create Free Account <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Features Grid */}
      <section className="border-t border-slate-100 bg-white py-24 dark:border-slate-800 dark:bg-navy-800/40">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight dark:text-slate-100">
            Powered by Clinical AI & OCR
          </h2>
          <p className="text-center text-slate-400 text-sm mt-2 mb-16">
            Secure processing pipelines designed for patients and medical practitioners.
          </p>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-6 dark:border-slate-800 dark:bg-navy-800/80">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-600 dark:bg-primary-950/30 dark:text-primary-400">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-bold text-slate-800 dark:text-slate-100">Advanced OCR Engine</h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Seamless text parsing from PDFs, image uploads, and scanned reports with automated image enhancement and Gemini visual fallback support.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-6 dark:border-slate-800 dark:bg-navy-800/80">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-600 dark:bg-teal-950/30 dark:text-teal-400">
                <Brain className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-bold text-slate-800 dark:text-slate-100">RAG Medical Knowledge</h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Grounds AI explanations in trusted health reference standards like WHO and NIH, preventing hallucinations and ensuring high-fidelity answers.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-6 dark:border-slate-800 dark:bg-navy-800/80">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                <LineChart className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-bold text-slate-800 dark:text-slate-100">Historical Comparison</h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Compare reports side-by-side. Trace biomarker improvements, view percentage changes, and plot visual trend lines automatically.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-6 dark:border-slate-800 dark:bg-navy-800/80">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
                <Shield className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-bold text-slate-800 dark:text-slate-100">Strict Data Privacy</h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Encrypted database storage and secure tokenized authentication ensures your sensitive clinical records remain completely private.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer disclaimer */}
      <footer className="mx-auto max-w-5xl px-6 py-12 text-center text-xs text-slate-400 leading-relaxed">
        <p className="font-bold text-red-500 uppercase tracking-wider mb-2">Medical Advice Disclaimer</p>
        <p>
          MediSense AI is for educational and informational purposes only. The platform evaluates health reports to explain biomarker definitions, normal ranges, and lifestyle indicators. It is NOT a clinical diagnosis engine and does NOT substitute for professional medical consultations, treatment, or advice. Always consult a physician for health issues.
        </p>
        <p className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
          © {new Date().getFullYear()} MediSense AI. All rights reserved.
        </p>
      </footer>
    </div>
  );
};
