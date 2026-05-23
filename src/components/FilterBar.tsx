import React from 'react';
import { Search } from 'lucide-react';
interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  selectedSeverities: string[];
  onSeverityChange: (severities: string[]) => void;
  selectedTools: string[];
  onToolChange: (tools: string[]) => void;
  availableTools: string[];
}
const SEVERITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low'];
const FilterBar: React.FC<FilterBarProps> = ({
  search,
  onSearchChange,
  selectedSeverities,
  onSeverityChange,
  selectedTools,
  onToolChange,
  availableTools,
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search findings..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
          />
        </div>
        {/* Severity Filter */}
        <div className="flex gap-2">
          {SEVERITY_OPTIONS.map((sev) => (
            <button
              key={sev}
              onClick={() => {
                const next = selectedSeverities.includes(sev)
                  ? selectedSeverities.filter((s) => s !== sev)
                  : [...selectedSeverities, sev];
                onSeverityChange(next);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedSeverities.includes(sev)
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
        {/* Tool Filter */}
        <div className="flex gap-2">
          {availableTools.map((tool) => (
            <button
              key={tool}
              onClick={() => {
                const next = selectedTools.includes(tool)
                  ? selectedTools.filter((t) => t !== tool)
                  : [...selectedTools, tool];
                onToolChange(next);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedTools.includes(tool)
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tool}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
export default FilterBar;
