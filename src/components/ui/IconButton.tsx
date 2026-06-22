import type { LucideIcon } from 'lucide-react';

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'danger' | 'ghost';
  disabled?: boolean;
  className?: string;
}

const variantClasses = {
  default: 'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
  danger: 'text-red-500 hover:text-red-700 hover:bg-red-50',
  ghost: 'text-slate-400 hover:text-slate-600 hover:bg-slate-50',
};

export function IconButton({ icon: Icon, label, onClick, variant = 'default', disabled = false, className = '' }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center w-11 h-11 min-h-[44px] min-w-[44px] rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none ${variantClasses[variant]} ${className}`}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}
