import { useEffect, type ReactNode } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  headerContent?: ReactNode;
  footerContent?: ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  position?: string;
}

export function SidePanel({
  isOpen,
  onClose,
  title,
  children,
  headerContent,
  footerContent,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  position,
}: SidePanelProps) {
  const { ref: focusTrapRef } = useFocusTrap({ onClose });

  useEffect(() => {
    if (!isOpen) return;
    const handleArrows = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'ArrowLeft' && hasPrev) onPrev?.();
      if (e.key === 'ArrowRight' && hasNext) onNext?.();
    };
    document.addEventListener('keydown', handleArrows);
    return () => document.removeEventListener('keydown', handleArrows);
  }, [isOpen, hasPrev, hasNext, onPrev, onNext]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="side-panel-title">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] animate-[side-panel-fade_200ms_ease-out]"
        onClick={onClose}
      />
      <div
        ref={focusTrapRef}
        className="absolute right-0 top-0 h-full w-full sm:w-[440px] lg:w-[500px] bg-white shadow-2xl flex flex-col animate-[side-panel-slide-in_200ms_ease-out]"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 id="side-panel-title" className="text-base font-semibold text-slate-900 truncate">
              {title}
            </h2>
            {headerContent}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(onPrev || onNext) && (
              <div className="flex items-center gap-0.5 mr-1.5 border border-slate-200 rounded-lg overflow-hidden">
                <button
                  onClick={onPrev}
                  disabled={!hasPrev}
                  aria-label="Previous finding"
                  title="Previous (←)"
                  className="p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {position && (
                  <span className="tabular-nums px-1.5 text-xs text-slate-500 border-x border-slate-200">
                    {position}
                  </span>
                )}
                <button
                  onClick={onNext}
                  disabled={!hasNext}
                  aria-label="Next finding"
                  title="Next (→)"
                  className="p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Close panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footerContent && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0">{footerContent}</div>
        )}
      </div>
    </div>
  );
}
