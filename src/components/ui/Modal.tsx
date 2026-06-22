import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  showClose?: boolean;
  headerContent?: ReactNode;
  footerContent?: ReactNode;
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showClose = true,
  headerContent,
  footerContent,
}: ModalProps) {
  const { ref: focusTrapRef } = useFocusTrap({ onClose });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      ref={focusTrapRef}
    >
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`bg-white rounded-2xl ${sizeClasses[size]} w-full max-h-[90vh] overflow-hidden shadow-xl relative z-10 flex flex-col`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <h2 id="modal-title" className="text-lg font-semibold text-slate-900 truncate">
              {title}
            </h2>
            {headerContent}
          </div>
          {showClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
        {footerContent && (
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50">
            {footerContent}
          </div>
        )}
      </div>
    </div>
  );
}
