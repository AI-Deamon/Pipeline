import type { LucideIcon } from 'lucide-react';
import { Info, CheckCircle, AlertCircle } from 'lucide-react';

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
  ...props
}: FormInputProps) => {
  const hasValue = props.value && String(props.value).length > 0;
  const showSuccess = touched && !error && hasValue;
  const showError = touched && error;

  return (
    <div className="space-y-2 w-full group">
      <label htmlFor={props.id} className={`flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 transition-colors ${
        showError ? 'text-red-500' : showSuccess ? 'text-green-600' : 'group-focus-within:text-blue-500'
      }`}>
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
        {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
      </label>

      <div className="relative">
        <input
          {...props}
          className={`input-field transition-all ${
            showError 
              ? 'border-red-300 focus:ring-red-500/10 focus:border-red-500 bg-red-50/30' 
              : showSuccess 
              ? 'border-green-300 focus:ring-green-500/10 focus:border-green-500 bg-green-50/30' 
              : ''
          } ${className}`}
        />
        {showSuccess && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 animate-in fade-in zoom-in duration-200">
            <CheckCircle className="w-5 h-5" />
          </div>
        )}
        {showError && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 animate-in fade-in zoom-in duration-200">
            <AlertCircle className="w-5 h-5" />
          </div>
        )}
      </div>

      {showError && (
        <p className="text-[10px] font-bold text-red-500 mt-2 flex items-center gap-1.5 ml-1 animate-in fade-in slide-in-from-top-1">
          <Info className="w-3.5 h-3.5" />
          {error}
        </p>
      )}

      {helpText && !showError && (
        <p className="text-[10px] font-medium text-slate-400 mt-2 flex items-center gap-1.5 ml-1 italic opacity-80">
          <Info className="w-3.5 h-3.5 opacity-50" />
          {helpText}
        </p>
      )}
    </div>
  );
};
