import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { api } from '../services/api';
import { ArrowLeft, Search } from 'lucide-react';
import { PageSkeleton } from '../components/PageSkeleton';
import { useScanForceUnlock } from '../hooks/useScanReset';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfirmModal } from '../components/ConfirmModal';
import EmptyState from '../components/EmptyState';
import type { Scan } from '../types';

export default function ScanHistoryPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmReset, setConfirmReset] = useState<{isOpen: boolean, scanId: string} | null>(null);
  const forceUnlockMutation = useScanForceUnlock();

  const { data: history = [], isLoading, refetch } = useQuery({
    queryKey: ['scan-history', projectId],
    queryFn: () => api.projects.getScanHistory(projectId!),
    refetchInterval: 10000,
  });

  const filteredHistory = useMemo(() => {
    return history.filter((scan: Scan) => 
      scan.scan_id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [history, searchTerm]);

  const handleConfirmForceStop = () => {
    if (confirmReset) {
      forceUnlockMutation.mutate(confirmReset.scanId, {
        onSuccess: () => {
          refetch();
          setConfirmReset(null);
        }
      });
    }
  };

  if (isLoading) return <PageSkeleton type="scan" />;

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
        history.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No scans yet"
            message="Start a scan to see history here."
            action={{ label: "Go to Project", onClick: () => navigate(`/projects/${projectId}`) }}
            icon={<Search size={48} />}
          />
        ) : (
          <EmptyState
            variant="empty"
            title="No matches found"
            message={`No results for "${searchTerm}"`}
            icon={<Search size={48} />}
          />
        )
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
              {filteredHistory.map((scan: Scan) => {
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
                      <StatusBadge state={scan.state} />
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {scan.created_at ? new Date(scan.created_at).toLocaleString('en-IN', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'Asia/Kolkata',
                      }) : '--'}
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      {['RUNNING', 'QUEUED', 'CREATED'].includes(scan.state) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmReset({ isOpen: true, scanId: scan.scan_id });
                          }}
                          className="text-sm text-amber-600 hover:text-amber-800 font-medium"
                        >
                          Force Stop
                        </button>
                      )}
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

      <ConfirmModal
        isOpen={!!confirmReset}
        onClose={() => setConfirmReset(null)}
        onConfirm={handleConfirmForceStop}
        title="Force stop scan?"
        message={`This will mark scan ${confirmReset?.scanId.slice(0, 8)}... as failed so you can start a new scan.`}
        confirmLabel="Force Stop"
        variant="warning"
        isPending={forceUnlockMutation.isPending}
      />
    </div>
  );
}