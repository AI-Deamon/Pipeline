import { Clock, CheckCircle, AlertCircle, Loader2, Activity } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type ScanStage } from '../types';

interface ScanProgressBarProps {
  stages: ScanStage[];
  scanState: string;
  startedAt?: string;
  selectedStages?: string[];
}

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

const STAGE_DISPLAY_NAMES: Record<string, string> = {
  git_checkout: 'Git Checkout',
  sonar_scanner: 'Sonar Scanner',
  sonar_quality_gate: 'Quality Gate',
  npm_pip_install: 'Install Dependencies',
  dependency_check: 'Dependency Check',
  trivy_fs_scan: 'Trivy FS Scan',
  docker_build: 'Docker Build',
  docker_push: 'Docker Push',
  trivy_image_scan: 'Trivy Image Scan',
  nmap_scan: 'Nmap Scan',
  zap_scan: 'ZAP Scan',
};

function getStageStatusIcon(status: string) {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('pass') || statusLower.includes('completed') || statusLower.includes('success')) {
    return <CheckCircle className="w-4 h-4 text-green-600" />;
  } else if (statusLower.includes('fail') || statusLower.includes('error')) {
    return <AlertCircle className="w-4 h-4 text-red-600" />;
  } else if (statusLower.includes('running') || statusLower.includes('progress') || statusLower.includes('executing')) {
    return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
  }
  return <Clock className="w-4 h-4 text-slate-300" />;
}

function calculateProgress(stages: ScanStage[], relevantStages: string[]): {
  completed: number;
  running: string | null;
  percentage: number;
} {
  let completed = 0;
  let running: string | null = null;

  relevantStages.forEach(stageId => {
    const stage = stages.find(s => s.stage === stageId);
    if (!stage) return;

    const status = stage.status.toLowerCase();
    if (status.includes('pass') || status.includes('completed') || status.includes('success')) {
      completed++;
    } else if (status.includes('fail') || status.includes('error')) {
      // Failed stages are tracked but don't affect progress calculation
    } else if (status.includes('running') || status.includes('progress')) {
      running = stage.stage;
    }
  });

  const totalStages = relevantStages.length;
  const percentage = totalStages > 0 ? Math.round((completed / totalStages) * 100) : 0;

  return { completed, running, percentage };
}

function useElapsedTime(startedAt?: string, isRunning?: boolean) {
  const [elapsed, setElapsed] = useState<string>('00:00');

  useEffect(() => {
    if (!startedAt) return;

    const startTime = new Date(startedAt).getTime();
    
    const update = () => {
      const now = new Date().getTime();
      const diff = Math.max(0, now - startTime);
      
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      
      setElapsed(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };

    update();
    let interval: any;
    if (isRunning) {
      interval = setInterval(update, 1000);
    }
    
    return () => clearInterval(interval);
  }, [startedAt, isRunning]);

  return elapsed;
}

export function ScanProgressBar({ 
  stages, 
  scanState, 
  startedAt,
  selectedStages 
}: ScanProgressBarProps) {
  const isRunning = scanState === 'RUNNING' || scanState === 'QUEUED';
  const isComplete = scanState === 'COMPLETED';
  const isFailed = scanState === 'FAILED';
  
  const elapsed = useElapsedTime(startedAt, isRunning);

  const relevantStages = selectedStages && selectedStages.length > 0
    ? STAGE_ORDER.filter(s => selectedStages.includes(s))
    : STAGE_ORDER;

  const { completed, running, percentage } = calculateProgress(stages, relevantStages);

  return (
    <div className="bg-white p-8" role="region" aria-label="Scan progress">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-colors ${
            isFailed ? 'bg-red-50 text-red-600 shadow-red-100' : 
            isComplete ? 'bg-green-50 text-green-600 shadow-green-100' : 
            'bg-blue-50 text-blue-600 shadow-blue-100'
          }`} aria-hidden="true">
            {isRunning ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : isComplete ? (
              <CheckCircle className="w-6 h-6" />
            ) : isFailed ? (
              <AlertCircle className="w-6 h-6" />
            ) : (
              <Activity className="w-6 h-6" />
            )}
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-none mb-1">
              {isRunning ? 'Pipeline Executing' : isComplete ? 'Scan Finalized' : isFailed ? 'Pipeline Halted' : 'Scan Context'}
            </h3>
            <div className="flex items-center gap-2" aria-live="polite">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Status:</span>
              <span className={`text-[10px] font-black uppercase tracking-widest ${
                isFailed ? 'text-red-600' : isComplete ? 'text-green-600' : 'text-blue-600'
              }`}>
                {scanState}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
          <div className="text-center">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Elapsed</div>
            <div className="text-sm font-mono font-black text-slate-900 tracking-tighter">{elapsed}</div>
          </div>
          <div className="w-px h-8 bg-slate-200"></div>
          <div className="text-center">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Stages</div>
            <div className="text-sm font-black text-slate-900 tracking-tight">{completed}/{relevantStages.length}</div>
          </div>
        </div>
      </div>

      {/* Progress Bar Container */}
      <div className="relative mb-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Deployment Readiness</span>
          <span className={`text-sm font-black tracking-tighter ${
            isFailed ? 'text-red-600' : isComplete ? 'text-green-600' : 'text-blue-600'
          }`}>
            {percentage}%
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-4 p-1 border border-slate-200 shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden ${
              isFailed ? 'bg-red-500 shadow-lg shadow-red-200' : 
              isComplete ? 'bg-green-500 shadow-lg shadow-green-200' : 
              'bg-blue-600 shadow-lg shadow-blue-200'
            }`}
            style={{ width: `${percentage}%` }}
          >
            {isRunning && (
              <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite] skew-x-12 translate-x-[-100%]"></div>
            )}
          </div>
        </div>
      </div>

      {/* Stage Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {relevantStages.map((stageId) => {
          const stageResult = stages.find(s => s.stage === stageId);
          const status = stageResult?.status || 'PENDING';
          const isCurrentRunning = running === stageId;
          const isStageFailed = status.toLowerCase().includes('fail') || status.toLowerCase().includes('error');
          const isStagePassed = status.toLowerCase().includes('pass') || status.toLowerCase().includes('success');

          return (
            <div
              key={stageId}
              className={`group flex items-start gap-4 p-5 rounded-2xl border transition-all duration-300 ${
                isCurrentRunning ? 'bg-blue-50/50 border-blue-200 shadow-lg shadow-blue-50 ring-2 ring-blue-500/10' :
                isStagePassed ? 'bg-green-50/30 border-green-100' :
                isStageFailed ? 'bg-red-50/30 border-red-100 shadow-lg shadow-red-50' :
                'bg-slate-50/50 border-slate-100 grayscale opacity-60 hover:grayscale-0 hover:opacity-100'
              }`}
            >
              <div className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110 ${
                isCurrentRunning ? 'bg-blue-100 text-blue-600' :
                isStagePassed ? 'bg-green-100 text-green-600' :
                isStageFailed ? 'bg-red-100 text-red-600' :
                'bg-slate-200 text-slate-400'
              }`}>
                {getStageStatusIcon(status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-black text-slate-900 tracking-tight uppercase truncate">
                  {STAGE_DISPLAY_NAMES[stageId] || stageId.replace(/_/g, ' ')}
                </div>
                <div className={`text-[9px] font-black uppercase tracking-widest mt-0.5 ${
                  isCurrentRunning ? 'text-blue-600' :
                  isStagePassed ? 'text-green-600' :
                  isStageFailed ? 'text-red-600' :
                  'text-slate-400'
                }`}>
                  {status}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

