import React from 'react';
import { Info, CheckCircle, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: LucideIcon;
  error?: string;
  helpText?: string;
  required?: boolean;
  touched?: boolean;
}

export const FormInput = ({
  label,
  icon: Icon,
  error,
  helpText,
  required,
  touched = false,
  className = '',
  id,
  ...props
}: FormInputProps) => {
  const hasValue = props.value && String(props.value).length > 0;
  const showSuccess = touched && !error && hasValue;
  const showError = touched && error;
  const inputId = id || props.name || Math.random().toString(36).substr(2, 9);

  return (
    <div className="space-y-1 w-full group">
      <label 
        htmlFor={inputId} 
        className={`flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-widest transition-colors ${
          showError ? 'text-red-500' : showSuccess ? 'text-primary' : 'text-gray-500 group-focus-within:text-primary'
        }`}
      >
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
        {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
      </label>

      <div className="relative">
        <input
          id={inputId}
          {...props}
          className={`input-field pr-10 ${
            showError 
              ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' 
              : showSuccess 
              ? 'border-primary/50 focus:border-primary focus:ring-primary/20' 
              : ''
          } ${className}`}
        />
        
        {/* Status Icons */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {showSuccess && <CheckCircle className="w-5 h-5 text-primary animate-in fade-in zoom-in duration-200" />}
          {showError && <AlertCircle className="w-5 h-5 text-red-500 animate-in fade-in zoom-in duration-200" />}
        </div>
      </div>

      {/* Helper / Error Text */}
      <div className="min-h-[1.25rem]">
        {showError ? (
          <p className="text-xs font-mono text-red-500 flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1">
            <span className="inline-block w-1 h-1 bg-red-500 rounded-full"></span>
            {error}
          </p>
        ) : helpText ? (
          <p className="text-xs font-mono text-gray-500 flex items-center gap-1.5 italic opacity-80">
            <Info className="w-3 h-3 opacity-50" />
            {helpText}
          </p>
        ) : null}
      </div>
    </div>
  );
};
