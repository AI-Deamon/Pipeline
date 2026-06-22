import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorDisplayProps {
  message: string;
  code?: string;
  onRetry?: () => void;
}

export function ErrorDisplay({ message, code, onRetry }: ErrorDisplayProps) {
  return (
    <div role="alert" className="bg-rose-50 border border-rose-200 rounded-xl p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-rose-900">Something went wrong</h3>
          <p className="text-sm text-rose-700 mt-1">{message}</p>
          {code && (
            <p className="text-xs text-rose-500 mt-2 font-mono">
              Error code: {code} — share this with support if the issue persists
            </p>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
