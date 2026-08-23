import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { ArrowLeft, Bug, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import IssueFilterBar from '../components/IssueFilterBar';
import IssueTypeToggle from '../components/IssueTypeToggle';
import IssueDetailModal from '../components/IssueDetailModal';
import { AccessDenied } from '../components/AccessDenied';
import { ApiError } from '../utils/apiError';
import { severityPillClass } from '../utils/severity';
import type { IssueResponse } from '../types';

const PAGE_SIZE = 25;

function statusLabel(status: string): string {
  switch (status) {
    case 'open': return 'Open';
    case 'assigned': return 'Assigned';
    case 'in_progress': return 'In Progress';
    case 'fixed': return 'Fixed';
    case 'verified': return 'Verified';
    case 'rejected': return 'Rejected';
    default: return status;
  }
}

const ToolDetailViewPage = () => {
  const { projectId, toolName } = useParams<{ projectId: string; toolName: string }>();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [findingType, setFindingType] = useState('');
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['tool-issues', projectId, toolName, page, findingType],
    queryFn: () => api.issues.getToolIssues(projectId!, toolName!, page, PAGE_SIZE, findingType || undefined),
    enabled: !!projectId && !!toolName,
  });

  const handleFindingTypeChange = (v: string) => {
    setFindingType(v);
    setPage(1);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    if (error instanceof ApiError && error.status === 403) {
      return <AccessDenied message="You don't have permission to view issues for this project." />;
    }
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <Bug size={40} className="mx-auto mb-3 text-red-400" />
          <h2 className="text-lg font-semibold text-red-700 mb-1">Failed to load issues</h2>
          <p className="text-sm text-red-500">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  const issues = data?.issues ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const filtered = issues.filter((i: IssueResponse) => {
    if (search && !i.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && i.status !== statusFilter) return false;
    if (severityFilter && i.severity !== severityFilter) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link to={`/projects/${projectId}/issues`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft size={16} /> Back to overview
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 capitalize">{toolName}</h1>
        <p className="text-sm text-slate-500 mt-1">{total} issue{total !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <IssueTypeToggle value={findingType} onChange={handleFindingTypeChange} />
        <IssueFilterBar
          search={search} onSearchChange={setSearch}
          statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
          severityFilter={severityFilter} onSeverityFilterChange={setSeverityFilter}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center">
          <Bug size={48} className="mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-semibold text-slate-600 mb-1">No issues match your filters</h3>
          <p className="text-sm text-slate-400">Try adjusting the search or filter criteria.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Severity</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Title</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Location</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Effort</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((issue: IssueResponse) => (
                <tr
                  key={issue.id}
                  onClick={() => setSelectedIssueId(issue.id)}
                  className="border-b border-slate-100 hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${severityPillClass(issue.severity)}`}>
                      {issue.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 flex items-center gap-1.5">
                    {issue.title}
                    <ExternalLink size={12} className="text-slate-300" />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                    {(() => {
                      const fp = issue.file_path;
                      const ln = issue.line_number;
                      if (fp && ln) return `${fp.split('/').pop()}:${ln}`;
                      if (fp) return fp.split('/').pop();
                      return <span className="text-slate-300">—</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {issue.effort || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-500">{statusLabel(issue.status)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(issue.last_seen_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200">
              <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedIssueId !== null && (
        <IssueDetailModal issueId={selectedIssueId} onClose={() => setSelectedIssueId(null)} />
      )}
    </div>
  );
};

export default ToolDetailViewPage;
