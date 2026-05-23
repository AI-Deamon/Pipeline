import type { LucideIcon } from 'lucide-react';
import { Plus } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-20 text-center bg-white border-2 border-dashed border-slate-100 rounded-[4rem] shadow-sm animate-in fade-in zoom-in duration-700 relative overflow-hidden group">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-slate-50/50 rounded-full blur-3xl -translate-x-32 -translate-y-32 transition-transform group-hover:scale-150 duration-1000"></div>
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-50/30 rounded-full blur-3xl translate-x-32 translate-y-32 transition-transform group-hover:scale-150 duration-1000"></div>

      <div className="w-32 h-32 bg-slate-50 rounded-[3rem] flex items-center justify-center mb-10 relative shadow-inner border border-slate-100/50">
        <div className="absolute inset-0 bg-blue-100/30 rounded-[3rem] animate-ping duration-[4000ms]"></div>
        <Icon className="w-14 h-14 text-slate-300 relative z-10 group-hover:text-blue-400 group-hover:scale-110 transition-all duration-500" />
      </div>
      
      <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-4 uppercase leading-none">{title}</h3>
      <p className="text-slate-400 text-sm font-medium max-w-sm leading-relaxed mb-12 italic">
        {description}
      </p>
      
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="group px-10 py-5 btn-primary flex items-center gap-4 active:scale-95 shadow-2xl shadow-blue-200"
        >
          <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform duration-500" />
          <span className="uppercase tracking-[0.2em] text-[10px] font-black">{actionLabel}</span>
        </button>
      )}
    </div>
  );
}
