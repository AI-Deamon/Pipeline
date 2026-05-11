import { Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-20 text-center card-container animate-in fade-in zoom-in duration-700 relative overflow-hidden group">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-x-32 -translate-y-32 transition-transform group-hover:scale-150 duration-1000"></div>
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl translate-x-32 translate-y-32 transition-transform group-hover:scale-150 duration-1000"></div>
      
      {/* Scanline effect */}
      <div className="scanline"></div>

      <div className="w-32 h-32 bg-primary/5 rounded-3xl flex items-center justify-center mb-10 relative shadow-[0_0_30px_rgba(0,255,65,0.1)] border border-primary/20 group-hover:border-primary/40 transition-colors">
        <div className="absolute inset-0 bg-primary/10 rounded-3xl animate-ping duration-[4000ms]"></div>
        <Icon className="w-14 h-14 text-primary/50 relative z-10 group-hover:text-primary group-hover:scale-110 transition-all duration-500" />
      </div>
      
      <h3 className="text-2xl font-mono font-bold text-white tracking-tighter mb-4 uppercase leading-none">{title}</h3>
      <p className="text-gray-500 text-sm font-mono font-medium max-w-sm leading-relaxed mb-12 italic">
        {description}
      </p>
      
      {actionLabel && onAction && (
        <Button
          variant="primary"
          onClick={onAction}
          icon={Plus}
          className="px-10 py-5"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
