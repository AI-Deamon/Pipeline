import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { api } from '../services/api';
import { ArrowLeft, Search } from 'lucide-react';
import { PageSkeleton } from '../components/PageSkeleton';
import { useScanReset } from '../hooks/useScanReset';

export default function ScanHistoryPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmReset, setConfirmReset] = useState<{isOpen: boolean, scanId: string} | null>(null);
  const resetMutation = useScanReset();

  const { data: history = [], isLoading, refetch } = useQuery({
    queryKey: ['scan-history', projectId],
    queryFn: () => api.projects.getScanHistory(projectId!),
    refetchInterval: 10000,
  });

  const filteredHistory = useMemo(() => {
    return history.filter((scan: any) => 
      scan.scan_id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [history, searchTerm]);

  const handleConfirmReset = () => {
    if (confirmReset) {
      resetMutation.mutate(confirmReset.scanId, {
        onSuccess: () => {
          refetch();
          setConfirmReset(null);
        }
      });
    }
  };

  if (isLoading) return <PageSkeleton type="scan" />;

  const getStatusBadge = (state: string) => {
    switch (state) {
      case "COMPLETED":
        return { bg: "bg-emerald-50 text-emerald-700", label: "Secured" };
      case "FAILED":
        return { bg: "bg-rose-50 text-rose-700", label: "Failed" };
      case "RUNNING":
      case "QUEUED":
      case "CREATED":
        return { bg: "bg-amber-50 text-amber-700", label: "Scanning" };
      case "CANCELLED":
        return { bg: "bg-slate-100 text-slate-600", label: "Cancelled" };
      default:
        return { bg: "bg-slate-100 text-slate-600", label: state || "Unknown" };
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 pb-20">
      <header className="flex items-center gap-4 mb-8">
        <Link
          to={`/projects/${projectId}`}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">Scan History</h1>
          <p className="text-sm text-slate-500">Past scan results</p>
        </div>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by scan ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
            />
          </div>
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <Search className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            {history.length === 0 ? "No scans yet" : "No matches found"}
          </h3>
          <p className="text-slate-500 mb-6">
            {history.length === 0 ? "Start a scan to see history here." : `No results for "${searchTerm}"`}
          </p>
          <Link
            to={`/projects/${projectId}`}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium"
          >
            Go to Project
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-sm font-medium text-slate-600">Scan ID</th>
                <th className="px-6 py-3 text-sm font-medium text-slate-600">Status</th>
                <th className="px-6 py-3 text-sm font-medium text-slate-600">Date</th>
                <th className="px-6 py-3 text-sm font-medium text-slate-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.map((scan: any) => {
                const status = getStatusBadge(scan.state);
                return (
                  <tr
                    key={scan.scan_id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => navigate(`/scans/${scan.scan_id}`, { state: { projectId: scan.project_id } })}
                  >
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono text-slate-600">{scan.scan_id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${status.bg}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {scan.created_at ? new Date(scan.created_at).toLocaleString('en-IN', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'Asia/Kolkata',
                      }) : '--'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        to={`/scans/${scan.scan_id}`}
                        className="text-sm text-slate-600 hover:text-slate-900"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setConfirmReset(null)}></div>
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl relative z-10">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Reset Scan?</h3>
            <p className="text-slate-500 text-sm mb-6">This will reset scan {confirmReset.scanId.slice(0, 8)}...</p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmReset}
                disabled={resetMutation.isPending}
                className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {resetMutation.isPending ? "Resetting..." : "Reset"}
              </button>
              <button
                onClick={() => setConfirmReset(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}