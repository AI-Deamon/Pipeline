import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle, Clock, ExternalLink, FileText, Loader2, SkipForward } from 'lucide-react';
import { api } from '../services/api';
import { useScanReset, useScanCancel } from '../hooks/useScanReset';
import { useScanWebSocket } from '../hooks/useScanWebSocket';
import { ScanErrorModal } from '../components/ScanErrorModal';
import { ScanProgressBar } from '../components/ScanProgressBar';
import { ErrorSuggestions } from '../components/ErrorSuggestions';
import { PageSkeleton } from '../components/PageSkeleton';
import { useToast } from '../components/Toast';

const ScanStatusPage = () => {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const projectIdFromState = (location.state as any)?.projectId;

  const toggleStage = (stageId: string) => {
    setExpandedStages(prev => ({ ...prev, [stageId]: !prev[stageId] }));
  };

  const resetMutation = useScanReset();
  const cancelMutation = useScanCancel();

  // Track last updated time for display
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Performance Optimization (Bolt ⚡): Hook declared before useQuery so wsConnected is available
  // for adaptive polling back-off logic.
  const { connected: wsConnected, connecting: wsConnecting } = useScanWebSocket(scanId, undefined, {
    onMessage: (message) => {
      console.log('Scan real-time update received:', message);
      // Performance Optimization (Bolt ⚡): Surgical cache update via WebSocket message
      // eliminates the need for an immediate HTTP refetch.
      queryClient.setQueryData(['scan', scanId], {
        scan: message.data,
        stages: message.data.results || []
      });
      setLastUpdated(new Date());
    }
  });

  const { data: scanData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['scan', scanId],
    queryFn: async () => {
      if (!scanId) return null;
      const scan = await api.scans.get(scanId);
      return { scan, stages: scan?.results || [] };
    },
    // Performance Optimization (Bolt ⚡): Adaptive polling.
    // Back off from 3s to 15s if WebSocket is connected, reducing redundant network noise.
    refetchInterval: (query) => {
      const data = query.state.data as any;
      if (data?.scan && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(data.scan.state)) {
        return false;
      }
      return wsConnected ? 15000 : 3000;
    },
    enabled: !!scanId,
  });

  const scan = scanData?.scan;
  const stages = scanData?.stages || [];

  useEffect(() => {
    if (scan?.state === 'FAILED' && (scan as any)?.error) {
      setShowErrorModal(true);
    }
  }, [scan?.state]);

  // Update lastUpdated on successful refetch
  useEffect(() => {
    if (scanData) {
      setLastUpdated(new Date());
    }
  }, [scanData]);

  const handleReset = async () => {
    if (!scanId) return;
    resetMutation.mutate(scanId, {
      onSuccess: () => {
        setShowResetConfirm(false);
        refetch();
      }
    });
  };

  const handleCancel = async () => {
    if (!scanId) return;
    cancelMutation.mutate(scanId, {
      onSuccess: () => {
        setShowCancelConfirm(false);
        addToast({
          type: 'success',
          title: 'Scan Cancelled',
          message: 'The scan has been stopped.',
        });
        refetch();
        setTimeout(() => {
          navigate(`/projects/${scan?.project_id}`);
        }, 2000);
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
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
          scan?.state === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' :
          scan?.state === 'FAILED' ? 'bg-rose-50 text-rose-700' :
          scan?.state === 'CANCELLED' ? 'bg-slate-100 text-slate-600' :
          'bg-amber-50 text-amber-700'
        }`}>
          {scan?.state || 'Unknown'}
        </span>
      </header>

      <div className="flex items-center gap-3 mb-6">
        {(scan?.state === 'RUNNING' || scan?.state === 'QUEUED' || scan?.state === 'CREATED') ? (
          <button
            onClick={() => setShowCancelConfirm(true)}
            disabled={cancelMutation.isPending}
            className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {cancelMutation.isPending ? "Cancelling..." : "Cancel Scan"}
          </button>
        ) : scan?.state === 'FAILED' ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={resetMutation.isPending}
            className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${resetMutation.isPending ? 'animate-spin' : ''}`} />
            Reset & Retry
          </button>
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
        <span className="text-sm text-slate-400">Updated: {lastUpdated.toLocaleTimeString()}</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <ScanProgressBar
          stages={stages}
          scanState={scan?.state || 'UNKNOWN'}
          startedAt={scan?.started_at}
          createdAt={scan?.created_at}
          selectedStages={scan?.selected_stages}
        />
      </div>

      {scan && scan.state === 'FAILED' && (scan as any)?.error && (
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
              {(scan as any).error.message}
            </p>
          </div>

          {(scan as any).error.jenkins_console_url && (
            <a 
              href={(scan as any).error.jenkins_console_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-rose-700 hover:text-rose-800 font-medium"
            >
              <ExternalLink className="w-4 h-4" />
              View Full Jenkins Logs (for detailed error info)
            </a>
          )}
          <ErrorSuggestions 
            errorType={(scan as any).error.error_type} 
            errorMessage={(scan as any).error.message}
            stage={stages.find(s => s.status.toLowerCase().includes('fail'))?.stage}
          />
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-medium text-slate-900">Scan Stages</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {stages.length === 0 ? (
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
          ) : (
            stages.map((stage, idx) => {
              const isExpanded = expandedStages[stage.stage];
              const isFailed = stage.status.toLowerCase().includes('fail');
              const isSuccess = stage.status.toLowerCase().includes('pass') || stage.status.toLowerCase().includes('success');
              
              return (
                <div key={idx}>
                  <button 
                    onClick={() => toggleStage(stage.stage)}
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
                      <span className="text-slate-400">{isExpanded ? '−' : '+'}</span>
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
            })
          )}
        </div>
      </div>

      <ScanErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        error={(scan as any)?.error || null}
        onRetry={() => setShowResetConfirm(true)}
        isRetrying={resetMutation.isPending}
      />

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowResetConfirm(false)}></div>
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl relative z-10">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Reset & Retry?</h3>
            <p className="text-slate-500 text-sm mb-6">This will reset the scan so you can run it again.</p>
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                disabled={resetMutation.isPending}
                className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {resetMutation.isPending ? "Resetting..." : "Reset & Retry"}
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowCancelConfirm(false)}></div>
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl relative z-10">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Cancel Scan?</h3>
            <p className="text-slate-500 text-sm mb-6">This will stop the running scan. Partial results may be lost.</p>
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {cancelMutation.isPending ? "Cancelling..." : "Cancel Scan"}
              </button>
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium"
              >
                Keep Running
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScanStatusPage;