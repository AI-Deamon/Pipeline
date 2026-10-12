import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import { PageSkeleton } from "../PageSkeleton";
import { ErrorDisplay } from "../ui/ErrorDisplay";
import { Users, AlertTriangle } from "lucide-react";

const WORKLOAD_STATUS_SCOPE = "open,in_progress";

const DeveloperWorkloadCard = ({ developer }: { developer: { username: string; total_issues: number; critical: number; high: number; medium: number; low: number } }) => (
  <Link
    to={`/issues?assignee=${encodeURIComponent(developer.username)}&status=${WORKLOAD_STATUS_SCOPE}`}
    className="block bg-white rounded-xl border border-slate-200 shadow-sm p-4 transition-shadow hover:shadow-md hover:border-indigo-200"
  >
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center font-medium text-slate-600">
          {developer.username[0].toUpperCase()}
        </div>
        <div>
          <div className="font-medium text-slate-900">{developer.username}</div>
          <div className="text-xs text-slate-500">
            {developer.total_issues} issues assigned
          </div>
        </div>
      </div>
    </div>
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Severity Breakdown</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-200 rounded-full h-2">
          <div
            className="h-2 rounded-full bg-red-500"
            style={{
              width: `${developer.total_issues > 0 ? (developer.critical / developer.total_issues) * 100 : 0}%`,
            }}
          ></div>
        </div>
        <span className="text-xs text-slate-600 w-8 text-right">{developer.critical}C</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-200 rounded-full h-2">
          <div
            className="h-2 rounded-full bg-orange-500"
            style={{
              width: `${developer.total_issues > 0 ? (developer.high / developer.total_issues) * 100 : 0}%`,
            }}
          ></div>
        </div>
        <span className="text-xs text-slate-600 w-8 text-right">{developer.high}H</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-200 rounded-full h-2">
          <div
            className="h-2 rounded-full bg-yellow-500"
            style={{
              width: `${developer.total_issues > 0 ? (developer.medium / developer.total_issues) * 100 : 0}%`,
            }}
          ></div>
        </div>
        <span className="text-xs text-slate-600 w-8 text-right">{developer.medium}M</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-200 rounded-full h-2">
          <div
            className="h-2 rounded-full bg-green-500"
            style={{
              width: `${developer.total_issues > 0 ? (developer.low / developer.total_issues) * 100 : 0}%`,
            }}
          ></div>
        </div>
        <span className="text-xs text-slate-600 w-8 text-right">{developer.low}L</span>
      </div>
    </div>
  </Link>
);

const DashboardWorkloadTab = () => {
  const { data: workload, isLoading, isError, refetch } = useQuery({
    queryKey: ["team-workload"],
    queryFn: api.portfolio.getTeamWorkload,
    refetchInterval: 60_000,
  });

  if (isLoading) return <PageSkeleton type="dashboard" />;
  if (isError) {
    return <ErrorDisplay message="Couldn't load team workload data." onRetry={refetch} />;
  }

  const developers = workload?.developers ?? [];
  const unassigned = workload?.unassigned ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 };

  return (
    <div>
      <div className="mb-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Unassigned Issues
          </h2>
          <div className="grid grid-cols-5 gap-4 mb-4">
            <Link
              to={`/issues?assignee=unassigned&status=${WORKLOAD_STATUS_SCOPE}&severity=critical`}
              className="text-center rounded-lg p-2 -m-2 transition-colors hover:bg-red-50"
            >
              <div className="text-2xl font-bold text-red-600">{unassigned.critical}</div>
              <div className="text-xs text-slate-500">Critical</div>
            </Link>
            <Link
              to={`/issues?assignee=unassigned&status=${WORKLOAD_STATUS_SCOPE}&severity=high`}
              className="text-center rounded-lg p-2 -m-2 transition-colors hover:bg-orange-50"
            >
              <div className="text-2xl font-bold text-orange-600">{unassigned.high}</div>
              <div className="text-xs text-slate-500">High</div>
            </Link>
            <Link
              to={`/issues?assignee=unassigned&status=${WORKLOAD_STATUS_SCOPE}&severity=medium`}
              className="text-center rounded-lg p-2 -m-2 transition-colors hover:bg-yellow-50"
            >
              <div className="text-2xl font-bold text-yellow-600">{unassigned.medium}</div>
              <div className="text-xs text-slate-500">Medium</div>
            </Link>
            <Link
              to={`/issues?assignee=unassigned&status=${WORKLOAD_STATUS_SCOPE}&severity=low`}
              className="text-center rounded-lg p-2 -m-2 transition-colors hover:bg-green-50"
            >
              <div className="text-2xl font-bold text-green-600">{unassigned.low}</div>
              <div className="text-xs text-slate-500">Low</div>
            </Link>
            <Link
              to={`/issues?assignee=unassigned&status=${WORKLOAD_STATUS_SCOPE}`}
              className="text-center rounded-lg p-2 -m-2 transition-colors hover:bg-slate-50"
            >
              <div className="text-2xl font-bold text-slate-600">{unassigned.info}</div>
              <div className="text-xs text-slate-500">Info</div>
            </Link>
          </div>
          <div className="text-sm text-slate-500">
            {unassigned.total} issues need assignment
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" />
          Developer Assignments
        </h2>
        {developers.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
            <p className="text-slate-500">
              No issues assigned to developers yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {developers.map((dev) => (
              <DeveloperWorkloadCard key={dev.username} developer={dev} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardWorkloadTab;
