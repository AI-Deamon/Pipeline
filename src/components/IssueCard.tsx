import { memo } from 'react';
import { AlertTriangle, AlertCircle, Clock, User } from 'lucide-react';
import type { IssueResponse } from '../types';

function statusColor(status: string): string {
  switch (status) {
    case 'open': return 'bg-blue-100 text-blue-700';
    case 'assigned': return 'bg-purple-100 text-purple-700';
    case 'in_progress': return 'bg-yellow-100 text-yellow-700';
    case 'fixed': return 'bg-green-100 text-green-700';
    case 'verified': return 'bg-emerald-100 text-emerald-700';
    case 'rejected': return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function severityIcon(severity: string) {
  switch (severity) {
    case 'critical':
    case 'high':
      return <AlertTriangle size={16} className="text-red-500" />;
    default:
      return <AlertCircle size={16} className="text-orange-500" />;
  }
}

const IssueCard = memo(function IssueCard({
  issue,
  onClick,
}: {
  issue: IssueResponse;
  onClick?: (issue: IssueResponse) => void;
}) {
  const handleClick = () => onClick?.(issue);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const content = (
    <>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {severityIcon(issue.severity)}
          <h3 className="font-semibold text-sm text-slate-900 truncate">{issue.title}</h3>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-slate-400 capitalize">{issue.tool_name}</span>
        <span className="text-slate-300">·</span>
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(issue.status)}`}>
          {issue.status.replace('_', ' ')}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-400">
        {issue.assignee_id && (
          <span className="inline-flex items-center gap-1">
            <User size={12} /> {issue.assignee_id}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Clock size={12} /> {new Date(issue.last_seen_at).toLocaleDateString()}
        </span>
      </div>
    </>
  );

  if (!onClick) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-200"
    >
      {content}
    </button>
  );
});

export default IssueCard;
