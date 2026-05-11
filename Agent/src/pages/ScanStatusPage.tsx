import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle, Clock, ExternalLink, Shield, Activity, Calendar, User, Zap, Lock, ChevronDown, ChevronUp, X, AlertTriangle, Terminal, Search, Loader2, Wifi, WifiOff } from 'lucide-react';
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
  const { addToast } = useToast();
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

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
    refetchInterval: (query) => {
      const data = query.state.data as any;
      if (data?.scan && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(data.scan.state)) {
        return false;
      }
      return 3000;
    },
    enabled: !!scanId,
  });

  const scan = scanData?.scan;
  const results = scanData?.stages || [];

  // Define the master stage list
  const STAGE_ORDER = [
    'git_checkout',
    'sonar_scanner',
    'sonar_quality_gate',
    'npm_pip_install',
    'dependency_check',
    'trivy_fs_scan',
    'docker_build',
    'docker_push',
    'trivy_image_scan',
    'nmap_scan',
    'zap_scan',
  ];

  // Merge actual results with planned stages to show PENDING ones
  const stages = useMemo(() => {
    if (!scan) return results;
    
    const relevantStageIds = scan.selected_stages && scan.selected_stages.length > 0
      ? STAGE_ORDER.filter(id => scan.selected_stages.includes(id))
      : STAGE_ORDER;
      
    // Start with actual results
    const merged = [...results];
    
    // Add pending stages that aren't in results yet
    relevantStageIds.forEach(id => {
      if (!merged.find(r => r.stage === id)) {
        merged.push({
          stage: id,
          status: 'PENDING',
          summary: 'Waiting for pipeline execution to reach this stage...'
        });
      }
    });
    
    // Sort by STAGE_ORDER
    return merged.sort((a, b) => {
      const idxA = STAGE_ORDER.indexOf(a.stage);
      const idxB = STAGE_ORDER.indexOf(b.stage);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [scan, results]);

  useEffect(() => {
    if (scan?.state === 'FAILED' && (scan as any)?.error) {
      setShowErrorModal(true);
    }
  }, [scan?.state]);

  const resetMutation = useScanReset();
  const cancelMutation = useScanCancel();

  // Track last updated time for display
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const { connected: wsConnected, connecting: wsConnecting } = useScanWebSocket(scanId, undefined, {
    onMessage: (message) => {
      console.log('Scan real-time update received:', message);
      refetch();
      setLastUpdated(new Date());
    }
  });

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
          message: 'Pipeline execution has been terminated',
        });
        refetch();
        // Navigate back to project after 2 seconds
        setTimeout(() => {
          navigate(`/projects/${scan?.project_id}`);
        }, 2000);
      },
      onError: (error) => {
        addToast({
          type: 'error',
          title: 'Cancel Failed',
          message: error.message || 'Failed to cancel scan. Try stopping it from Jenkins directly.',
        });
        setShowCancelConfirm(false);
      }
    });
  };

  if (isLoading && !scan) return <PageSkeleton type="scan" />;

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-32 px-4">
      {/* Dynamic Header */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate(`/projects/${scan?.project_id}`)}
            className="p-4 bg-white border border-slate-200 text-slate-400 hover:text-slate-900 rounded-[1.5rem] transition-all active:scale-90 shadow-sm group"
            aria-label="Return to project control plane"
          >
            <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
          </button>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em]">Pipeline Execution Trace</span>
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter leading-none uppercase">Security Scan Trace</h1>
            <div className="flex items-center gap-3 text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-widest font-mono bg-slate-100 px-2 py-0.5 rounded">Execution: {scanId?.split('-')[0]}</span>
              <div className="w-1 h-1 bg-slate-200 rounded-full"></div>
              <span className="text-[10px] font-bold uppercase tracking-widest italic">Live Telemetry Link</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {(scan?.state === 'RUNNING' || scan?.state === 'QUEUED' || scan?.state === 'CREATED') ? (
            <button
              onClick={() => setShowCancelConfirm(true)}
              disabled={cancelMutation.isPending}
              className="px-8 h-14 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 shadow-xl shadow-red-900/5 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <X className="w-4 h-4" />
                  Terminate Execution
                </>
              )}
            </button>
          ) : scan?.state === 'FAILED' ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              disabled={resetMutation.isPending}
              className="px-8 h-14 bg-blue-600 text-white hover:bg-blue-700 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 shadow-2xl shadow-blue-200 flex items-center gap-3 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${resetMutation.isPending ? 'animate-spin' : ''}`} />
              Reset & Re-trigger
            </button>
          ) : null}
          
          <button
            onClick={() => refetch()}
            className="p-4 bg-white border border-slate-200 text-slate-400 hover:text-slate-900 rounded-2xl transition-all active:scale-95 shadow-sm"
            title="Synchronize data"
            aria-label="Force refresh scan data"
          >
            <RefreshCw className={`w-5 h-5 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
            Last Updated: {lastUpdated.toLocaleTimeString()}
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
            wsConnected 
              ? 'bg-green-50 border-green-200 text-green-600' 
              : wsConnecting 
              ? 'bg-amber-50 border-amber-200 text-amber-600' 
              : 'bg-slate-50 border-slate-200 text-slate-400'
          }`} title={wsConnected ? 'Live connection active' : wsConnecting ? 'Reconnecting...' : 'Connection lost'}>
            {wsConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span className="text-[8px] font-black uppercase tracking-widest">Live</span>
              </>
            ) : wsConnecting ? (
              <>
                <WifiOff className="w-3.5 h-3.5 animate-pulse" />
                <span className="text-[8px] font-black uppercase tracking-widest">Reconnecting</span>
              </>
            ) : (
              <button 
                onClick={() => window.location.reload()} 
                className="flex items-center gap-2 hover:text-slate-900 transition-colors"
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span className="text-[8px] font-black uppercase tracking-widest">Reconnect</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        {/* Progress & Detailed Trace */}
        <div className="lg:col-span-8 space-y-12">
          {/* Main Progress Visualization */}
          <section className="bg-white border border-slate-200 rounded-[3rem] shadow-2xl shadow-slate-200/40 overflow-hidden">
            <ScanProgressBar 
              stages={stages} 
              scanState={scan?.state || 'UNKNOWN'} 
              startedAt={scan?.started_at}
              selectedStages={scan?.selected_stages}
            />
          </section>

          {/* Failure Intelligence - Prominent when failed */}
          {scan && scan.state === 'FAILED' && (
            <section className="bg-red-900 rounded-[3rem] p-10 text-white shadow-2xl shadow-red-200 animate-in slide-in-from-bottom-10 duration-700">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 bg-white/10 rounded-[2rem] flex items-center justify-center border border-white/20 shadow-inner">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black tracking-tight uppercase leading-none mb-2">Execution Halted</h3>
                    <p className="text-red-200 text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Critical Perimeter Breach During Scan</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowErrorModal(true)}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/20 active:scale-95"
                >
                  Analyze Trace
                </button>
              </div>
              
              {(scan as any)?.error && (
                <div className="space-y-8">
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-8 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 blur-[60px] rounded-full translate-x-10 -translate-y-10"></div>
                    <div className="flex items-center justify-between mb-4 relative z-10">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-red-300" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-red-300">Failure Context</span>
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest bg-red-800/50 px-3 py-1 rounded-full border border-red-700/50">{(scan as any).error.error_type}</span>
                    </div>
                    <p className="text-lg font-bold leading-relaxed relative z-10 italic">"{(scan as any).error.message || 'Engine connection lost without diagnostic trace.'}"</p>
                  </div>

                  <div className="flex flex-col md:flex-row gap-4">
                    {(scan as any).error.jenkins_console_url && (
                      <a 
                        href={(scan as any).error.jenkins_console_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 bg-white text-red-950 font-black uppercase tracking-widest text-[10px] h-16 rounded-[1.5rem] flex items-center justify-center gap-3 hover:bg-red-50 transition-all active:scale-95 shadow-2xl shadow-black/20"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Live Cluster Logs
                      </a>
                    )}
                    <button
                      onClick={() => setShowResetConfirm(true)}
                      className="flex-1 bg-red-700 hover:bg-red-600 text-white font-black uppercase tracking-widest text-[10px] h-16 rounded-[1.5rem] flex items-center justify-center gap-3 transition-all active:scale-95 shadow-2xl shadow-black/20 border border-red-600/50"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Recover & Re-trigger
                    </button>
                  </div>

                  <ErrorSuggestions 
                    errorType={(scan as any).error.error_type} 
                    errorMessage={(scan as any).error.message}
                    stage={stages.find(s => s.status.toLowerCase().includes('fail'))?.stage}
                  />
                </div>
              )}
            </section>
          )}

          {/* Sequential Stage Trace */}
          <section className="bg-white border border-slate-200 rounded-[3rem] shadow-2xl shadow-slate-200/40 overflow-hidden">
            <div className="px-12 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
              <h3 className="font-black text-slate-900 tracking-tight uppercase text-xs flex items-center gap-4">
                <div className="w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center">
                  <Zap className="w-4 h-4 text-blue-400" />
                </div>
                Sequential Execution History
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stages.length} Stages Tracked</span>
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
              </div>
            </div>
            
            <div className="divide-y divide-slate-50">
              {stages.length === 0 ? (
                scan?.state === 'FAILED' ? (
                  // Error state - scan failed before stages could execute
                  <div className="p-32 text-center flex flex-col items-center">
                    <div className="w-24 h-24 bg-red-50 rounded-[2.5rem] flex items-center justify-center mb-8 border-2 border-dashed border-red-200 relative group">
                      <div className="absolute inset-0 bg-red-200/30 rounded-[2.5rem] animate-ping duration-[3000ms]"></div>
                      <AlertCircle className="w-12 h-12 text-red-400 relative z-10" />
                    </div>
                    <p className="text-red-600 font-black uppercase tracking-[0.3em] text-[10px] mb-2">Scan Failed Before Execution</p>
                    <p className="text-slate-500 text-xs font-medium italic max-w-xs leading-relaxed mb-6">The pipeline encountered an error before any stages could execute. Review the error details below.</p>
                    <button
                      onClick={() => setShowErrorModal(true)}
                      className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-red-200"
                    >
                      View Error Details
                    </button>
                  </div>
                ) : scan?.state === 'COMPLETED' ? (
                  // Completed with no stages - unusual but should be shown
                  <div className="p-32 text-center flex flex-col items-center">
                    <div className="w-24 h-24 bg-amber-50 rounded-[2.5rem] flex items-center justify-center mb-8 border-2 border-dashed border-amber-200">
                      <AlertCircle className="w-12 h-12 text-amber-400" />
                    </div>
                    <p className="text-amber-600 font-black uppercase tracking-[0.3em] text-[10px] mb-2">No Stage Results</p>
                    <p className="text-slate-500 text-xs font-medium italic max-w-xs leading-relaxed">Scan completed but no stage results were recorded. This may indicate a configuration issue.</p>
                  </div>
                ) : scan?.state === 'CANCELLED' ? (
                  // Cancelled state
                  <div className="p-32 text-center flex flex-col items-center">
                    <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mb-8 border-2 border-dashed border-slate-200">
                      <X className="w-12 h-12 text-slate-400" />
                    </div>
                    <p className="text-slate-600 font-black uppercase tracking-[0.3em] text-[10px] mb-2">Scan Cancelled</p>
                    <p className="text-slate-500 text-xs font-medium italic max-w-xs leading-relaxed">The scan was manually cancelled before completion.</p>
                  </div>
                ) : (
                  // Running/Queued state - still initializing
                  <div className="p-32 text-center flex flex-col items-center">
                    <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mb-8 border-2 border-dashed border-slate-200 relative group">
                      <div className="absolute inset-0 bg-blue-600/5 rounded-[2.5rem] animate-ping duration-[3000ms]"></div>
                      <Clock className="w-12 h-12 text-slate-300 relative z-10 group-hover:scale-110 transition-transform" />
                    </div>
                    <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-[10px] mb-2">Handshaking with Scan Engine</p>
                    <p className="text-slate-300 text-xs font-medium italic max-w-xs leading-relaxed">Establishing cryptographically secure link with the remote cluster...</p>
                  </div>
                )
              ) : (
                stages.map((stage, idx) => {
                  const isExpanded = expandedStages[stage.stage];
                  const statusLower = stage.status.toLowerCase();
                  const isFailed = statusLower.includes('fail') || statusLower.includes('error');
                  const isSuccess = statusLower.includes('pass') || statusLower.includes('success') || statusLower.includes('complete');
                  const isPending = statusLower === 'pending';
                  
                  return (
                    <div key={idx} className={`transition-all duration-500 ${isExpanded ? 'bg-slate-50/80 shadow-inner' : 'hover:bg-slate-50/40'}`}>
                      <button 
                        onClick={() => toggleStage(stage.stage)}
                        className="w-full px-12 py-8 flex items-center justify-between group"
                        aria-expanded={isExpanded}
                      >
                        <div className="flex items-center gap-8 min-w-0">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 border transition-all duration-500 ${
                            isSuccess ? 'bg-green-50 text-green-600 border-green-100 shadow-xl shadow-green-900/5' :
                            isFailed ? 'bg-red-50 text-red-600 border-red-100 shadow-xl shadow-red-900/5' :
                            isPending ? 'bg-slate-50 text-slate-400 border-slate-100' :
                            'bg-blue-50 text-blue-600 border-blue-100 animate-pulse'
                          }`}>
                            {isSuccess ? <CheckCircle className="w-7 h-7" /> : 
                             isFailed ? <AlertCircle className="w-7 h-7" /> : 
                             isPending ? <Clock className="w-7 h-7" /> :
                             <Activity className="w-7 h-7" />}
                          </div>
                          <div className="text-left min-w-0 space-y-1">
                            <div className="font-black text-slate-900 tracking-tight truncate group-hover:text-blue-600 transition-colors uppercase text-sm">
                              {stage.stage.replace(/_/g, ' ')}
                            </div>
                            <div className={`text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 ${
                              isSuccess ? 'text-green-600' : isFailed ? 'text-red-600' : isPending ? 'text-slate-400' : 'text-blue-600'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full bg-current ${isPending ? 'opacity-20' : 'opacity-50'}`}></span>
                              {stage.status}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-8">
                          {stage.summary && <span className="hidden xl:block text-xs font-bold text-slate-400 truncate max-w-[250px] italic opacity-60">"{stage.summary}"</span>}
                          <div className={`p-3 rounded-xl transition-all duration-300 ${isExpanded ? 'bg-slate-200 text-slate-900 scale-110 shadow-lg' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </div>
                        </div>
                      </button>
                      
                      {isExpanded && (
                        <div className="px-12 pb-12 pt-2 animate-in slide-in-from-top-4 duration-500">
                          <div className="bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-80 h-80 bg-slate-50/50 blur-[80px] rounded-full translate-x-20 -translate-y-20"></div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 relative z-10">
                              <div className="space-y-8">
                                <div className="space-y-4">
                                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
                                    <Search className="w-3.5 h-3.5" />
                                    Diagnostic Summary
                                  </h5>
                                  <p className="text-md font-bold text-slate-700 leading-relaxed italic border-l-4 border-slate-100 pl-6 py-2">
                                    "{stage.summary || 'Engine protocol established. No detailed trace generated for this stage.'}"
                                  </p>
                                </div>
                                {stage.artifact_url && (
                                  <a 
                                    href={stage.artifact_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 hover:text-white hover:bg-blue-600 bg-blue-50 px-8 py-4 rounded-2xl transition-all border border-blue-100 shadow-xl shadow-blue-900/5 active:scale-95"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                    Analyze Artifacts
                                  </a>
                                )}
                              </div>
                              <div className="bg-slate-50/80 backdrop-blur-xl rounded-[2rem] p-8 border border-slate-100 shadow-inner space-y-8">
                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cluster Metrics</h5>
                                <div className="space-y-6">
                                  <div className="flex justify-between items-center group/metric">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover/metric:text-blue-500 transition-colors">Timestamp</span>
                                    <span className="text-xs font-mono font-black text-slate-900 tracking-tighter bg-white px-3 py-1.5 rounded-xl border border-slate-100 shadow-sm transition-all group-hover/metric:scale-105">{(stage as any).timestamp || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between items-center group/metric">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover/metric:text-blue-500 transition-colors">Status Code</span>
                                    <span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border shadow-sm transition-all group-hover/metric:scale-105 ${isSuccess ? 'bg-green-50 text-green-700 border-green-100' : isFailed ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                                      {stage.status.toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center group/metric">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover/metric:text-blue-500 transition-colors">Thread ID</span>
                                    <span className="text-[10px] font-mono font-bold text-slate-400 bg-white px-3 py-1 rounded-lg border border-slate-100">{(scanId?.split('-')[0] || 'X').toUpperCase()}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* Intelligence Sidebar */}
        <aside className="lg:col-span-4 space-y-12">
          <section className="bg-white border border-slate-200 rounded-[3rem] shadow-2xl shadow-slate-200/40 p-10 sticky top-8 space-y-10 group">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-4">
              <div className="w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Shield className="w-4 h-4 text-blue-400" />
              </div>
              Perimeter Intelligence
            </h3>
            
            <div className="space-y-10">
              <div className="flex items-start gap-6">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center flex-shrink-0 text-slate-400 border border-slate-100 shadow-inner group-hover:text-blue-500 transition-colors">
                  <Activity className="w-7 h-7" />
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Vector State</div>
                  <div className={`text-xs font-black px-5 py-2 rounded-full uppercase tracking-widest inline-flex items-center gap-3 border shadow-sm ${
                    scan?.state === 'COMPLETED' ? 'bg-green-50 text-green-600 border-green-100' :
                    scan?.state === 'FAILED' ? 'bg-red-50 text-red-600 border-red-100' :
                    'bg-blue-50 text-blue-600 border-blue-100'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      scan?.state === 'COMPLETED' ? 'bg-green-500' :
                      scan?.state === 'FAILED' ? 'bg-red-500' :
                      'bg-blue-500 animate-pulse'
                    }`}></div>
                    {scan?.state}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-6">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center flex-shrink-0 text-slate-400 border border-slate-100 shadow-inner group-hover:text-blue-500 transition-colors">
                  <Calendar className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Temporal Trigger</div>
                  <div className="text-md font-black text-slate-900 tracking-tight">
                    {scan?.created_at ? new Date(scan.created_at).toLocaleString() : 'N/A'}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-6">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center flex-shrink-0 text-slate-400 border border-slate-100 shadow-inner group-hover:text-blue-500 transition-colors">
                  <User className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Initiating Operator</div>
                  <div className="text-md font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    {scan?.scan_mode} Priority
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-6">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center flex-shrink-0 text-slate-400 border border-slate-100 shadow-inner group-hover:text-blue-500 transition-colors">
                  <Zap className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Engine Delta Attempts</div>
                  <div className={`text-md font-black tracking-tight ${scan?.retry_count && parseInt(scan.retry_count as any) > 3 ? 'text-red-600' : 'text-slate-900'}`}>
                    {scan?.retry_count || 0} ATTEMPTS LOGGED
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-12 pt-10 border-t border-slate-100">
              <div className="bg-slate-900 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-transparent opacity-50"></div>
                <div className="flex items-center gap-3 mb-6">
                  <Lock className="w-4 h-4 text-blue-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cluster Context</span>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Build Sequence</span>
                    <span className="text-xs font-mono font-black text-blue-400 bg-blue-900/50 px-3 py-1 rounded-lg border border-blue-800">#{scan?.jenkins_build_number || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Queue Reference</span>
                    <span className="text-xs font-mono font-bold text-slate-400 bg-white/5 px-3 py-1 rounded-lg truncate max-w-[120px]">{scan?.jenkins_queue_id || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* Confirmation Modals */}
      <ScanErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        error={(scan as any)?.error || null}
        onRetry={() => setShowResetConfirm(true)}
        isRetrying={resetMutation.isPending}
      />

      {showResetConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-500" onClick={() => setShowResetConfirm(false)}></div>
          <div className="bg-white rounded-[3.5rem] max-w-xl w-full p-12 shadow-2xl relative z-10 animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-[2.5rem] flex items-center justify-center mb-10 shadow-inner relative ring-8 ring-blue-50/50">
              <div className="absolute inset-0 bg-blue-100 rounded-[2.5rem] animate-ping opacity-20"></div>
              <RefreshCw className="w-12 h-12 relative z-10" />
            </div>
            <h3 className="text-4xl font-black text-slate-900 tracking-tighter leading-none mb-6 uppercase">Reset Scan<br/>Execution?</h3>
            <p className="text-slate-500 font-medium leading-relaxed mb-12 italic px-4">
              This action will clear the current execution trace and allow you to re-initialize the pipeline. Existing telemetry will be archived.
            </p>
            <div className="flex flex-col w-full gap-4">
              <button
                onClick={handleReset}
                disabled={resetMutation.isPending}
                className="w-full btn-primary h-20 uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-4"
              >
                {resetMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Resetting Cluster...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    Confirm Reset & Retry
                  </>
                )}
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="w-full btn-secondary h-16 uppercase tracking-[0.2em] text-[10px]"
              >
                Abort Action
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-500" onClick={() => setShowCancelConfirm(false)}></div>
          <div className="bg-white rounded-[3.5rem] max-w-xl w-full p-12 shadow-2xl relative z-10 animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-red-50 text-red-600 rounded-[2.5rem] flex items-center justify-center mb-10 shadow-inner relative ring-8 ring-red-50/50">
              <div className="absolute inset-0 bg-red-100 rounded-[2.5rem] animate-ping opacity-20"></div>
              <X className="w-12 h-12 relative z-10" />
            </div>
            <h3 className="text-4xl font-black text-slate-900 tracking-tighter leading-none mb-6 uppercase">Terminate<br/>Execution?</h3>
            <p className="text-slate-500 font-medium leading-relaxed mb-12 italic px-4">
              This action will immediately stop the running pipeline. All in-progress stages will be aborted and partial results may be lost.
            </p>
            <div className="flex flex-col w-full gap-4">
              <button
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
                className="w-full h-20 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-4 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <X className="w-5 h-5" />
                    Confirm Termination
                  </>
                )}
              </button>
              <button
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelMutation.isPending}
                className="w-full btn-secondary h-16 uppercase tracking-[0.2em] text-[10px] disabled:opacity-50"
              >
                Abort Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScanStatusPage;
