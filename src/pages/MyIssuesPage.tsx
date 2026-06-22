import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { ClipboardList } from 'lucide-react';
import IssueCard from '../components/IssueCard';
import IssueDetailModal from '../components/IssueDetailModal';
import { ErrorDisplay } from '../components/ui/ErrorDisplay';
import EmptyState from '../components/EmptyState';
import type { IssueResponse } from '../types';

const MyIssuesPage = () => {
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['my-issues'],
    queryFn: () => api.issues.getMyIssues(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" role="status" aria-live="polite">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="sr-only">Loading your issues...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorDisplay
          message={(error as Error).message}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const total = data?.total ?? 0;
  const issues = data?.issues ?? [];
  const projects = data?.projects ?? [];

  const grouped = new Map<string, IssueResponse[]>();
  for (const issue of issues) {
    const list = grouped.get(issue.project_id) ?? [];
    list.push(issue);
    grouped.set(issue.project_id, list);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardList size={24} className="text-blue-600" />
          My Issues
        </h1>
        <p className="text-sm text-slate-500 mt-1">{total} issue{total !== 1 ? 's' : ''} assigned to you</p>
      </div>

      {total === 0 ? (
        <EmptyState
          variant="empty"
          title="No issues assigned"
          message="Issues assigned to you will appear here."
          icon={<ClipboardList size={48} />}
        />
      ) : (
        <div className="space-y-6">
          {projects.map((p) => {
            const projectIssues = grouped.get(p.project_id) ?? [];
            return (
              <div key={p.project_id}>
                <h2 className="text-lg font-semibold text-slate-800 mb-3">{p.project_id}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {projectIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      onClick={(i) => setSelectedIssueId(i.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedIssueId !== null && (
        <IssueDetailModal
          issueId={selectedIssueId}
          onClose={() => setSelectedIssueId(null)}
        />
      )}
    </div>
  );
};

export default MyIssuesPage;
