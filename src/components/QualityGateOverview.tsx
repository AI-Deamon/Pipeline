import { Link } from "react-router-dom";
import { Activity, Check, AlertTriangle } from "lucide-react";
import type { PortfolioProject } from "../types";

const QualityGateOverview = ({ projects }: { projects: PortfolioProject[] }) => {
  const qgProjects = projects.filter(p => p.quality_gate_status);
  const okCount = qgProjects.filter(p => p.quality_gate_status === "OK").length;
  const errorCount = qgProjects.filter(p => p.quality_gate_status === "ERROR").length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-indigo-600" />
        Quality Gate Status
      </h2>
      {qgProjects.length === 0 ? (
        <p className="text-sm text-slate-500">
          No SonarQube quality gate data available. Configure SonarQube keys on your projects to enable quality gate tracking.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-700">{okCount}</div>
              <div className="text-xs text-green-600">Passing</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-700">{errorCount}</div>
              <div className="text-xs text-red-600">Failing</div>
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {qgProjects.slice(0, 15).map(p => (
              <div key={p.project_id} className="flex items-center justify-between py-1">
                <Link to={`/projects/${p.project_id}/reports`} className="text-sm font-medium text-slate-700 hover:text-indigo-600 truncate mr-2">
                  {p.name}
                </Link>
                <span
                  className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    p.quality_gate_status === "OK"
                      ? "bg-green-50 text-green-700"
                      : p.quality_gate_status === "ERROR"
                      ? "bg-red-50 text-red-700"
                      : "bg-slate-50 text-slate-600"
                  }`}
                >
                  {p.quality_gate_status === "OK" ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  {p.quality_gate_status}
                </span>
              </div>
            ))}
          </div>
          {qgProjects.length > 15 && (
            <p className="text-xs text-slate-400 mt-2 text-center">
              +{qgProjects.length - 15} more projects
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default QualityGateOverview;
