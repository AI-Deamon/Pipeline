import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { ReportSummary } from "../types";
import { PageSkeleton } from "../components/PageSkeleton";
import { ErrorDisplay } from "../components/ui/ErrorDisplay";
import { RiskGauge } from "../components/RiskGauge";
import { getRiskLevel, getRiskColor, getTrendIcon } from "../utils/risk";
import {
  ShieldCheck,
  ClipboardList,
  Download,
  Flame,
  CircleCheck,
} from "lucide-react";

const ExecutiveSummaryPage = () => {
  const { data: projects = [], isLoading: loadingProjects, isError: projectsError, refetch: refetchProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });

  const { data: reportSummaries = {}, isLoading: loadingReports, isError: reportsError, refetch: refetchReports } = useQuery({
    queryKey: ["report-summaries"],
    queryFn: async () => {
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
    enabled: !!projects.length,
  });

  const projectsWithRisk = useMemo(() => {
    return projects.map((project) => {
      const summary = reportSummaries[project.project_id];
      const critical = summary?.severity?.critical ?? 0;
      const high = summary?.severity?.high ?? 0;
      const medium = summary?.severity?.medium ?? 0;
      const low = summary?.severity?.low ?? 0;
      const totalFindings = summary?.total_findings ?? 0;

      // Consume backend-computed risk score instead of duplicating formula.
      // trend is null when the backend has too little recent history to compute a
      // real direction — in that case we hide the indicator rather than fake "stable".
      const riskScore = summary?.risk_score?.score ?? 0;
      const riskLevel = summary?.risk_score?.level ?? "Unknown";
      const trend = summary?.risk_score?.trend ?? null;

      return {
        ...project,
        riskScore,
        riskLevel,
        trend,
        totalFindings,
        critical,
        high,
        medium,
        low,
      };
    });
  }, [projects, reportSummaries]);

  const isLoading = loadingProjects || loadingReports;

  if (isLoading) return <PageSkeleton type="dashboard" />;
  if (projectsError) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <ErrorDisplay message="Couldn't load executive summary data." onRetry={refetchProjects} />
      </div>
    );
  }
  if (reportsError) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <ErrorDisplay message="Couldn't load report summaries." onRetry={refetchReports} />
      </div>
    );
  }

  const totalCritical = projectsWithRisk.reduce((sum, p) => sum + p.critical, 0);
  const totalHigh = projectsWithRisk.reduce((sum, p) => sum + p.high, 0);
  const totalMedium = projectsWithRisk.reduce((sum, p) => sum + p.medium, 0);
  const totalLow = projectsWithRisk.reduce((sum, p) => sum + p.low, 0);
  const totalFindings = projectsWithRisk.reduce((sum, p) => sum + p.totalFindings, 0);

  const avgRiskScore = projectsWithRisk.length > 0
    ? Math.round(
        projectsWithRisk.reduce((sum, p) => sum + p.riskScore, 0) / projectsWithRisk.length
      )
    : 0;
  const avgRiskLevel = projectsWithRisk.length > 0 ? getRiskLevel(avgRiskScore) : "Unknown";

  const topRisks = projectsWithRisk
    .filter((p) => p.critical > 0)
    .sort((a, b) => b.critical - a.critical)
    .slice(0, 3);

  return (
    <div className="max-w-7xl mx-auto p-8">
      <header className="mb-10 flex items-end justify-between gap-6">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] uppercase text-teal-700/80 mb-2">
            Portfolio overview
          </p>
          <h1 className="font-display text-3xl font-semibold text-slate-900 tracking-tight">
            Executive summary
          </h1>
          <p className="text-slate-500 mt-1.5 max-w-md">
            Security posture across {projectsWithRisk.length || "your"} project{projectsWithRisk.length === 1 ? "" : "s"}, for leadership review.
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Portfolio-wide PDF export is not available yet — export individual project reports from their Reports page."
          aria-disabled="true"
          className="px-4 py-2.5 bg-slate-100 text-slate-400 rounded-lg text-sm font-medium flex items-center gap-2 cursor-not-allowed shrink-0"
        >
          <Download className="w-4 h-4" />
          Export PDF (coming soon)
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-5 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-700" />
            Security posture
          </h2>
          <div className="flex items-center gap-5 mb-5">
            <RiskGauge score={avgRiskScore} size={88} />
            <div>
              <div className="text-xs text-slate-500">Average risk score, out of 100</div>
              <div
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium mt-1.5 ${getRiskColor(
                  avgRiskLevel
                )}`}
              >
                {avgRiskLevel} risk
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 pt-5 border-t border-slate-100">
            <div>
              <div className="tabular-nums text-2xl font-semibold text-slate-900">
                {projectsWithRisk.length}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Projects</div>
            </div>
            <div>
              <div className="tabular-nums text-2xl font-semibold text-slate-900">
                {totalFindings}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Total findings</div>
            </div>
            <div>
              <div className="tabular-nums text-2xl font-semibold text-red-600">{totalCritical}</div>
              <div className="text-xs text-slate-500 mt-0.5">Critical</div>
            </div>
            <div>
              <div className="tabular-nums text-2xl font-semibold text-orange-600">{totalHigh}</div>
              <div className="text-xs text-slate-500 mt-0.5">High</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-5 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-teal-700" />
            Key metrics
          </h2>
          <div className="space-y-3.5">
            {[
              { label: "Total issues", value: totalFindings, className: "text-slate-900" },
              { label: "Critical issues", value: totalCritical, className: "text-red-600" },
              { label: "High issues", value: totalHigh, className: "text-orange-600" },
              { label: "Medium issues", value: totalMedium, className: "text-amber-600" },
              { label: "Low issues", value: totalLow, className: "text-emerald-600" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{row.label}</span>
                <span className={`tabular-nums font-medium ${row.className}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-5 flex items-center gap-2">
          <Flame className="w-4 h-4 text-red-600" />
          Top risks — require immediate attention
        </h2>
        {topRisks.length === 0 ? (
          <div className="flex items-center gap-3 py-2 text-slate-500 text-sm">
            <CircleCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            No critical issues found across projects.
          </div>
        ) : (
          <div className="space-y-2.5">
            {topRisks.map((project, index) => (
              <div
                key={project.project_id}
                className="flex items-center gap-4 p-3.5 bg-red-50/60 border border-red-100 rounded-xl transition-colors hover:bg-red-50"
              >
                <div className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md bg-red-100 text-sm font-semibold text-red-700 tabular-nums">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{project.name}</div>
                  <div className="text-sm text-slate-600">
                    {project.critical} critical vulnerabilit{project.critical === 1 ? "y" : "ies"}
                  </div>
                </div>
                <div
                  className={`tabular-nums shrink-0 px-2.5 py-1 rounded-md text-xs font-medium ${getRiskColor(
                    project.riskLevel
                  )}`}
                >
                  Risk: {project.riskScore}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">All projects</h2>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50/50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Project
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Risk score
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Risk level
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Findings
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Trend
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projectsWithRisk.map((project) => (
              <tr key={project.project_id} className="transition-colors hover:bg-slate-50/70">
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-900">{project.name}</div>
                  <div className="text-sm text-slate-500">{project.project_id}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-slate-200 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-[width] duration-300"
                        style={{
                          width: `${project.riskScore}%`,
                          backgroundColor:
                            project.riskScore >= 80
                              ? "#22c55e"
                              : project.riskScore >= 60
                              ? "#eab308"
                              : project.riskScore >= 40
                              ? "#f97316"
                              : "#ef4444",
                        }}
                      ></div>
                    </div>
                    <span className="tabular-nums text-sm font-medium text-slate-900">
                      {project.riskScore}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${getRiskColor(
                      project.riskLevel
                    )}`}
                  >
                    {project.riskLevel}
                  </span>
                </td>
                <td className="tabular-nums px-6 py-4 text-sm text-slate-600">
                  {project.totalFindings}
                </td>
                <td className="px-6 py-4">
                  {project.trend ? (
                    <div className="flex items-center gap-1.5">
                      {getTrendIcon(project.trend)}
                      <span className="text-sm text-slate-600 capitalize">
                        {project.trend}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400" title="Not enough recent scans to compute a trend">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveSummaryPage;
