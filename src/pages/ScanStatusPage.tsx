import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle, Clock, ExternalLink, FileText, Loader2, SkipForward } from 'lucide-react';
import { api } from '../services/api';
import { useScanCancel, useScanForceUnlock } from '../hooks/useScanReset';
import { useScanWebSocket } from '../hooks/useScanWebSocket';
import { ScanErrorModal } from '../components/ScanErrorModal';
import { ScanProgressBar } from '../components/ScanProgressBar';
import { ErrorSuggestions } from '../components/ErrorSuggestions';
import { PageSkeleton } from '../components/PageSkeleton';
import { useToast } from '../components/Toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { notificationService } from '../services/notifications';
import type { Scan, ScanStage } from '../types';

function scanRefetchInterval(query: { state: { data: unknown } }): false | 3000 {
  const data = query.state.data as { scan: Scan; stages: ScanStage[] } | undefined;
  if (data?.scan && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(data.scan.state)) {
    return false;
  }
  return 3000;
}

type ScanStatusBadgeProps = {
  state?: string;
};

function ScanStatusBadge({ state }: ScanStatusBadgeProps) {
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
      state === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' :
      state === 'FAILED' ? 'bg-rose-50 text-rose-700' :
      state === 'CANCELLED' ? 'bg-slate-100 text-slate-600' :
      'bg-amber-50 text-amber-700'
    }`}>
      {state || 'Unknown'}
    </span>
  );
}

type ScanStagesListProps = {
  stages: ScanStage[];
  scan?: Scan;
  expandedStages: Record<string, boolean>;
  onToggleStage: (stageId: string) => void;
};

function ScanStagesList({ stages, scan, expandedStages, onToggleStage }: ScanStagesListProps) {
  if (stages.length === 0) {
    return (
      <div className="p-12 text-center">
        <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-600 font-medium">
          {scan?.state === 'RUNNING' || scan?.state === 'QUEUED' || scan?.state === 'CREATED'
            ? "Scan is starting..."
            : scan?.state === 'CANCELLED'
            ? "Scan was cancelled"
            : "No stages recorded"}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {stages.map((stage, idx) => {
        const isExpanded = expandedStages[stage.stage];
        const isFailed = stage.status === 'FAIL';
        const isSuccess = stage.status === 'PASS';

        return (
          <div key={idx}>
            <button
              onClick={() => onToggleStage(stage.stage)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                {isSuccess ? (
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                ) : isFailed ? (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                ) : stage.status.toLowerCase().includes('skipped') ? (
                  <SkipForward className="w-5 h-5 text-slate-400" />
                ) : (
                  <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                )}
                <span className="font-medium text-slate-900">{stage.stage.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm ${
                  isSuccess ? 'text-emerald-600' : isFailed ? 'text-red-600' : stage.status.toLowerCase().includes('skipped') ? 'text-slate-500' : 'text-amber-600'
                }`}>
                  {stage.status}
                </span>
                <span className="text-slate-400">{isExpanded ? '\u2212' : '+'}</span>
              </div>
            </button>

            {isExpanded && (
              <div className="px-6 pb-4 bg-slate-50/50">
                <div className="text-sm text-slate-600">
                  <p className="mb-2">{stage.summary || 'No summary available'}</p>
                  {stage.artifact_url && (
                    <a
                      href={stage.artifact_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View Artifacts
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const ScanStatusPage = () => {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showForceStopConfirm, setShowForceStopConfirm] = useState(false);

  const projectIdFromState = (location.state as { projectId?: string } | null)?.projectId;

  const toggleStage = (stageId: string) => {
    setExpandedStages(prev => ({ ...prev, [stageId]: !prev[stageId] }));
  };

  const { data: scanData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['scan', scanId],
    queryFn: async () => {
      if (!scanId) return null;
      const scan = await api.scans.get(scanId);
      return { scan, stages: scan?.results || [] };
    },
    refetchInterval: scanRefetchInterval,
    enabled: !!scanId,
  });

  const scan = scanData?.scan;
  const stages = scanData?.stages || [];

  useEffect(() => {
    if (scan?.state === 'FAILED' && scan?.error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowErrorModal(true);
    }
  }, [scan]);

  const cancelMutation = useScanCancel();
  const forceUnlockMutation = useScanForceUnlock();

  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useScanWebSocket(scanId, undefined, {
    onMessage: (message) => {
      const prevState = (queryClient.getQueryData(['scan', scanId]) as { scan: Scan; stages: ScanStage[] } | undefined)?.scan?.state;
      const newState = message.data?.state;

      queryClient.setQueryData(['scan', scanId], {
        scan: message.data,
        stages: message.data.results || []
      });
      setLastUpdated(new Date());

      if (prevState && prevState !== newState) {
        if (newState === 'FAILED') {
          addToast({
            type: 'error',
            title: 'Scan Failed',
            message: message.data?.error?.message || 'The scan encountered an error.',
            duration: 6000,
          });
          notificationService.showScanComplete(scanId!, 'FAILED');
        } else if (newState === 'COMPLETED') {
          addToast({
            type: 'success',
            title: 'Scan Complete',
            message: 'All stages finished successfully.',
            duration: 4000,
          });
          notificationService.showScanComplete(scanId!, 'COMPLETED');
        }
      }
    }
  });

  useEffect(() => {
    if (scanData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastUpdated(new Date());
    }
  }, [scanData]);

  const handleCancel = async () => {
    if (!scanId) return;
    const projectIdToNavigate = scan?.project_id;
    cancelMutation.mutate(scanId, {
      onSuccess: () => {
        setShowCancelConfirm(false);
        addToast({
          type: 'success',
          title: 'Scan Cancelled',
          message: 'The scan has been stopped. You can re-trigger it from the project page.',
          duration: 10000,
        });
        refetch();
        if (projectIdToNavigate) {
          setTimeout(() => {
            navigate(`/projects/${projectIdToNavigate}`);
          }, 2000);
        }
      },
      onError: (error) => {
        addToast({
          type: 'error',
          title: 'Cancel Failed',
          message: error.message || 'Failed to cancel scan.',
        });
        setShowCancelConfirm(false);
      }
    });
  };

  if (isLoading && !scan) return <PageSkeleton type="scan" />;

  return (
    <div className="max-w-4xl mx-auto p-8 pb-20">
      <header className="flex items-center gap-4 mb-8">
        <button
          onClick={() => {
            const projectId = scan?.project_id || projectIdFromState;
            if (projectId) {
              navigate(`/projects/${projectId}`);
            }
          }}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">Scan Status</h1>
          <p className="text-sm text-slate-500">ID: {scanId}</p>
        </div>
        <ScanStatusBadge state={scan?.state} />
      </header>

      <div className="flex items-center gap-3 mb-6">
        {(scan?.state === 'RUNNING' || scan?.state === 'QUEUED' || scan?.state === 'CREATED') ? (
          <>
            <button
              onClick={() => setShowCancelConfirm(true)}
              disabled={cancelMutation.isPending}
              className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel Scan"}
            </button>
            <button
              onClick={() => setShowForceStopConfirm(true)}
              disabled={forceUnlockMutation.isPending}
              className="px-4 py-2 border border-amber-200 text-amber-700 hover:bg-amber-50 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${forceUnlockMutation.isPending ? 'animate-spin' : ''}`} />
              {forceUnlockMutation.isPending ? "Stopping..." : "Force Stop"}
            </button>
          </>
        ) : null}
        {scan?.state === 'COMPLETED' && scan?.project_id && (
          <button
            onClick={() => navigate(`/projects/${scan.project_id}/reports`, { state: { scanId: scanId } })}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            View Reports
          </button>
        )}
        <button
          onClick={() => refetch()}
          className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
        </button>
        <span className="text-sm text-slate-400">Updated: {lastUpdated.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <ScanProgressBar
          stages={stages}
          scanState={scan?.state || 'UNKNOWN'}
          startedAt={scan?.started_at}
          finishedAt={scan?.finished_at}
          selectedStages={scan?.selected_stages}
        />
      </div>

      {scan && scan.state === 'FAILED' && scan?.error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-rose-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-rose-900">Scan Failed</h3>
              <p className="text-sm text-rose-700">The scan encountered an error. Check details below.</p>
            </div>
            <button
              onClick={() => setShowErrorModal(true)}
              className="px-4 py-2 bg-rose-600 text-white text-sm font-medium rounded-lg hover:bg-rose-700 transition-colors"
            >
              View Full Details
            </button>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-rose-100 mb-4">
            <div className="text-sm font-medium text-slate-700 mb-2">Error Message:</div>
            <p className="text-sm text-slate-600 font-mono bg-slate-50 p-3 rounded-lg overflow-x-auto">
              {scan.error.message}
            </p>
          </div>

          {scan.error.jenkins_console_url && (
            <a 
              href={scan.error.jenkins_console_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-rose-700 hover:text-rose-800 font-medium"
            >
              <ExternalLink className="w-4 h-4" />
              View Full Jenkins Logs (for detailed error info)
            </a>
          )}
          <ErrorSuggestions 
            errorType={scan.error.error_type} 
            errorMessage={scan.error.message}
            stage={stages.find(s => s.status.toLowerCase().includes('fail'))?.stage}
          />
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-medium text-slate-900">Scan Stages</h3>
        </div>
        <ScanStagesList
          stages={stages}
          scan={scan}
          expandedStages={expandedStages}
          onToggleStage={toggleStage}
        />
      </div>

      <ScanErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        error={scan?.error || null}
        finishedAt={scan?.finished_at}
      />

      {showCancelConfirm && (
        <ConfirmModal
          isOpen={showCancelConfirm}
          onClose={() => setShowCancelConfirm(false)}
          onConfirm={handleCancel}
          title="Cancel scan?"
          message="Partial results will be lost and you'll need to re-trigger the scan from the project page. This action cannot be undone."
          confirmLabel="Cancel Scan"
          variant="danger"
          isPending={cancelMutation.isPending}
        />
      )}

      <ConfirmModal
        isOpen={showForceStopConfirm}
        onClose={() => setShowForceStopConfirm(false)}
        onConfirm={() => {
          forceUnlockMutation.mutate(scanId!);
          setShowForceStopConfirm(false);
        }}
        title="Force Stop Scan"
        message="Force stop this scan? This will mark it as failed and allow a new scan to start."
        confirmLabel="Force Stop"
        variant="warning"
        icon={<RefreshCw />}
      />
    </div>
  );
};

export default ScanStatusPage;