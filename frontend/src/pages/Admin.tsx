import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Users, FileText, Brain, RefreshCw, 
  Trash2, Database, BarChart3, Loader2, Info, AlertTriangle 
} from 'lucide-react';
import api from '../services/api';

interface SystemStats {
  users_count: number;
  reports_count: number;
  chats_count: number;
  notifications_count: number;
  average_health_score: number;
  report_types_distribution: Record<string, number>;
  rag_status: {
    total_chunks: number;
    using_ml_libs: boolean;
  };
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  language: string;
  created_at: string;
}

interface ReportRecord {
  id: string;
  user_id: string;
  patient_name: string;
  filename: string;
  report_type: string;
  health_score: number;
  created_at: string;
}

export const Admin: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [rebuildingIndex, setRebuildingIndex] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'users' | 'reports' | 'rag'>('stats');

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, reportsRes] = await Promise.all([
        api.get('/admin/statistics'),
        api.get('/admin/users'),
        api.get('/admin/reports')
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data);
      setReports(reportsRes.data);
    } catch (err) {
      console.error("Failed to load admin dashboard content:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Are you sure you want to delete this user and all their clinical reports?")) {
      return;
    }
    
    try {
      await api.delete(`/admin/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
      // Refresh statistics after user deletion
      const statsRes = await api.get('/admin/statistics');
      setStats(statsRes.data);
    } catch (err) {
      console.error("Failed to delete user:", err);
      alert("Error deleting user.");
    }
  };

  const handleRebuildIndex = async () => {
    setRebuildingIndex(true);
    try {
      const res = await api.post('/admin/knowledge-base/rebuild');
      alert(res.data.message || "FAISS Vector Index rebuilt successfully!");
      // Reload stats
      const statsRes = await api.get('/admin/statistics');
      setStats(statsRes.data);
    } catch (err) {
       console.error("Failed to rebuild index:", err);
       alert("Error rebuilding RAG index.");
    } finally {
      setRebuildingIndex(false);
    }
  };

  if (loading) {
     return (
       <div className="flex h-96 items-center justify-center">
         <div className="text-center">
           <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal-600" />
           <p className="mt-2 text-sm text-slate-400">Loading admin operations center...</p>
         </div>
       </div>
     );
  }

  return (
    <div className="space-y-8 font-sans">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <ShieldCheck className="h-8 w-8 text-teal-500" />
          Admin Control Panel
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Manage system users, audit uploaded documents, analyze system statistics, and configure RAG embeddings.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-150 pb-px dark:border-slate-800 flex gap-6 text-sm font-semibold text-slate-400">
        <button
          onClick={() => setActiveTab('stats')}
          className={`pb-3 border-b-2 transition-colors ${activeTab === 'stats' ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent hover:text-slate-700 dark:hover:text-slate-200'}`}
        >
          System Stats
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 border-b-2 transition-colors ${activeTab === 'users' ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent hover:text-slate-700 dark:hover:text-slate-200'}`}
        >
          Users Management ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`pb-3 border-b-2 transition-colors ${activeTab === 'reports' ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent hover:text-slate-700 dark:hover:text-slate-200'}`}
        >
          All Uploaded Reports ({reports.length})
        </button>
        <button
          onClick={() => setActiveTab('rag')}
          className={`pb-3 border-b-2 transition-colors ${activeTab === 'rag' ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent hover:text-slate-700 dark:hover:text-slate-200'}`}
        >
          RAG Knowledge Base
        </button>
      </div>

      {/* Tab: Stats */}
      {activeTab === 'stats' && stats && (
        <div className="space-y-8 animate-fade-in">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-slate-100 bg-white p-5 flex items-center justify-between dark:border-slate-800 dark:bg-navy-800">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registered Users</span>
                <p className="mt-1 text-3xl font-extrabold text-slate-800 dark:text-white">{stats.users_count}</p>
              </div>
              <Users className="h-10 w-10 text-teal-500 bg-teal-50 dark:bg-teal-950/20 p-2.5 rounded-xl" />
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-5 flex items-center justify-between dark:border-slate-800 dark:bg-navy-800">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Uploads</span>
                <p className="mt-1 text-3xl font-extrabold text-slate-800 dark:text-white">{stats.reports_count}</p>
              </div>
              <FileText className="h-10 w-10 text-teal-500 bg-teal-50 dark:bg-teal-950/20 p-2.5 rounded-xl" />
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-5 flex items-center justify-between dark:border-slate-800 dark:bg-navy-800">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg Health Index</span>
                <p className="mt-1 text-3xl font-extrabold text-slate-800 dark:text-white">{stats.average_health_score}/100</p>
              </div>
              <BarChart3 className="h-10 w-10 text-teal-500 bg-teal-50 dark:bg-teal-950/20 p-2.5 rounded-xl" />
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-5 flex items-center justify-between dark:border-slate-800 dark:bg-navy-800">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vector Chunks</span>
                <p className="mt-1 text-3xl font-extrabold text-slate-800 dark:text-white">{stats.rag_status.total_chunks}</p>
              </div>
              <Database className="h-10 w-10 text-teal-500 bg-teal-50 dark:bg-teal-950/20 p-2.5 rounded-xl" />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 pb-3 dark:border-slate-700 mb-4">
              Report Types Distribution
            </h3>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              {Object.entries(stats.report_types_distribution).map(([type, count], idx) => (
                <div key={idx} className="rounded-2xl bg-slate-50 dark:bg-navy-900 p-4 border border-slate-100 dark:border-slate-800">
                  <p className="text-xs text-slate-400 truncate">{type}</p>
                  <p className="text-xl font-bold mt-1 text-slate-800 dark:text-white">{count}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Users */}
      {activeTab === 'users' && (
        <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead>
                <tr className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-700 pb-2">
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Email</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Lang</th>
                  <th className="pb-3">Registered On</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-navy-700/10">
                    <td className="py-3 font-semibold text-slate-800 dark:text-slate-200">{u.name}</td>
                    <td className="py-3">{u.email}</td>
                    <td className="py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${u.role === 'admin' ? 'bg-teal-50 text-teal-600 dark:bg-teal-950/20 dark:text-teal-400' : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 uppercase text-xs">{u.language}</td>
                    <td className="py-3 text-xs text-slate-400">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="py-3 text-right">
                      {u.role !== 'admin' ? (
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-4.5 w-4.5" />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 px-2 italic">Protected</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Reports */}
      {activeTab === 'reports' && (
        <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead>
                <tr className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-700 pb-2">
                  <th className="pb-3">Filename</th>
                  <th className="pb-3">User</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Score</th>
                  <th className="pb-3">Uploaded Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-navy-700/10">
                    <td className="py-3 font-semibold text-slate-800 dark:text-slate-200">{r.filename}</td>
                    <td className="py-3 text-xs">{r.patient_name}</td>
                    <td className="py-3 text-xs">{r.report_type}</td>
                    <td className="py-3 font-bold text-xs">{r.health_score}/100</td>
                    <td className="py-3 text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: RAG */}
      {activeTab === 'rag' && stats && (
        <div className="rounded-3xl border border-slate-100 bg-white p-6 dark:border-slate-800 dark:bg-navy-800 shadow-glass space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-700">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Medical Knowledge Base Vector Store</h3>
              <p className="text-xs text-slate-400 mt-1">Status of vector indexing, loaded guidelines, and embedding weights.</p>
            </div>
            
            <button
              onClick={handleRebuildIndex}
              disabled={rebuildingIndex}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-3.5 text-xs font-bold text-white shadow-md hover:scale-105 transition-transform"
            >
              {rebuildingIndex ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Rebuilding FAISS Index...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Rebuild Index
                </>
              )}
            </button>
          </div>

          <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4 dark:border-teal-950/20 dark:bg-teal-950/5 flex items-start gap-3">
            <Info className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-teal-800 dark:text-teal-400">
              <p className="font-bold uppercase tracking-wider">Vector Store configurations:</p>
              <ul className="mt-1 list-disc pl-4 space-y-1">
                <li>Embeddings model: <span className="font-bold">sentence-transformers (all-MiniLM-L6-v2)</span></li>
                <li>Distance metric: <span className="font-bold">L2 (Euclidean Distance)</span></li>
                <li>Dimension size: <span className="font-bold">384</span></li>
                <li>Total indexed text segments: <span className="font-bold">{stats.rag_status.total_chunks}</span></li>
                <li>Primary library compilation: <span className="font-bold">{stats.rag_status.using_ml_libs ? "FAISS Native C++" : "Pure Python Memory Cache"}</span></li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
