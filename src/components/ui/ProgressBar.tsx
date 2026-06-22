interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  estimatedTime?: string;
  showPercentage?: boolean;
}

export function ProgressBar({ value, max = 100, label, estimatedTime, showPercentage = true }: ProgressBarProps) {
  const percentage = Math.min(Math.round((value / max) * 100), 100);

  return (
    <div className="w-full">
      {(label || estimatedTime) && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-slate-700">{label}</span>
          <div className="flex items-center gap-2">
            {estimatedTime && (
              <span className="text-xs text-slate-500">{estimatedTime}</span>
            )}
            {showPercentage && (
              <span className="text-xs font-medium text-slate-600">{percentage}%</span>
            )}
          </div>
        </div>
      )}
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  );
}
