import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, UploadCloud, History, 
  ArrowLeftRight, MessageSquareCode, User, 
  Settings as SettingsIcon, ShieldCheck, LogOut, Activity
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  const links = [
    { to: "/dashboard", label: t('dashboard'), icon: LayoutDashboard },
    { to: "/upload", label: t('uploadReport'), icon: UploadCloud },
    { to: "/history", label: t('medicalHistory'), icon: History },
    { to: "/compare", label: t('compareReports'), icon: ArrowLeftRight },
    { to: "/chat", label: t('aiChat'), icon: MessageSquareCode },
    { to: "/profile", label: t('profile'), icon: User },
  ];

  return (
    <aside className={`fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-slate-200 bg-white pt-16 transition-transform duration-200 dark:border-slate-800 dark:bg-navy-800 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-6">
        <nav className="flex-1 space-y-1">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50 dark:hover:text-slate-100'
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                {link.label}
              </NavLink>
            );
          })}
          
          {/* Admin link conditional */}
          {user?.role === 'admin' && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50 dark:hover:text-slate-100'
                }`
              }
            >
              <ShieldCheck className="h-5 w-5" />
              {t('adminPanel')}
            </NavLink>
          )}
        </nav>
        
        {/* Footer logout */}
        <div className="mt-auto border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex items-center gap-3 px-4 py-2 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-primary-500 to-teal-500 text-white font-semibold">
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div className="truncate">
              <p className="text-sm font-semibold truncate dark:text-slate-100">{user?.name}</p>
              <p className="text-xs text-slate-400 truncate dark:text-slate-400">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20 transition-all"
          >
            <LogOut className="h-5 w-5" />
            {t('logout')}
          </button>
        </div>
      </div>
    </aside>
  );
};
