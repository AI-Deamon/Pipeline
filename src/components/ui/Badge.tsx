import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'purple' | 'default';

interface BadgeProps {
  variant?: BadgeVariant;
  icon?: LucideIcon;
  dot?: boolean;
  dotColor?: string;
  children: ReactNode;
  size?: 'sm' | 'md';
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700',
  danger: 'bg-rose-50 text-rose-700',
  warning: 'bg-amber-100 text-amber-800',
  info: 'bg-blue-50 text-blue-700',
  purple: 'bg-purple-50 text-purple-700',
  default: 'bg-slate-100 text-slate-600',
};

const dotClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500',
  danger: 'bg-rose-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
  purple: 'bg-purple-500',
  default: 'bg-slate-400',
};

export function Badge({ variant = 'default', icon: Icon, dot = false, dotColor, children, size = 'sm' }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full ${variantClasses[variant]} ${sizeClass}`}>
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor || dotClasses[variant]}`} />
      )}
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      {children}
    </span>
  );
}
