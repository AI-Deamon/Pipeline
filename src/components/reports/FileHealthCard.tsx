import type { FileHealth } from '../../types';

const severityColors: Record<string, { text: string; bg: string }> = {
  Critical: { text: 'text-red-600', bg: 'bg-red-50' },
  High: { text: 'text-orange-600', bg: 'bg-orange-50' },
  Medium: { text: 'text-yellow-600', bg: 'bg-yellow-50' },
  Low: { text: 'text-green-600', bg: 'bg-green-50' },
  Info: { text: 'text-slate-500', bg: 'bg-slate-50' },
};

interface FileHealthCardProps {
  file: FileHealth;
  isSelected: boolean;
  onClick: () => void;
}

export const FileHealthCard = ({ file, isSelected, onClick }: FileHealthCardProps) => {
  const { measures, issues } = file;
  const coverage = parseFloat(measures.coverage) || 0;
  const complexity = parseInt(measures.complexity) || 0;
  const duplication = parseFloat(measures.duplicated_lines_density) || 0;

  const severityCounts = issues.reduce(
    (acc, issue) => {
      const sev = issue.severity;
      acc[sev] = (acc[sev] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all ${
        isSelected
          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      {/* File name */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm text-slate-900 truncate">
          {file.file_path.split('/').pop()}
        </span>
        <span className="text-xs text-slate-500">{issues.length} issues</span>
      </div>

      {/* File path */}
      <div className="text-xs text-slate-500 truncate mb-2">{file.file_path}</div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div className="text-center">
          <div className="text-xs text-slate-500">Coverage</div>
          <div className={`text-sm font-semibold ${coverage >= 70 ? 'text-green-600' : coverage >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
            {coverage.toFixed(0)}%
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-500">Complexity</div>
          <div className={`text-sm font-semibold ${complexity <= 10 ? 'text-green-600' : complexity <= 20 ? 'text-yellow-600' : 'text-red-600'}`}>
            {complexity}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-500">Dupes</div>
          <div className={`text-sm font-semibold ${duplication <= 3 ? 'text-green-600' : duplication <= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
            {duplication.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Severity badges */}
      <div className="flex flex-wrap gap-1">
        {Object.entries(severityCounts).map(([sev, count]) => (
          <span
            key={sev}
            className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${severityColors[sev]?.bg || ''} ${severityColors[sev]?.text || ''}`}
          >
            {count} {sev.charAt(0)}
          </span>
        ))}
      </div>
    </button>
  );
};
