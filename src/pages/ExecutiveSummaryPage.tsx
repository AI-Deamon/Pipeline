import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { ReportSummary } from "../types";
import { PageSkeleton } from "../components/PageSkeleton";
import { ErrorDisplay } from "../components/ui/ErrorDisplay";
import { getRiskLevel, getRiskColor, getTrendIcon } from "../utils/risk";
import {
  Shield,
  FileText,
  Download,
  AlertTriangle,
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
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Executive Summary
          </h1>
          <p className="text-slate-500 mt-1">
            Security posture overview for leadership
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Portfolio-wide PDF export is not available yet — export individual project reports from their Reports page."
          aria-disabled="true"
          className="px-4 py-2 bg-slate-100 text-slate-400 rounded-lg text-sm font-medium flex items-center gap-2 cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Export PDF (coming soon)
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            Security Posture
          </h2>
          <div className="flex items-center gap-4 mb-4">
            <div className="text-5xl font-bold text-slate-900">{avgRiskScore}</div>
            <div>
              <div className="text-sm text-slate-500">out of 100</div>
              <div
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium mt-1 ${getRiskColor(
                  avgRiskLevel
                )}`}
              >
                {avgRiskLevel} Risk
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 pt-4 border-t border-slate-100">
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-900">
                {projectsWithRisk.length}
              </div>
              <div className="text-xs text-slate-500">Projects</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-900">
                {totalFindings}
              </div>
              <div className="text-xs text-slate-500">Total Findings</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{totalCritical}</div>
              <div className="text-xs text-slate-500">Critical</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{totalHigh}</div>
              <div className="text-xs text-slate-500">High</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            Key Metrics
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Total Issues</span>
              <span className="font-medium text-slate-900">{totalFindings}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Critical Issues</span>
              <span className="font-medium text-red-600">{totalCritical}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">High Issues</span>
              <span className="font-medium text-orange-600">{totalHigh}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Medium Issues</span>
              <span className="font-medium text-yellow-600">{totalMedium}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Low Issues</span>
              <span className="font-medium text-green-600">{totalLow}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          Top Risks (Require Immediate Attention)
        </h2>
        {topRisks.length === 0 ? (
          <p className="text-slate-500 text-sm">
            No critical issues found across projects.
          </p>
        ) : (
          <div className="space-y-3">
            {topRisks.map((project, index) => (
              <div
                key={project.project_id}
                className="flex items-center gap-4 p-3 bg-red-50 rounded-lg"
              >
                <div className="text-lg font-bold text-red-600">{index + 1}</div>
                <div className="flex-1">
                  <div className="font-medium text-slate-900">{project.name}</div>
                  <div className="text-sm text-slate-600">
                    {project.critical} critical vulnerabilities
                  </div>
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-medium ${getRiskColor(
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">All Projects</h2>
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-50/50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-sm font-medium text-slate-600">
                Project
              </th>
              <th className="px-6 py-3 text-sm font-medium text-slate-600">
                Risk Score
              </th>
              <th className="px-6 py-3 text-sm font-medium text-slate-600">
                Risk Level
              </th>
              <th className="px-6 py-3 text-sm font-medium text-slate-600">
                Findings
              </th>
              <th className="px-6 py-3 text-sm font-medium text-slate-600">
                Trend
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projectsWithRisk.map((project) => (
              <tr key={project.project_id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-900">{project.name}</div>
                  <div className="text-sm text-slate-500">{project.project_id}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-slate-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full"
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
                    <span className="text-sm font-medium text-slate-900">
                      {project.riskScore}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskColor(
                      project.riskLevel
                    )}`}
                  >
                    {project.riskLevel}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {project.totalFindings}
                </td>
                <td className="px-6 py-4">
                  {project.trend ? (
                    <div className="flex items-center gap-1">
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
  );
};

export default ExecutiveSummaryPage;
