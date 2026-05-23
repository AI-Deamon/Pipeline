import { X, ExternalLink, Copy, AlertTriangle, Terminal, Lightbulb } from 'lucide-react';
import { useEffect, useRef } from 'react';

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
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'Tab' && modalRef.current) {
          const focusableElements = modalRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          const firstElement = focusableElements[0] as HTMLElement;
          const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

          if (e.shiftKey && document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen || !error) return null;

  const getErrorIcon = () => {
    switch (error.error_type) {
      case 'PIPELINE_ERROR':
      case 'TIMEOUT':
        return <AlertTriangle className="w-7 h-7 text-amber-500" />;
      case 'USER_CANCELLED':
        return <X className="w-7 h-7 text-blue-500" />;
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
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-modal-title"
    >
      <div 
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" 
        onClick={onClose}
      ></div>
      
      <div 
        ref={modalRef}
        className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-xl relative z-10"
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center">
              {getErrorIcon()}
            </div>
            <div>
              <h3 id="error-modal-title" className="text-lg font-semibold text-slate-900">
                {getErrorTitle()}
              </h3>
              <p className="text-xs text-slate-500">Diagnostic Report</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-amber-600 mt-0.5" />
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

          <div className="grid grid-cols-2 gap-4">
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

        <div className="flex gap-3 p-6 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-white rounded-lg font-medium text-sm transition-colors"
          >
            Dismiss
          </button>

          {error.jenkins_console_url && (
            <a
              href={error.jenkins_console_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View Logs
            </a>
          )}
        </div>
      </div>
    </div>
  );
}