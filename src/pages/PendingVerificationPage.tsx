import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import FilterChips from '../components/FilterChips';
import RescanRequestCard from '../components/RescanRequestCard';
import EmptyState from '../components/EmptyState';
import { ArrowLeft, BarChart3, Wifi, WifiOff } from 'lucide-react';
import { useRescanWebSocket } from '../hooks/useRescanWebSocket';
import type { PendingVerificationResponse } from '../types';

const PendingVerificationPage = () => {
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'completed' | 'rejected'>('pending');
  const [wsConnected] = useState(true);
  const qc = useQueryClient();
  useRescanWebSocket(true);

  const { data, isLoading, error, refetch } = useQuery<PendingVerificationResponse>({
    queryKey: ['pending-verification', statusFilter, projectFilter],
    queryFn: () =>
      api.issues.getPendingVerification({
        project_id: projectFilter || undefined,
        status: statusFilter,
      }),
    refetchInterval: 5000,
  });

  const approveMutation = useMutation({
    mutationFn: ({ issueId, reviewer_note }: { issueId: number; reviewer_note?: string }) =>
      api.issues.approveRescan(issueId, { reviewer_note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-verification'] });
    },
  });
  const rejectMutation = useMutation({
    mutationFn: (issueId: number) =>
      api.issues.triggerVerifyScan(issueId, 'Manual reject from queue'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-verification'] });
    },
  });

  const projectChips = useMemo(() => {
    const counts: Record<string, number> = {};
    data?.groups.forEach((g) => {
      counts[g.project_id] = g.items.length;
    });
    return [
      { value: '', label: 'All Projects', count: data?.total ?? 0 },
      ...Object.entries(counts).map(([pid, count]) => ({
        value: pid,
        label: data?.groups.find((g) => g.project_id === pid)?.project_name || pid,
        count,
      })),
    ];
  }, [data]);

  const total = data?.total ?? 0;
  const groups = data?.groups ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-2">
          <ArrowLeft size={16} /> Back to dashboard
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Pending Verification</h1>
            <p className="text-sm text-slate-500 mt-1">
              {total} request{total !== 1 ? 's' : ''} awaiting review
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            {wsConnected ? (
              <><Wifi size={14} className="text-emerald-500" /> Live</>
            ) : (
              <><WifiOff size={14} className="text-amber-500" /> Offline</>
            )}
          </div>
        </div>
      </div>

      {!wsConnected && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3 flex items-center justify-between">
          <span>Offline — showing cached data. New requests may not appear until reconnected.</span>
          <button onClick={() => refetch()} className="text-amber-700 hover:text-amber-900 underline text-xs">
            Refresh now
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['pending', 'approved', 'completed', 'rejected'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
              statusFilter === s
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {data && data.groups.length > 0 && (
        <div className="mb-4">
          <FilterChips
            options={projectChips}
            value={projectFilter}
            onChange={setProjectFilter}
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse h-28" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          variant="error"
          title="Failed to load verification queue"
          message={(error as Error).message}
          action={{ label: 'Retry', onClick: () => refetch() }}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          variant="empty"
          title="No pending verification requests"
          message="All issues are up to date. New requests will appear here when developers mark issues as fixed."
          icon={<BarChart3 size={48} />}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.project_id}>
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                {group.project_name}
                <span className="text-xs text-slate-500">({group.items.length})</span>
              </h2>
              <div className="grid grid-cols-1 gap-3">
                {group.items.map((item) => (
                  <RescanRequestCard
                    key={item.rescan_request_id}
                    request={item}
                    onVerify={
                      statusFilter === 'pending'
                        ? (r) =>
                            approveMutation.mutate({
                              issueId: r.issue_id,
                              reviewer_note: 'Approved from queue',
                            })
                        : undefined
                    }
                    onReject={
                      statusFilter === 'pending'
                        ? (r) => rejectMutation.mutate(r.issue_id)
                        : undefined
                    }
                    isVerifying={approveMutation.isPending && approveMutation.variables?.issueId === item.issue_id}
                    isRejecting={rejectMutation.isPending && rejectMutation.variables === item.issue_id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PendingVerificationPage;
