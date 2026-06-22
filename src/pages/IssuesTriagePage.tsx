import { useMemo, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ListChecks, ChevronDown, ChevronRight, X, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { useRbac } from '../hooks/useRbac';
import IssueCard from '../components/IssueCard';
import IssueDetailModal from '../components/IssueDetailModal';
import { PageSkeleton } from '../components/PageSkeleton';
import EmptyState from '../components/EmptyState';
import { STAGE_DISPLAY_NAMES, type IssueResponse, type IssueStatus } from '../types';

const PROJECT_CAP = 10;
const PAGE_SIZE = 25;
const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const STATUS_OPTIONS: IssueStatus[] = [
  'open',
  'assigned',
  'in_progress',
  'fixed',
  'verified',
  'rejected',
];

const SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low'] as const;

const IssuesTriagePage = () => {
  const { canAssignIssues, isAdmin } = useRbac();
  const [statusFilter, setStatusFilter] = useState<IssueStatus[]>(['open']);
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [toolFilter, setToolFilter] = useState<string[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: api.projects.list,
    refetchInterval: 60_000,
  });

  const visibleProjects = useMemo(() => projects.slice(0, PROJECT_CAP), [projects]);
  const hasMoreProjects = projects.length > PROJECT_CAP;

  const projectOverviews = useQueries({
    queries: visibleProjects.map((p) => ({
      queryKey: ['project-overview', p.project_id],
      queryFn: () => api.issues.getProjectOverview(p.project_id),
      staleTime: 30_000,
      retry: 1,
    })),
  });

  const toolQueries = useQueries({
    queries: visibleProjects.flatMap((p, pIdx) => {
      const overview = projectOverviews[pIdx]?.data;
      if (!overview) return [];
      return overview.tools
        .filter((t) => t.total > 0)
        .map((t) => ({
          queryKey: [
            'tool-issues-triage',
            p.project_id,
            t.tool,
            statusFilter,
          ],
          queryFn: async () => {
            const all: IssueResponse[] = [];
            for (let page = 1; page <= 4; page++) {
              const result = await api.issues.getToolIssues(
                p.project_id,
                t.tool,
                page,
                PAGE_SIZE,
                undefined,
              );
              all.push(...result.issues);
              if (result.issues.length < PAGE_SIZE) break;
            }
            return all;
          },
          staleTime: 30_000,
          retry: 1,
        }));
    }),
  });

  const allIssues: IssueResponse[] = useMemo(() => {
    const collected: IssueResponse[] = [];
    toolQueries.forEach((q) => {
      if (q.data) collected.push(...q.data);
    });
    return collected;
  }, [toolQueries]);

  const projectToolMap = useMemo(() => {
    const map = new Map<string, string[]>();
    visibleProjects.forEach((p, pIdx) => {
      const overview = projectOverviews[pIdx]?.data;
      if (overview) {
        map.set(
          p.project_id,
          overview.tools.filter((t) => t.total > 0).map((t) => t.tool),
        );
      }
    });
    return map;
  }, [visibleProjects, projectOverviews]);

  const availableTools = useMemo(() => {
    const set = new Set<string>();
    projectToolMap.forEach((tools) => tools.forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [projectToolMap]);

  const sortedAndFiltered = useMemo(() => {
    const filtered = allIssues.filter(
      (i) =>
        statusFilter.includes(i.status) &&
        (severityFilter.length === 0 || severityFilter.includes(i.severity)) &&
        (toolFilter.length === 0 || toolFilter.includes(i.tool_name)),
    );
    return filtered.sort((a, b) => {
      const sev = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
      if (sev !== 0) return sev;
      return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
    });
  }, [allIssues, statusFilter, severityFilter, toolFilter]);

  const groupedByProject = useMemo(() => {
    const grouped = new Map<string, IssueResponse[]>();
    for (const issue of sortedAndFiltered) {
      const list = grouped.get(issue.project_id) ?? [];
      list.push(issue);
      grouped.set(issue.project_id, list);
    }
    return grouped;
  }, [sortedAndFiltered]);

  const isLoading =
    projectsLoading ||
    projectOverviews.some((q) => q.isLoading) ||
    toolQueries.some((q) => q.isLoading);

  if (!canAssignIssues && !isAdmin) {
    return <Navigate to="/my-issues" replace />;
  }

  const toggleStatus = (status: IssueStatus) => {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  };

  const toggleSeverity = (sev: string) => {
    setSeverityFilter((prev) =>
      prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev],
    );
  };

  const toggleTool = (tool: string) => {
    setToolFilter((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  };

  const toggleCollapse = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ListChecks size={24} className="text-blue-600" />
          Issues
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {sortedAndFiltered.length} issue{sortedAndFiltered.length !== 1 ? 's' : ''} matching filters
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1.5">Status</div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  statusFilter.includes(s)
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1.5">Severity</div>
          <div className="flex flex-wrap gap-1.5">
            {SEVERITY_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleSeverity(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border capitalize transition-colors ${
                  severityFilter.includes(s)
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        {availableTools.length > 0 && (
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">Tool</div>
            <div className="flex flex-wrap gap-1.5">
              {availableTools.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTool(t)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    toolFilter.includes(t)
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                  title={STAGE_DISPLAY_NAMES[t as keyof typeof STAGE_DISPLAY_NAMES] ?? t}
                >
                  {STAGE_DISPLAY_NAMES[t as keyof typeof STAGE_DISPLAY_NAMES] ?? t}
                </button>
              ))}
            </div>
          </div>
        )}
        {(statusFilter.length !== 1 || statusFilter[0] !== 'open' || severityFilter.length > 0 || toolFilter.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter(['open']);
              setSeverityFilter([]);
              setToolFilter([]);
            }}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
          >
            <X size={12} /> Reset filters
          </button>
        )}
      </div>

      {isLoading && sortedAndFiltered.length === 0 ? (
        <PageSkeleton type="dashboard" />
      ) : projects.length === 0 ? (
        <EmptyState
          variant="empty"
          title="No projects assigned to you"
          message="Contact an admin to get project access."
          icon={<ListChecks size={48} />}
        />
      ) : sortedAndFiltered.length === 0 ? (
        <EmptyState
          variant="empty"
          title="No issues match your filters"
          message="Try resetting filters or check back after a new scan."
          icon={<ListChecks size={48} />}
        />
      ) : (
        <div className="space-y-4">
          {visibleProjects
            .filter((p) => groupedByProject.has(p.project_id))
            .map((p) => {
              const projectIssues = groupedByProject.get(p.project_id) ?? [];
              const collapsed = collapsedProjects.has(p.project_id);
              return (
                <div key={p.project_id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(p.project_id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2">
                      {collapsed ? (
                        <ChevronRight size={16} className="text-slate-400" />
                      ) : (
                        <ChevronDown size={16} className="text-slate-400" />
                      )}
                      <span className="font-semibold text-slate-900 text-sm">{p.name}</span>
                      <span className="text-xs text-slate-400 font-mono">{p.project_id}</span>
                    </div>
                    <span className="text-xs text-slate-500">{projectIssues.length} issue{projectIssues.length !== 1 ? 's' : ''}</span>
                  </button>
                  {!collapsed && (
                    <div className="border-t border-slate-100 p-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {projectIssues.map((issue) => (
                          <div key={issue.id} className="relative">
                            <IssueCard issue={issue} onClick={(i) => setSelectedIssueId(i.id)} />
                            {canAssignIssues && issue.status === 'open' && (
                              <Link
                                to={`/projects/${p.project_id}/issues/${issue.tool_name}`}
                                className="absolute bottom-2 right-2 text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Assign
                              </Link>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          {hasMoreProjects && (
            <div className="text-center py-4">
              <Link
                to="/dashboard"
                className="text-sm text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
              >
                Show {projects.length - PROJECT_CAP} more project{projects.length - PROJECT_CAP !== 1 ? 's' : ''} on Dashboard
                <ChevronRight size={14} />
              </Link>
            </div>
          )}
        </div>
      )}

      {isLoading && sortedAndFiltered.length > 0 && (
        <div className="flex items-center justify-center py-4 text-slate-400 text-xs">
          <Loader2 size={14} className="animate-spin mr-1.5" /> Refreshing…
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

export default IssuesTriagePage;
