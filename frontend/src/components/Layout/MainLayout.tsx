import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AlertCircle, Cpu, ScanLine } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import { useSystemStatus } from '../../context/SystemStatusContext';

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t } = useTranslation();
  const { status } = useSystemStatus();

  const llmDown = status ? !status.llm.configured : false;
  const ocrDown = status ? !status.ocr.any_engine_available : false;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-900">
      {/* Top Header */}
      <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      
      {/* Main Container */}
      <div className="flex">
        {/* Navigation Sidebar */}
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        
        {/* Backdrop for mobile sidebar */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-10 bg-black/40 backdrop-blur-sm lg:hidden"
          ></div>
        )}

        {/* Content Area */}
        <main className="flex-1 px-4 py-8 pt-24 lg:pl-72 lg:pr-8">
          <div className="mx-auto max-w-6xl">
            {/* Honest capability disclosure: degraded mode must never look like real AI output */}
            {llmDown && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20 print:hidden">
                <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    AI model not configured
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-amber-700/90 dark:text-amber-200/80">
                    No language model is connected to this server
                    {status?.llm.reason ? ` (${status.llm.reason})` : ''}. Reports are analysed by a
                    rule-based parser that only reports values actually printed in your document, and the
                    chat assistant returns retrieved evidence instead of generated answers. Set
                    GEMINI_API_KEY in backend/.env to enable AI analysis.
                  </p>
                </div>
              </div>
            )}

            {ocrDown && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900/40 dark:bg-orange-950/20 print:hidden">
                <ScanLine className="mt-0.5 h-5 w-5 shrink-0 text-orange-600 dark:text-orange-400" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-orange-800 dark:text-orange-300">
                    No OCR engine available
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-orange-700/90 dark:text-orange-200/80">
                    Scanned images cannot be read on this server. Digital PDFs with a selectable text
                    layer still work. Install EasyOCR or the Tesseract binary to enable image OCR.
                  </p>
                </div>
              </div>
            )}

            {children}
            
            {/* Global Sticky Medical Disclaimer */}
            <footer className="mt-16 rounded-2xl border border-red-100 bg-red-50/50 p-4 dark:border-red-950/20 dark:bg-red-950/5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-red-800 dark:text-red-400">
                    {t('disclaimerTitle')}
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-red-700/80 dark:text-red-400/85">
                    {t('disclaimerBody')}
                  </p>
                </div>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
};
