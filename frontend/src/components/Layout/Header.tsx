import React, { useState, useEffect } from 'react';
import { Bell, Sun, Moon, Languages, Menu, ShieldAlert, Check, Activity } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';
import api from '../../services/api';

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}

export const Header: React.FC<HeaderProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const { user, updateProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      // Poll notifications every 30 seconds for live updates
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications/all');
      setNotifications(res.data);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  };

  const handleLanguageChange = async (lang: string) => {
    try {
      await updateProfile({ language: lang });
      setLangOpen(false);
    } catch (err) {
       console.error("Failed to change language:", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error("Failed to read all notifications:", err);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-navy-800/80">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
        >
          <Menu className="h-6 w-6" />
        </button>
        
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-primary-500 to-teal-500 text-white shadow-md shadow-primary-500/10">
            <Activity className="h-5 w-5 animate-pulse-slow" />
          </div>
          <span className="bg-gradient-to-r from-primary-600 to-teal-600 bg-clip-text text-lg font-extrabold tracking-tight text-transparent dark:from-primary-400 dark:to-teal-400">
            MediSense AI
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Language Switcher */}
        <div className="relative">
          <button
            onClick={() => setLangOpen(!langOpen)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 flex items-center gap-1.5"
          >
            <Languages className="h-5 w-5" />
            <span className="hidden text-xs font-semibold uppercase lg:block">{user?.language || 'en'}</span>
          </button>
          
          {langOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)}></div>
              <div className="absolute right-0 mt-2 z-50 w-44 rounded-xl border border-slate-100 bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-navy-800">
                <button
                  onClick={() => handleLanguageChange('en')}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <span>{t('english')}</span>
                  {user?.language === 'en' && <Check className="h-4 w-4 text-primary-500" />}
                </button>
                <button
                  onClick={() => handleLanguageChange('hi')}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <span>{t('hindi')}</span>
                  {user?.language === 'hi' && <Check className="h-4 w-4 text-primary-500" />}
                </button>
                <button
                  onClick={() => handleLanguageChange('te')}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <span>{t('telugu')}</span>
                  {user?.language === 'te' && <Check className="h-4 w-4 text-primary-500" />}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Dark/Light mode toggle */}
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* Notifications dropdown */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)}></div>
              <div className="absolute right-0 mt-2 z-50 w-80 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-navy-800">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-700">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="mt-3 max-h-64 overflow-y-auto space-y-3">
                  {notifications.length === 0 ? (
                    <p className="text-center text-xs py-4 text-slate-400">No notifications yet.</p>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className={`rounded-xl p-2.5 text-xs transition-colors ${n.read ? 'bg-white dark:bg-navy-800' : 'bg-primary-50/50 dark:bg-primary-950/10'}`}>
                        <p className="font-bold text-slate-800 dark:text-slate-200">{n.title}</p>
                        <p className="mt-0.5 text-slate-500 dark:text-slate-400">{n.message}</p>
                        <span className="mt-1 block text-[10px] text-slate-400">{new Date(n.created_at).toLocaleDateString()}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
