import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import type { PortfolioProject } from "../types";
import { useRbac } from "../hooks/useRbac";
import { useToast } from "../components/Toast";
import { StatusBadge } from "../components/ui/StatusBadge";
import { IconButton } from "../components/ui/IconButton";
import { ConfirmModal } from "../components/ConfirmModal";
import { getRiskScoreColor } from "../utils/risk";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Play,
  Trash2,
} from "lucide-react";

const ProjectRow = ({ project }: { project: PortfolioProject }) => {
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
    onError: () => {
      addToast({
        type: "error",
        title: "Deletion Failed",
        message: `Failed to delete project "${project.name}".`,
      });
    },
  });

  const riskScore = project.risk_score ?? 0;

  // Trend is based on quality gate improvement when available
  const trend = riskScore >= 70 ? "improving" : riskScore >= 50 ? "stable" : "worsening";

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
        <div className="flex items-center gap-2">
          <StatusBadge state={project.last_scan_state ?? null} />
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="w-16 bg-slate-200 rounded-full h-2">
            <div
              className="h-2 rounded-full"
              style={{
                width: `${riskScore}%`,
                backgroundColor: getRiskScoreColor(riskScore),
              }}
            ></div>
          </div>
          <span className="text-sm font-medium text-slate-900">{riskScore}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-1">
          {trend === "improving" ? (
            <TrendingUp className="w-4 h-4 text-green-600" />
          ) : trend === "worsening" ? (
            <TrendingDown className="w-4 h-4 text-red-600" />
          ) : (
            <Minus className="w-4 h-4 text-slate-400" />
          )}
          <span className="text-sm text-slate-600 capitalize">{trend}</span>
        </div>
      </td>
      <td className="px-6 py-4 text-right">
          <div className="flex items-center justify-end gap-2">
            <Link
              to={`/scans/${project.last_scan_id}`}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              View
            </Link>
            <Link
              to={`/projects/${project.project_id}/manual`}
              className="px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1"
            >
              <Play className="w-3 h-3" />
              Start Scan
            </Link>
            <Link
              to={`/projects/${project.project_id}/reports`}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              View Reports
            </Link>
            {project.total_findings > 0 && (
              <div className="flex items-center gap-2 ml-3">
                <div className="flex flex-col items-center text-xs">
                  <div className="font-medium">{project.total_findings}</div>
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

export default ProjectRow;
