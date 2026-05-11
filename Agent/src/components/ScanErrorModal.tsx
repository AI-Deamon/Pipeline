import { X, ExternalLink, Copy, AlertTriangle, Terminal, Lightbulb, RefreshCw, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface ScanErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: {
    message: string;
    error_type?: string;
    jenkins_console_url?: string;
  } | null;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ScanErrorModal({ isOpen, onClose, error, onRetry, isRetrying = false }: ScanErrorModalProps) {
  const [copied, setCopied] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap and ESC listener
  useEffect(() => {
    if (isOpen) {
      // Focus the close button or the modal itself when opened
      setTimeout(() => closeButtonRef.current?.focus(), 100);
      
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

  const handleCopy = async () => {
    await navigator.clipboard.writeText(error.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getErrorIcon = () => {
    switch (error.error_type) {
      case 'PIPELINE_ERROR':
      case 'TIMEOUT':
        return <AlertTriangle className="w-7 h-7 text-amber-500" />;
      case 'USER_CANCELLED':
        return <X className="w-7 h-7 text-blue-500" />;
      default:
        return <AlertTriangle className="w-7 h-7 text-red-500" />;
    }
  };

  const getErrorTitle = () => {
    switch (error.error_type) {
      case 'PIPELINE_ERROR': return 'Pipeline Execution Halted';
      case 'TIMEOUT': return 'Engine Timeout Detected';
      case 'USER_CANCELLED': return 'Operation Aborted';
      default: return 'Critical Scan Failure';
    }
  };

  const getSuggestion = () => {
    switch (error.error_type) {
      case 'PIPELINE_ERROR':
        return 'Verify the Jenkinsfile syntax and repository permissions. The pipeline script encountered an unrecoverable error during execution.';
      case 'TIMEOUT':
        return 'The execution exceeded the allotted security window. Check for large dependency trees or slow network connectivity in the target environment.';
      case 'USER_CANCELLED':
        return 'The scan was manually terminated by an operator. You may re-trigger the pipeline from the project control plane.';
      default:
        return 'Our engine detected an anomaly during the scan. Review the logs below and ensure all project parameters are correctly configured.';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-modal-title"
    >
      <div 
        className="absolute inset-0 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300" 
        onClick={onClose}
      ></div>
      
      <div 
        ref={modalRef}
        className="bg-white rounded-[2.5rem] max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl relative z-10 animate-in zoom-in-95 duration-300 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-xl shadow-slate-200 border border-slate-100">
              {getErrorIcon()}
            </div>
            <div>
              <h3 id="error-modal-title" className="text-xl font-black text-slate-900 tracking-tight uppercase leading-none mb-1.5">
                {getErrorTitle()}
              </h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Diagnostic Intelligence Report</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-3 text-slate-400 hover:text-slate-900 hover:bg-white hover:shadow-md rounded-xl transition-all active:scale-90"
            aria-label="Close diagnostic report"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 overflow-y-auto">
          {/* Actionable Suggestion */}
          <div className="bg-blue-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-100 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl rounded-full translate-x-10 -translate-y-10 group-hover:scale-150 transition-transform duration-1000"></div>
            <div className="flex items-start gap-4 relative z-10">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 border border-white/30 backdrop-blur-sm">
                <Lightbulb className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest mb-2 opacity-90">Recommended Resolution</h4>
                <p className="text-sm font-bold leading-relaxed">{getSuggestion()}</p>
              </div>
            </div>
          </div>

          {/* Error Message Trace */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <Terminal className="w-3.5 h-3.5" />
                Raw Execution Trace
              </label>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 text-[10px] font-black text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100"
              >
                {copied ? (
                  <>
                    <X className="w-3 h-3" />
                    Copied to Clipboard
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy Trace
                  </>
                )}
              </button>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-inner group relative">
              <div className="absolute top-4 right-4 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <pre className="text-xs text-blue-400/90 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">
                {error.message}
              </pre>
            </div>
          </div>

          {/* Contextual Data */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Error Type</div>
              <div className="text-xs font-bold text-slate-700">{error.error_type || 'UNKNOWN_ANOMALY'}</div>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Timestamp</div>
              <div className="text-xs font-bold text-slate-700">{new Date().toLocaleTimeString()} UTC</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 p-8 border-t border-slate-100 bg-slate-50/30">
          <button
            onClick={onClose}
            disabled={isRetrying}
            className="flex-1 btn-secondary h-14 uppercase tracking-widest text-[10px] disabled:opacity-50"
          >
            Dismiss Report
          </button>
          {onRetry && (
            <button
              onClick={() => {
                onRetry();
                onClose();
              }}
              disabled={isRetrying}
              className="flex-1 btn-primary h-14 flex items-center justify-center gap-3 uppercase tracking-widest text-[10px] disabled:opacity-50"
            >
              {isRetrying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Reset & Retry
                </>
              )}
            </button>
          )}
          {error.jenkins_console_url && (
            <a
              href={error.jenkins_console_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 btn-primary h-14 flex items-center justify-center gap-3 uppercase tracking-widest text-[10px]"
            >
              <ExternalLink className="w-4 h-4" />
              Analyze Live Logs
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

