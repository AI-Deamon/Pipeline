import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import type { ToolOverview } from '../types';

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-600 bg-red-50';
    case 'high': return 'text-orange-600 bg-orange-50';
    case 'medium': return 'text-yellow-600 bg-yellow-50';
    case 'low': return 'text-blue-600 bg-blue-50';
    default: return 'text-slate-600 bg-slate-50';
  }
}

function SeverityBadge({ level, count }: { level: string; count: number }) {
  if (count === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${severityColor(level)}`}>
      {level === 'critical' || level === 'high' ? <AlertTriangle size={12} /> : <AlertCircle size={12} />}
      {count}
    </span>
  );
}

const ToolCard = memo(function ToolCard({ tool, projectId }: { tool: ToolOverview; projectId: string }) {
  const navigate = useNavigate();
  const total = tool.total;

  return (
    <button
      onClick={() => navigate(`/projects/${projectId}/issues/${tool.tool}`)}
      className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
            <Shield size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">{tool.tool}</h3>
            <p className="text-xs text-slate-500">{total} finding{total !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Info size={16} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(tool.severity).map(([level, count]) => (
          <SeverityBadge key={level} level={level} count={count} />
        ))}
      </div>
      {tool.by_type && Object.keys(tool.by_type).length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          {Object.entries(tool.by_type).map(([type, count]) => (
            <span key={type}>
              <span className="font-medium text-slate-700">{count}</span> {type.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}
    </button>
  );
});

export default ToolCard;
