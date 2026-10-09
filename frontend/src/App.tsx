import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SystemStatusProvider } from './context/SystemStatusContext';
import { MainLayout } from './components/Layout/MainLayout';

// Page Imports
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { Dashboard } from './pages/Dashboard';
import { Upload } from './pages/Upload';
import { Analysis } from './pages/Analysis';
import { History } from './pages/History';
import { Compare } from './pages/Compare';
import { Chat } from './pages/Chat';
import { Profile } from './pages/Profile';
import { Admin } from './pages/Admin';
import { SharedReport } from './pages/SharedReport';
import { NotFound } from './pages/NotFound';

// Route Guard for Authenticated Users
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-navy-900">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent mx-auto"></div>
          <p className="mt-2 text-xs text-slate-400">Synchronizing session...</p>
        </div>
      </div>
    );
  }
  
  return isAuthenticated ? (
    <MainLayout>{children}</MainLayout>
  ) : (
    <Navigate to="/login" replace />
  );
};

// Route Guard for Administrators Only
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-navy-900">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-500 border-t-transparent"></div>
      </div>
    );
  }
  
  return isAuthenticated && user?.role === 'admin' ? (
    <MainLayout>{children}</MainLayout>
  ) : (
    <Navigate to="/dashboard" replace />
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SystemStatusProvider>
          <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/api/v1/reports/shared/view/:token" element={<SharedReport />} />

            {/* Protected Dashboard/Report Routes */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
            <Route path="/analysis/:reportId" element={<ProtectedRoute><Analysis /></ProtectedRoute>} />
            <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
            <Route path="/compare" element={<ProtectedRoute><Compare /></ProtectedRoute>} />
            <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

            {/* Admin Dedicated Routes */}
            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />

            {/* Fallback 404 */}
            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
          </BrowserRouter>
        </SystemStatusProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
