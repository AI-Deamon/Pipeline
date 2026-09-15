import { Search } from 'lucide-react';
import { SEVERITY_LEVELS } from '../../utils/severity';

interface FindingsFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  severityFilter: string; // 'All' | SeverityLevel
  onSeverityChange: (v: string) => void;
  toolFilter: string; // 'All' | tool name
  onToolChange: (v: string) => void;
  availableTools: string[];
  severityCounts: Record<string, number>;
  toolLocked?: boolean; // true when a sidebar tool selection makes the tool dropdown inert (Task 6)
}

const SEVERITIES = ['All', ...SEVERITY_LEVELS] as const;

export const FindingsFilterBar = ({
  search, onSearchChange,
  severityFilter, onSeverityChange,
  toolFilter, onToolChange,
  availableTools, severityCounts, toolLocked,
}: FindingsFilterBarProps) => (
  <div className="p-4 border-b border-slate-200 space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      {SEVERITIES.map((sev) => {
        const count = severityCounts[sev] ?? 0;
        const active = severityFilter === sev;
        return (
          <button
            key={sev}
            onClick={() => onSeverityChange(sev)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              active ? 'bg-slate-900 text-white shadow-md ring-2 ring-slate-400' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            {sev}{count > 0 ? ` ${count}` : ''}
          </button>
        );
      })}
    </div>
    <div className="flex items-center gap-3">
      <select
        value={toolFilter}
        onChange={(e) => onToolChange(e.target.value)}
        disabled={toolLocked}
        aria-label="Filter by tool"
        title={toolLocked ? 'Tool is set by the sidebar selection' : undefined}
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:bg-slate-50 disabled:text-slate-400"
      >
        <option value="All">All tools</option>
        {availableTools.map((tool) => (
          <option key={tool} value={tool}>{tool.replace(/_/g, ' ')}</option>
        ))}
      </select>
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by title, rule, type, package, or host…"
          aria-label="Search findings"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
        />
      </div>
    </div>
  </div>
);
