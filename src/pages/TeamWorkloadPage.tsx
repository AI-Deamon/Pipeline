import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import { PageSkeleton } from "../components/PageSkeleton";
import { ErrorDisplay } from "../components/ui/ErrorDisplay";
import { Users, AlertTriangle } from "lucide-react";

const DeveloperWorkloadCard = ({ developer }: { developer: { username: string; total_issues: number; critical: number; high: number; medium: number; low: number } }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
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
  </div>
);

const TeamWorkloadPage = () => {
  const { data: workload, isLoading, isError, refetch } = useQuery({
    queryKey: ["team-workload"],
    queryFn: api.portfolio.getTeamWorkload,
    refetchInterval: 60_000,
  });

  if (isLoading) return <PageSkeleton type="dashboard" />;
  if (isError) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <ErrorDisplay message="Couldn't load team workload data." onRetry={refetch} />
      </div>
    );
  }

  const developers = workload?.developers ?? [];
  const unassigned = workload?.unassigned ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 };

  return (
    <div className="max-w-7xl mx-auto p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Team Workload</h1>
        <p className="text-slate-500 mt-1">
          Developer assignments and unassigned issues across all projects
        </p>
      </header>

      <div className="mb-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Unassigned Issues
          </h2>
          <div className="grid grid-cols-5 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{unassigned.critical}</div>
              <div className="text-xs text-slate-500">Critical</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{unassigned.high}</div>
              <div className="text-xs text-slate-500">High</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{unassigned.medium}</div>
              <div className="text-xs text-slate-500">Medium</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{unassigned.low}</div>
              <div className="text-xs text-slate-500">Low</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-600">{unassigned.info}</div>
              <div className="text-xs text-slate-500">Info</div>
            </div>
          </div>
          <div className="text-sm text-slate-500">
            {unassigned.total} issues need assignment
          </div>
        </div>
      </div>

      <div className="mb-6">
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

export default TeamWorkloadPage;
