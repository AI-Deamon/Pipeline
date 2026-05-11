import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { ArrowLeft, Clock, ChevronRight, Calendar, Search, RefreshCw, Archive, ListFilter } from 'lucide-react';
import { useState, useMemo } from 'react';
import { PageSkeleton } from '../components/PageSkeleton';
import { EmptyState } from '../components/EmptyState';
import { useScanReset } from '../hooks/useScanReset';

export default function ScanHistoryPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const resetMutation = useScanReset();

  const { data: history = [], isLoading, refetch } = useQuery({
    queryKey: ['scan-history', projectId],
    queryFn: () => api.projects.getScanHistory(projectId!),
    refetchInterval: 10000,
  });

  const filteredHistory = useMemo(() => {
    return history.filter((scan: any) => {
      const matchesSearch = scan.scan_id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || scan.state === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [history, searchTerm, statusFilter]);

  const handleReset = async (e: React.MouseEvent, scanId: string) => {
    e.stopPropagation();
    if (window.confirm('Operational Decision: Reset this execution trace and allow re-triggering?')) {
      resetMutation.mutate(scanId, {
        onSuccess: () => refetch()
      });
    }
  };

  if (isLoading) return <PageSkeleton type="scan" />;

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-32 px-4">
      {/* Header with Archive Context */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="p-4 bg-white border border-slate-200 text-slate-400 hover:text-slate-900 rounded-2xl transition-all active:scale-90 shadow-sm group"
            aria-label="Back to project overview"
          >
            <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
          </button>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Archive className="w-4 h-4 text-blue-500" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Historical Intelligence</span>
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter leading-none uppercase">Execution Archive</h1>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest italic opacity-70">Temporal Telemetry & Compliance Logs</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-white border border-slate-200 p-2 rounded-[2rem] shadow-xl shadow-slate-200/50">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder="Filter by Trace ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-11 pr-4 h-12 bg-slate-50 border-none rounded-xl text-xs font-black uppercase tracking-widest focus:ring-4 focus:ring-blue-500/10 outline-none transition-all w-full sm:w-64 placeholder:text-slate-300"
            />
          </div>
          <div className="flex items-center gap-3 px-4 h-12 bg-slate-50 rounded-xl border-none">
            <ListFilter className="w-4 h-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-[10px] font-black text-slate-600 uppercase tracking-widest outline-none cursor-pointer pr-2"
            >
              <option value="ALL">All States</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="RUNNING">Executing</option>
              <option value="CANCELLED">Aborted</option>
            </select>
          </div>
        </div>
      </header>

      {/* Main Archive Table */}
      <div className="card-container animate-in fade-in zoom-in-95 duration-700">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Execution ID</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Perimeter State</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Temporal Context</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-32 px-10">
                    {history.length === 0 ? (
                      <EmptyState
                        icon={Archive}
                        title="Archive Unitialized"
                        description="No security scans have been committed to this project perimeter yet. Trigger a tactical cycle to begin data collection."
                        actionLabel="Initialize Scan"
                        onAction={() => navigate(`/projects/${projectId}`)}
                      />
                    ) : (
                      <div className="text-center flex flex-col items-center">
                        <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 border-2 border-dashed border-slate-200">
                          <Search className="w-10 h-10 text-slate-300" />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Zero Matches Located</h3>
                        <p className="text-slate-400 text-sm font-medium italic mt-2">Adjust your intelligence filters or search criteria.</p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredHistory.map((scan: any) => {
                  const isFailed = scan.state === 'FAILED';
                  const isSuccess = scan.state === 'COMPLETED';
                  const isRunning = ['RUNNING', 'QUEUED'].includes(scan.state);

                  return (
                    <tr 
                      key={scan.scan_id}
                      onClick={() => navigate(`/scans/${scan.scan_id}`)}
                      className="group cursor-pointer hover:bg-slate-50/80 transition-all duration-300"
                    >
                      <td className="px-10 py-8">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-all scale-0 group-hover:scale-100"></div>
                            <span className="font-mono text-xs font-black text-slate-400 group-hover:text-blue-600 transition-colors">
                              {scan.scan_id.split('-')[0].toUpperCase()}...
                            </span>
                            <span className="opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 bg-blue-50 text-blue-600 text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-[0.2em]">Review Trace</span>
                          </div>
                          <div className="text-[9px] font-bold text-slate-300 ml-5 uppercase tracking-widest truncate max-w-[200px]" title={scan.scan_id}>
                            Cluster ID: {scan.scan_id}
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className={`inline-flex items-center gap-3 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border shadow-sm transition-all duration-500 ${
                          isSuccess ? 'bg-green-50 text-green-600 border-green-100 group-hover:bg-green-600 group-hover:text-white' :
                          isFailed ? 'bg-red-50 text-red-600 border-red-100 group-hover:bg-red-600 group-hover:text-white' :
                          isRunning ? 'bg-blue-50 text-blue-600 border-blue-100 group-hover:bg-blue-600 group-hover:text-white' :
                          'bg-slate-50 text-slate-400 border-slate-100'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            isSuccess ? 'bg-green-500 group-hover:bg-white' :
                            isFailed ? 'bg-red-500 group-hover:bg-white' :
                            isRunning ? 'bg-blue-500 animate-pulse group-hover:bg-white' :
                            'bg-slate-300'
                          }`}></div>
                          {scan.state}
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-3 text-xs font-black text-slate-700">
                            <Calendar className="w-4 h-4 text-slate-300" />
                            {new Date(scan.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest opacity-60">
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(scan.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-8 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {isFailed && (
                            <button
                              onClick={(e) => handleReset(e, scan.scan_id)}
                              className="p-3 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-all shadow-lg shadow-red-900/5 active:scale-90 group/btn"
                              title="Reset and re-trigger execution"
                              aria-label="Reset and re-trigger execution"
                            >
                              <RefreshCw className={`w-4 h-4 ${resetMutation.isPending ? 'animate-spin' : 'group-hover/btn:rotate-180 transition-transform duration-500'}`} />
                            </button>
                          )}
                          <div className="p-3 bg-white border border-slate-200 text-slate-300 group-hover:text-blue-600 group-hover:border-blue-200 group-hover:shadow-xl group-hover:shadow-blue-900/10 rounded-xl transition-all scale-95 group-hover:scale-100">
                            <ChevronRight className="w-5 h-5" />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
