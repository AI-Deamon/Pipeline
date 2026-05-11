import React from 'react';
import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: LucideIcon;
  isLoading?: boolean;
  fullWidth?: boolean;
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  isLoading,
  fullWidth,
  className = '',
  children,
  ...props
}: ButtonProps) => {
  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    outline: 'btn-secondary', // Reuse secondary for outline in this theme
    danger: 'btn-danger',
    ghost: 'btn-ghost',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
    xl: 'px-10 py-5 text-lg',
  };

  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 transition-all duration-200 
        font-mono font-bold tracking-wider uppercase
        disabled:opacity-50 disabled:pointer-events-none
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="animate-spin h-4 w-4" />
      ) : Icon ? (
        <Icon className={`${size === 'xl' ? 'w-6 h-6' : 'w-4 h-4'}`} />
      ) : null}
      {children}
    </button>
  );
};
