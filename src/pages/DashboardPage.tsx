import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import type { Project, ReportSummary, SeveritySummary } from "../types";
import {
  Plus,
  Search,
  X,
  Trash2,
  Loader2,
  Shield,
  ShieldAlert,
  User,
} from "lucide-react";
import { useDebounce } from "../hooks/useDebounce";
import { useRbac } from "../hooks/useRbac";
import { PageSkeleton } from "../components/PageSkeleton";
import { useToast } from "../components/Toast";
import { StatusBadge } from "../components/ui/StatusBadge";
import { IconButton } from "../components/ui/IconButton";
import { OnboardingChecklist } from "../components/OnboardingChecklist";
import EmptyState from "../components/EmptyState";
import { ConfirmModal } from "../components/ConfirmModal";

const ProjectRow = ({ project, reportSummaries }: { project: Project; reportSummaries: Record<string, ReportSummary> }) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { isAdmin } = useRbac();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const deleteProjectMutation = useMutation({
    mutationFn: () => api.projects.delete(project.project_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setShowDeleteConfirm(false);
      addToast({
        type: "success",
        title: "Project Deleted",
        message: `Project "${project.name}" has been removed.`,
      });
    },
    onError: (error) => {
      console.error("Failed to delete project:", error);
      addToast({
        type: "error",
        title: "Deletion Failed",
        message: `Failed to delete project "${project.name}".`,
      });
    },
  });

  const isScanning =
    project.last_scan_state === "RUNNING" ||
    project.last_scan_state === "QUEUED" ||
    project.last_scan_state === "CREATED";

  const lastScanDate = project.last_scan_time
    ? new Date(project.last_scan_time).toLocaleString('en-IN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }) + ' IST'
    : "--";

  // Get report summary for this project
  const reportSummary = reportSummaries[project.project_id];
  
  // Calculate severity color based on highest severity found
  const getSeverityColor = (severity: SeveritySummary) => {
    if (severity.critical > 0) return "#dc2626"; // red-600
    if (severity.high > 0) return "#ea580c"; // orange-600
    if (severity.medium > 0) return "#ca8a04"; // yellow-600
    if (severity.low > 0) return "#16a34a"; // green-600
    return "#4b5563"; // gray-600
  };

  return (
    <>
    <tr className="hover:bg-slate-50/50 transition-colors group">
      <td className="px-6 py-4">
        <div className="flex flex-col">
          <span className="font-medium text-slate-900">{project.name}</span>
          <span className="text-sm text-slate-500">{project.project_id}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <StatusBadge state={project.last_scan_state ?? null} />
      </td>
      <td className="px-6 py-4 text-sm text-slate-500">{lastScanDate}</td>
      <td className="px-6 py-4 text-right">
          <div className="flex items-center justify-end gap-2">
            {project.last_scan_id && !isScanning && (
              <Link
                to={`/scans/${project.last_scan_id}`}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                View
              </Link>
            )}
            <Link
              to={`/projects/${project.project_id}/reports`}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              View Reports
            </Link>
            {reportSummary && (
              <div className="flex items-center gap-2 ml-3">
                <div className="relative">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getSeverityColor(reportSummary.severity) }}
                  ></div>
                  <div className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-white ring-2 ring-slate-300">
                    <div className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getSeverityColor(reportSummary.severity) }}
                    ></div>
                  </div>
                </div>
                <div className="flex flex-col items-center text-xs">
                  <div className="font-medium">{reportSummary.total_findings}</div>
                  <div className="text-slate-500">Findings</div>
                </div>
              </div>
            )}
            <Link
              to={`/projects/${project.project_id}`}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Manage
            </Link>
            {isAdmin && (
              <IconButton
                icon={Trash2}
                label={`Delete ${project.name}`}
                variant="danger"
                onClick={() => setShowDeleteConfirm(true)}
              />
            )}
          </div>
      </td>
    </tr>

    <ConfirmModal
      isOpen={showDeleteConfirm}
      onClose={() => setShowDeleteConfirm(false)}
      onConfirm={() => deleteProjectMutation.mutate()}
      title="Delete project?"
      message={`This will permanently delete "${project.name}" and all associated scans and reports. This action cannot be undone.`}
      confirmLabel="Delete permanently"
      variant="danger"
      isPending={deleteProjectMutation.isPending}
    />
    </>
  );
};

const ACTIVE_STATES = new Set(["CREATED", "QUEUED", "RUNNING"]);

const DashboardPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const { isAdmin, canViewAllProjects } = useRbac();

  const { data: projects = [], isLoading: loading } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });

  // Fetch report summaries for all projects
  const { data: reportSummaries = {}, isLoading: reportsLoading } = useQuery({
    queryKey: ["report-summaries"],
    queryFn: async () => {
      // Fetch summaries for all projects in parallel
      const summaryPromises = projects
        .filter((project) => project.project_id)
        .map((project) => 
          api.reports.getSummary(project.project_id).then(
            (summary) => [project.project_id, summary] as const
          )
        );
      
      const results = await Promise.allSettled(summaryPromises);
      const summaries: Record<string, ReportSummary> = {};
      
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          const [projectId, summary] = result.value;
          summaries[projectId] = summary;
        }
      });
      
      return summaries;
    },
    // Only refetch when projects change
    enabled: !!projects.length,
  });

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const activeScanProjects = useMemo(
    () => projects.filter((p) => ACTIVE_STATES.has(p.last_scan_state ?? "")),
    [projects]
  );

  const filteredProjects = useMemo(() => {
    if (!debouncedSearchTerm) return projects;
    const lowerSearch = debouncedSearchTerm.toLowerCase();
    return projects.filter((project) =>
      project.name.toLowerCase().includes(lowerSearch)
    );
  }, [projects, debouncedSearchTerm]);

  const isLoading = loading || reportsLoading;

  if (isLoading) return <PageSkeleton type="dashboard" />;

  return (
    <div className="max-w-6xl mx-auto p-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
          <p className="text-slate-500 mt-1">
            Manage and monitor your security scans.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
              <Shield size={12} /> Admin
            </span>
          ) : canViewAllProjects ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
              <ShieldAlert size={12} /> Team Lead
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-50 text-slate-600">
              <User size={12} /> Developer
            </span>
          )}
          {isAdmin && (
            <Link
              to="/projects/create"
              className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Project
            </Link>
          )}
        </div>
      </header>

      <OnboardingChecklist />

      {activeScanProjects.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex flex-col gap-2">
          {activeScanProjects.map((p) => (
            <Link
              key={p.project_id}
              to={`/scans/${p.last_scan_id}`}
              className="flex items-center gap-3 hover:bg-amber-100/50 rounded-lg px-3 py-2 transition-colors"
            >
              <Loader2 className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
              <span className="text-amber-800 text-sm font-medium">
                Scan running on <strong>{p.name}</strong>
              </span>
              <span className="text-xs text-amber-600 ml-auto">Click to view →</span>
            </Link>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search projects by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search projects"
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        debouncedSearchTerm ? (
          <EmptyState
            variant="empty"
            title="No projects found"
            message={`No projects matching "${debouncedSearchTerm}"`}
            icon={<Search size={48} />}
          />
        ) : isAdmin ? (
          <EmptyState
            variant="empty"
            title="No projects yet"
            message="Start by adding your first project to scan."
            action={{ label: "Add Project", onClick: () => window.location.href = "/projects/create" }}
            icon={<Plus size={48} />}
          />
        ) : (
          <EmptyState
            variant="empty"
            title="No projects in scope"
            message="You don't have access to any projects. Contact an admin to get access."
            icon={<Shield size={48} />}
          />
        )
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-sm font-medium text-slate-600">
                  Project Name
                </th>
                <th className="px-6 py-4 text-sm font-medium text-slate-600">
                  Status
                </th>
                <th className="px-6 py-4 text-sm font-medium text-slate-600">
                  Last Scan
                </th>
                <th className="px-6 py-4 text-sm font-medium text-slate-600 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
{filteredProjects.map((project) => (
  <ProjectRow 
    key={project.project_id} 
    project={project} 
    reportSummaries={reportSummaries} 
  />
))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;