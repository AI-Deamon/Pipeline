import { Clock, CheckCircle, AlertCircle, Loader2, Activity, SkipForward } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type ScanStage } from '../types';

interface ScanProgressBarProps {
  stages: ScanStage[];
  scanState: string;
  startedAt?: string;
  finishedAt?: string;
  selectedStages?: string[];
}

const STAGE_ORDER = [
  'git_checkout',
  'sonar_scanner',
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
  } else if (statusLower.includes('skipped')) {
    return <SkipForward className="w-4 h-4 text-slate-400" />;
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

  // Guard against division by zero: ensure denominator is never zero
  // Fallback to 1 prevents NaN when selectedStages is empty array
  const totalStages = relevantStages.length || 1;
  const percentage = totalStages > 0 ? Math.round((completed / totalStages) * 100) : 0;

  return { completed, running, percentage };
}

/**
 * Formats elapsed time as H:MM:SS for long-running scans, or MM:SS for short ones.
 * Uses refs to avoid stale closure issues when timestamps change across re-renders.
 * Only starts counting when startedAt is available. Freezes at finishedAt when provided.
 */
function useElapsedTime(startedAt?: string, finishedAt?: string) {
  const [elapsed, setElapsed] = useState<string>('00:00');
  const startedAtRef = useRef<string | undefined>(startedAt);
  const finishedAtRef = useRef<string | undefined>(finishedAt);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    startedAtRef.current = startedAt;
    finishedAtRef.current = finishedAt;
  }, [startedAt, finishedAt]);

  useEffect(() => {
    // Clear any existing interval when deps change
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }

    // If scan hasn't started yet, show 00:00
    if (!startedAt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsed('00:00');
      return;
    }

    const startTime = new Date(startedAt).getTime();

    // If scan was started but timestamp is invalid, show 00:00
    if (isNaN(startTime)) {
      setElapsed('00:00');
      return;
    }

    const computeElapsed = () => {
      // If finishedAt is set, compute one final elapsed and stop
      if (finishedAtRef.current) {
        const finishTime = new Date(finishedAtRef.current).getTime();
        if (!isNaN(finishTime)) {
          const totalDiff = Math.max(0, finishTime - startTime);
          setElapsed(formatDuration(totalDiff));
        }
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = undefined;
        }
        return;
      }

      const now = Date.now();
      const diff = Math.max(0, now - startTime);
      setElapsed(formatDuration(diff));
    };

    // Compute immediately
    computeElapsed();

    // Tick every second while running (no finishedAt)
    if (!finishedAtRef.current) {
      intervalRef.current = setInterval(computeElapsed, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, [startedAt, finishedAt]);

  return elapsed;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Hook to track initialization time and detect stalled pipeline
 * Returns seconds elapsed and whether we've exceeded the 5-minute warning threshold
 */
function useInitializationTime(startedAt?: string, isRunning?: boolean, hasStages?: boolean) {
  const [seconds, setSeconds] = useState<number>(0);
  const isStalled = seconds >= 300; // 5 minutes warning threshold

  useEffect(() => {
    if (!startedAt || !isRunning || hasStages) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeconds(0);
      return;
    }

    const startTime = new Date(startedAt).getTime();

    const update = () => {
      const now = new Date().getTime();
      const diff = Math.max(0, now - startTime);
      setSeconds(Math.floor(diff / 1000));
    };

    update();
    const interval = setInterval(update, 1000);

    return () => clearInterval(interval);
  }, [startedAt, isRunning, hasStages]);

  return { seconds, isStalled };
}

type InitializingBannerProps = {
  isStalled: boolean;
  initSeconds: number;
};

function InitializingBanner({ isStalled, initSeconds }: InitializingBannerProps) {
  return (
    <div className={`mb-8 p-6 rounded-2xl border-2 transition-all ${
      isStalled
        ? 'bg-amber-50 border-amber-200 shadow-lg shadow-amber-100'
        : 'bg-blue-50 border-blue-200 shadow-lg shadow-blue-100'
    }`} role="status" aria-live="polite">
      <div className="flex items-start gap-4">
        <div className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isStalled ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
        }`}>
          {isStalled ? (
            <AlertCircle className="w-5 h-5" />
          ) : (
            <Loader2 className="w-5 h-5 animate-spin" />
          )}
        </div>
        <div className="flex-1">
          <h4 className={`text-base font-black uppercase tracking-tight mb-1 ${
            isStalled ? 'text-amber-900' : 'text-blue-900'
          }`}>
            {isStalled ? 'Scan Starting Delayed' : 'Starting Scan'}
          </h4>
          <p className={`text-sm mb-3 ${isStalled ? 'text-amber-700' : 'text-blue-700'}`}>
            {isStalled
              ? 'The scan is taking longer than expected to start. This may indicate Jenkins queue delays.'
              : 'The scan is starting. Stage data will appear shortly.'}
          </p>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono font-black uppercase tracking-widest ${
              isStalled ? 'text-amber-600' : 'text-blue-600'
            }`}>
              Initializing for: {Math.floor(initSeconds / 60)}m {initSeconds % 60}s
            </span>
            {isStalled && (
              <span className="text-xs font-black text-amber-600 uppercase tracking-widest bg-amber-100 px-2 py-0.5 rounded">
                Warning: &gt;5 min
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type ProgressHeaderProps = {
  isRunning: boolean;
  isComplete: boolean;
  isFailed: boolean;
  scanState: string;
  elapsed: string;
  completed: number;
  totalStages: number;
};

function ProgressHeaderIcon({ isRunning, isComplete, isFailed }: { isRunning: boolean; isComplete: boolean; isFailed: boolean }) {
  if (isRunning) return <Loader2 className="w-6 h-6 animate-spin" />;
  if (isComplete) return <CheckCircle className="w-6 h-6" />;
  if (isFailed) return <AlertCircle className="w-6 h-6" />;
  return <Activity className="w-6 h-6" />;
}

function getProgressHeaderClass(isFailed: boolean, isComplete: boolean): string {
  if (isFailed) return 'bg-red-50 text-red-600 shadow-red-100';
  if (isComplete) return 'bg-green-50 text-green-600 shadow-green-100';
  return 'bg-blue-50 text-blue-600 shadow-blue-100';
}

function getProgressTitle(isRunning: boolean, isComplete: boolean, isFailed: boolean): string {
  if (isRunning) return 'Scan Running';
  if (isComplete) return 'Scan Complete';
  if (isFailed) return 'Scan Failed';
  return 'Scan Ready';
}

function getStatusTextClass(isFailed: boolean, isComplete: boolean): string {
  if (isFailed) return 'text-red-600';
  if (isComplete) return 'text-green-600';
  return 'text-blue-600';
}

function ProgressHeader({ isRunning, isComplete, isFailed, scanState, elapsed, completed, totalStages }: ProgressHeaderProps) {
  const iconClass = getProgressHeaderClass(isFailed, isComplete);
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-colors ${iconClass}`} aria-hidden="true">
          <ProgressHeaderIcon isRunning={isRunning} isComplete={isComplete} isFailed={isFailed} />
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-none mb-1">
            {getProgressTitle(isRunning, isComplete, isFailed)}
          </h3>
          <div className="flex items-center gap-2" aria-live="polite">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Status:</span>
            <span className={`text-[10px] font-black uppercase tracking-widest ${getStatusTextClass(isFailed, isComplete)}`}>
              {scanState}
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-6 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
        <div className="text-center">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Scan Duration</div>
          <div className="text-sm font-mono font-black text-slate-900 tracking-tighter">{elapsed}</div>
        </div>
        <div className="w-px h-8 bg-slate-200"></div>
        <div className="text-center">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Stages</div>
          <div className="text-sm font-black text-slate-900 tracking-tight">{completed}/{totalStages}</div>
        </div>
      </div>
    </div>
  );
}

type ProgressBarSectionProps = {
  isRunning: boolean;
  isComplete: boolean;
  isFailed: boolean;
  percentage: number;
};

function getProgressBarTextClass(isFailed: boolean, isComplete: boolean): string {
  if (isFailed) return 'text-red-600';
  if (isComplete) return 'text-green-600';
  return 'text-blue-600';
}

function ProgressBarSection({ isRunning, isComplete, isFailed, percentage }: ProgressBarSectionProps) {
  return (
    <div className="relative mb-10">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Deployment Readiness</span>
        <span className={`text-sm font-black tracking-tighter ${getProgressBarTextClass(isFailed, isComplete)}`}>
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
  );
}

type StageCardProps = {
  stageId: string;
  status: string;
  isCurrentRunning: boolean;
  isStagePassed: boolean;
  isStageFailed: boolean;
};

function getCardClass(isCurrentRunning: boolean, isStagePassed: boolean, isStageFailed: boolean): string {
  if (isCurrentRunning) return 'bg-blue-50/50 border-blue-200 shadow-lg shadow-blue-50 ring-2 ring-blue-500/10';
  if (isStagePassed) return 'bg-green-50/30 border-green-100';
  if (isStageFailed) return 'bg-red-50/30 border-red-100 shadow-lg shadow-red-50';
  return 'bg-slate-50/50 border-slate-100 grayscale opacity-60 hover:grayscale-0 hover:opacity-100';
}

function getStageIconClass(isCurrentRunning: boolean, isStagePassed: boolean, isStageFailed: boolean): string {
  if (isCurrentRunning) return 'bg-blue-100 text-blue-600';
  if (isStagePassed) return 'bg-green-100 text-green-600';
  if (isStageFailed) return 'bg-red-100 text-red-600';
  return 'bg-slate-200 text-slate-400';
}

function getStageStatusClass(isCurrentRunning: boolean, isStagePassed: boolean, isStageFailed: boolean): string {
  if (isCurrentRunning) return 'text-blue-600';
  if (isStagePassed) return 'text-green-600';
  if (isStageFailed) return 'text-red-600';
  return 'text-slate-400';
}

function StageCard({ stageId, status, isCurrentRunning, isStagePassed, isStageFailed }: StageCardProps) {
  return (
    <div className={`group flex items-start gap-4 p-5 rounded-2xl border transition-all duration-300 ${getCardClass(isCurrentRunning, isStagePassed, isStageFailed)}`}>
      <div className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110 ${getStageIconClass(isCurrentRunning, isStagePassed, isStageFailed)}`}>
        {getStageStatusIcon(status)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-black text-slate-900 tracking-tight uppercase truncate">
          {STAGE_DISPLAY_NAMES[stageId] || stageId.replace(/_/g, ' ')}
        </div>
        <div className={`text-[9px] font-black uppercase tracking-widest mt-0.5 ${getStageStatusClass(isCurrentRunning, isStagePassed, isStageFailed)}`}>
          {status}
        </div>
      </div>
    </div>
  );
}

export function ScanProgressBar({
  stages,
  scanState,
  startedAt,
  finishedAt,
  selectedStages
}: ScanProgressBarProps) {
  const isRunning = scanState === 'RUNNING' || scanState === 'QUEUED';
  const isComplete = scanState === 'COMPLETED';
  const isFailed = scanState === 'FAILED';

  const elapsed = useElapsedTime(startedAt, finishedAt);

  const relevantStages = selectedStages && selectedStages.length > 0
    ? STAGE_ORDER.filter(s => selectedStages.includes(s))
    : STAGE_ORDER;

  const { completed, running, percentage } = calculateProgress(stages, relevantStages);

  // Track initialization state: show warning if pipeline running but no stages after 5 minutes
  const { seconds: initSeconds, isStalled } = useInitializationTime(startedAt, isRunning, stages.length > 0);
  const isInitializing = isRunning && stages.length === 0;

  return (
    <div className="bg-white p-8" role="region" aria-label="Scan progress">
      {isInitializing && (
        <InitializingBanner isStalled={isStalled} initSeconds={initSeconds} />
      )}
      <ProgressHeader
        isRunning={isRunning}
        isComplete={isComplete}
        isFailed={isFailed}
        scanState={scanState}
        elapsed={elapsed}
        completed={completed}
        totalStages={relevantStages.length}
      />
      <ProgressBarSection
        isRunning={isRunning}
        isComplete={isComplete}
        isFailed={isFailed}
        percentage={percentage}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {relevantStages.map((stageId) => {
          const stageResult = stages.find(s => s.stage === stageId);
          const status = stageResult?.status || 'PENDING';
          return (
            <StageCard
              key={stageId}
              stageId={stageId}
              status={status}
              isCurrentRunning={running === stageId}
              isStagePassed={status.toLowerCase().includes('pass') || status.toLowerCase().includes('success')}
              isStageFailed={status.toLowerCase().includes('fail') || status.toLowerCase().includes('error')}
            />
          );
        })}
      </div>
    </div>
  );
}

