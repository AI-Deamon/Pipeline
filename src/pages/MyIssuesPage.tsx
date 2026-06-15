import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Bug, ClipboardList } from 'lucide-react';
import IssueCard from '../components/IssueCard';
import type { IssueResponse } from '../types';

const MyIssuesPage = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-issues'],
    queryFn: () => api.issues.getMyIssues(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <Bug size={40} className="mx-auto mb-3 text-red-400" />
          <h2 className="text-lg font-semibold text-red-700 mb-1">Failed to load your issues</h2>
          <p className="text-sm text-red-500">{(error as Error).message}</p>
        </div>
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
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center">
          <ClipboardList size={48} className="mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-semibold text-slate-600 mb-1">No issues assigned</h3>
          <p className="text-sm text-slate-400">Issues assigned to you will appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {projects.map((p) => {
            const projectIssues = grouped.get(p.project_id) ?? [];
            return (
              <div key={p.project_id}>
                <h2 className="text-lg font-semibold text-slate-800 mb-3">{p.project_id}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {projectIssues.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyIssuesPage;
