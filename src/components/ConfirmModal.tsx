import { X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  icon?: React.ReactNode;
  isPending?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  icon,
  isPending = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      bg: 'bg-red-50',
      text: 'text-red-600',
      ring: 'ring-red-50/50',
      animate: 'bg-red-100',
      button: 'bg-red-600 hover:bg-red-700 text-white',
    },
    warning: {
      bg: 'bg-amber-50',
      text: 'text-amber-600',
      ring: 'ring-amber-50/50',
      animate: 'bg-amber-100',
      button: 'bg-amber-600 hover:bg-amber-700 text-white',
    },
    info: {
      bg: 'bg-blue-50',
      text: 'text-blue-600',
      ring: 'ring-blue-50/50',
      animate: 'bg-blue-100',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
  };

  const style = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-500"
        onClick={onClose}
      ></div>
      <div className="bg-white rounded-[3.5rem] max-w-xl w-full p-12 shadow-2xl relative z-10 animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 flex flex-col items-center text-center">
        <button
          onClick={onClose}
          className="absolute top-10 right-10 p-4 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all active:scale-90"
          aria-label="Close dialog"
        >
          <X className="w-7 h-7" />
        </button>

        <div className={`w-24 h-24 ${style.bg} ${style.text} rounded-[2.5rem] flex items-center justify-center mb-10 shadow-inner relative ring-8 ${style.ring}`}>
          <div className={`absolute inset-0 ${style.animate} rounded-[2.5rem] animate-ping opacity-20`}></div>
          {icon && <div className="w-12 h-12 fill-current relative z-10">{icon}</div>}
        </div>

        <h2 className="text-4xl font-black text-slate-900 tracking-tighter leading-none mb-6 uppercase" dangerouslySetInnerHTML={{ __html: title }} />
        <p className="text-slate-500 font-medium leading-relaxed mb-12 italic px-4">{message}</p>

        <div className="flex flex-col w-full gap-4">
          <button
            onClick={onConfirm}
            disabled={isPending}
            className={`w-full h-20 rounded-[2rem] uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-4 disabled:opacity-50 transition-all ${style.button}`}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="w-full btn-secondary h-16 uppercase tracking-[0.2em] text-[10px] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
