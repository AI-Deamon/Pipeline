import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2, WifiOff, RefreshCw } from 'lucide-react';

type EmptyStateProps = {
  variant?: 'empty' | 'loading' | 'error' | 'offline';
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  icon?: ReactNode;
};

export default function EmptyState({ variant = 'empty', title, message, action, icon }: EmptyStateProps) {
  let defaultIcon: ReactNode;
  let iconClass = 'text-slate-300';
  switch (variant) {
    case 'loading':
      defaultIcon = <Loader2 size={48} className="animate-spin text-blue-400" />;
      iconClass = 'text-blue-400';
      break;
    case 'error':
      defaultIcon = <AlertCircle size={48} className="text-red-400" />;
      iconClass = 'text-red-400';
      break;
    case 'offline':
      defaultIcon = <WifiOff size={48} className="text-amber-500" />;
      iconClass = 'text-amber-500';
      break;
    case 'empty':
    default:
      defaultIcon = <Inbox size={48} />;
      break;
  }

  return (
    <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center">
      <div className={`mx-auto mb-4 ${iconClass}`}>{icon ?? defaultIcon}</div>
      <h3 className="text-lg font-semibold text-slate-700 mb-1">{title}</h3>
      {message && <p className="text-sm text-slate-500 mb-4">{message}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          {variant === 'offline' && <RefreshCw size={14} />}
          {action.label}
        </button>
      )}
    </div>
  );
}
