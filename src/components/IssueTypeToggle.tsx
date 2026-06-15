import { Bug, AlertTriangle, Code, Shield } from 'lucide-react';
import type { ReactNode } from 'react';

type IssueTypeToggleProps = {
  value: string;
  onChange: (v: string) => void;
};

type Option = {
  value: string;
  label: string;
  icon: ReactNode;
};

const OPTIONS: Option[] = [
  { value: '', label: 'All', icon: null },
  { value: 'bug', label: 'Bugs', icon: <Bug size={14} /> },
  { value: 'vulnerability', label: 'Vulnerabilities', icon: <AlertTriangle size={14} /> },
  { value: 'code_smell', label: 'Code Smells', icon: <Code size={14} /> },
  { value: 'security_hotspot', label: 'Hotspots', icon: <Shield size={14} /> },
];

export default function IssueTypeToggle({ value, onChange }: IssueTypeToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
