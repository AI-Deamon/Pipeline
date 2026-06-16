import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { ArrowLeft, BarChart3, Bug } from 'lucide-react';
import ToolCard from '../components/ToolCard';
import { AccessDenied } from '../components/AccessDenied';
import { ApiError } from '../utils/apiError';
import type { OverviewResponse } from '../types';

const ProjectOverviewPage = () => {
  const { projectId } = useParams<{ projectId: string }>();

  const { data, isLoading, error } = useQuery<OverviewResponse>({
    queryKey: ['project-overview', projectId],
    queryFn: () => api.issues.getProjectOverview(projectId!),
    enabled: !!projectId,
  });

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
          <Link to={`/projects/${projectId}`} className="mt-4 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
            <ArrowLeft size={16} /> Back to project
          </Link>
        </div>
      </div>
    );
  }

  const tools = data?.tools ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link to={`/projects/${projectId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft size={16} /> Back to project
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Issue Overview</h1>
        <p className="text-sm text-slate-500 mt-1">{projectId}</p>
      </div>

      {tools.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center">
          <BarChart3 size={48} className="mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-semibold text-slate-600 mb-1">No issues found</h3>
          <p className="text-sm text-slate-400">Run a scan to see issues grouped by tool.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => (
            <ToolCard key={tool.tool} tool={tool} projectId={projectId!} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectOverviewPage;
