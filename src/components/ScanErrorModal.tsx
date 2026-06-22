import { ExternalLink, Copy, AlertTriangle, Terminal, Lightbulb } from 'lucide-react';
import { Modal } from './ui/Modal';

interface ScanErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: {
    message: string;
    error_type?: string;
    jenkins_console_url?: string;
  } | null;
}

export function ScanErrorModal({ isOpen, onClose, error }: ScanErrorModalProps) {
  if (!isOpen || !error) return null;

  const getErrorIcon = () => {
    switch (error.error_type) {
      case 'PIPELINE_ERROR':
      case 'TIMEOUT':
        return <AlertTriangle className="w-7 h-7 text-amber-500" />;
      case 'USER_CANCELLED':
        return <span className="text-blue-500 text-2xl font-bold">✕</span>;
      default:
        return <AlertTriangle className="w-7 h-7 text-rose-500" />;
    }
  };

  const getErrorTitle = () => {
    switch (error.error_type) {
      case 'PIPELINE_ERROR': return 'Scan Failed';
      case 'TIMEOUT': return 'Scan Timeout';
      case 'USER_CANCELLED': return 'Scan Cancelled';
      default: return 'Scan Error';
    }
  };

  const getSuggestion = () => {
    switch (error.error_type) {
      case 'PIPELINE_ERROR':
        return 'Check the Jenkinsfile syntax and repository permissions.';
      case 'TIMEOUT':
        return 'The scan exceeded the time limit. Check for large dependencies or slow network.';
      case 'USER_CANCELLED':
        return 'The scan was cancelled. You can start a new scan from the project page.';
      default:
        return 'An error occurred during the scan. Check the logs below.';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={getErrorTitle()} size="md">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center shrink-0">
          {getErrorIcon()}
        </div>
        <div>
          <p className="text-xs text-slate-500">Diagnostic Report</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-amber-800 mb-1">Recommended Resolution</h4>
              <p className="text-sm text-amber-700">{getSuggestion()}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-400">Error Details</span>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(error.message)}
              className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
          </div>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
            {error.message}
          </pre>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
            <div className="text-xs text-slate-400 mb-1">Error Type</div>
            <div className="text-sm font-medium text-slate-700">{error.error_type || 'UNKNOWN'}</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
            <div className="text-xs text-slate-400 mb-1">Timestamp</div>
            <div className="text-sm font-medium text-slate-700">{new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors"
        >
          Dismiss
        </button>
        {error.jenkins_console_url && (
          <a
            href={error.jenkins_console_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View Logs
          </a>
        )}
      </div>
    </Modal>
  );
}
