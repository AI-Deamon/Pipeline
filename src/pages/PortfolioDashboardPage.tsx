import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import type { PortfolioProject } from "../types";
import { PageSkeleton } from "../components/PageSkeleton";
import { ErrorDisplay } from "../components/ui/ErrorDisplay";
import SeverityPieChart from "../components/SeverityPieChart";
import QualityGateOverview from "../components/QualityGateOverview";
import ToolBarChart from "../components/ToolBarChart";
import { getRiskLevel, getRiskColor } from "../utils/risk";
import {
  Shield,
  BarChart3,
  Check,
  AlertTriangle,
} from "lucide-react";

const PortfolioHealthCard = ({
  totalProjects,
  totalCritical,
  totalHigh,
  totalMedium,
  totalLow,
  totalFindings,
}: {
  totalProjects: number;
  totalCritical: number;
  totalHigh: number;
  totalMedium: number;
  totalLow: number;
  totalFindings: number;
}) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
    <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
      <Shield className="w-5 h-5 text-indigo-600" />
      Portfolio Health
    </h2>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="text-center">
        <div className="text-3xl font-bold text-slate-900">{totalProjects}</div>
        <div className="text-sm text-slate-500">Projects</div>
      </div>
      <div className="text-center">
        <div className="text-3xl font-bold text-slate-900">{totalFindings}</div>
        <div className="text-sm text-slate-500">Total Findings</div>
      </div>
      <div className="text-center">
        <div className="text-3xl font-bold text-red-600">{totalCritical}</div>
        <div className="text-sm text-slate-500">Critical</div>
      </div>
      <div className="text-center">
        <div className="text-3xl font-bold text-orange-600">{totalHigh}</div>
        <div className="text-sm text-slate-500">High</div>
      </div>
    </div>
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Severity Breakdown</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span className="text-slate-600">{totalCritical} Critical</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
            <span className="text-slate-600">{totalHigh} High</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
            <span className="text-slate-600">{totalMedium} Medium</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-slate-600">{totalLow} Low</span>
          </span>
        </div>
      </div>
    </div>
  </div>
);

const ProjectRankingTable = ({ projects }: { projects: PortfolioProject[] }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="p-4 border-b border-slate-100">
      <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-indigo-600" />
        Project Ranking (by Risk Score)
      </h2>
    </div>
    <table className="w-full text-left">
      <thead className="bg-slate-50/50 border-b border-slate-200">
        <tr>
          <th className="px-6 py-3 text-sm font-medium text-slate-600">Rank</th>
          <th className="px-6 py-3 text-sm font-medium text-slate-600">Project</th>
          <th className="px-6 py-3 text-sm font-medium text-slate-600">Risk Score</th>
          <th className="px-6 py-3 text-sm font-medium text-slate-600">Risk Level</th>
          <th className="px-6 py-3 text-sm font-medium text-slate-600">Quality Gate</th>
          <th className="px-6 py-3 text-sm font-medium text-slate-600">Findings</th>
          <th className="px-6 py-3 text-sm font-medium text-slate-600">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {projects.map((project, index) => {
          const riskLevel = getRiskLevel(project.risk_score);
          return (
            <tr key={project.project_id} className="hover:bg-slate-50/50">
              <td className="px-6 py-4 text-sm font-medium text-slate-900">
                {index + 1}
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-col">
                  <span className="font-medium text-slate-900">{project.name}</span>
                  <span className="text-sm text-slate-500">{project.project_id}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-slate-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${project.risk_score}%`,
                        backgroundColor:
                          project.risk_score >= 80
                            ? "#22c55e"
                            : project.risk_score >= 60
                            ? "#eab308"
                            : project.risk_score >= 40
                            ? "#f97316"
                            : "#ef4444",
                      }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium text-slate-900">
                    {project.risk_score}
                  </span>
                </div>
              </td>
              <td className="px-6 py-4">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskColor(riskLevel)}`}
                >
                  {riskLevel} Risk
                </span>
              </td>
              <td className="px-6 py-4">
                {project.quality_gate_status ? (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      project.quality_gate_status === "OK"
                        ? "bg-green-50 text-green-700"
                        : project.quality_gate_status === "ERROR"
                        ? "bg-red-50 text-red-700"
                        : "bg-slate-50 text-slate-600"
                    }`}
                  >
                    {project.quality_gate_status === "OK" ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    {project.quality_gate_status}
                  </span>
                ) : (
                  <span className="text-sm text-slate-400">—</span>
                )}
              </td>
              <td className="px-6 py-4 text-sm text-slate-600">
                {project.total_findings}
              </td>
              <td className="px-6 py-4">
                <Link
                  to={`/projects/${project.project_id}/reports`}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  View Reports
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const PortfolioDashboardPage = () => {
  const { data: portfolioOverview, isLoading, isError, refetch } = useQuery({
    queryKey: ["portfolio-overview"],
    queryFn: api.portfolio.getOverview,
    refetchInterval: 60_000,
  });

  const projects = useMemo(() => portfolioOverview?.projects ?? [], [portfolioOverview]);
  const severity = useMemo(() => portfolioOverview?.severity ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, [portfolioOverview]);

  const sortedProjects = useMemo(() =>
    [...projects].sort((a, b) => b.risk_score - a.risk_score),
    [projects]
  );

  const toolData = useMemo(() => {
    const toolMap: Record<string, { tool: string; findings: number; critical: number; high: number; medium: number; low: number }> = {};
    projects.forEach(p => {
      p.tools.forEach(tool => {
        if (!toolMap[tool]) {
          toolMap[tool] = { tool: tool.replace("_", " "), findings: 0, critical: 0, high: 0, medium: 0, low: 0 };
        }
      });
    });
    projects.forEach(p => {
      p.tools.forEach(tool => {
        const entry = toolMap[tool];
        if (entry) {
          entry.findings += p.total_findings / Math.max(p.tools.length, 1);
          entry.critical += p.critical / Math.max(p.tools.length, 1);
          entry.high += p.high / Math.max(p.tools.length, 1);
          entry.medium += p.medium / Math.max(p.tools.length, 1);
          entry.low += p.low / Math.max(p.tools.length, 1);
        }
      });
    });
    return Object.values(toolMap)
      .sort((a, b) => b.findings - a.findings)
      .slice(0, 5)
      .map(t => ({ ...t, findings: Math.round(t.findings), critical: Math.round(t.critical), high: Math.round(t.high), medium: Math.round(t.medium), low: Math.round(t.low) }));
  }, [projects]);

  const totalFindings = portfolioOverview?.total_findings ?? 0;

  if (isLoading) return <PageSkeleton type="dashboard" />;
  if (isError) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <ErrorDisplay message="Couldn't load portfolio data." onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          Security Dashboard
        </h1>
        <p className="text-slate-500 mt-1">
          Cross-project security overview and portfolio health
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <PortfolioHealthCard
          totalProjects={projects.length}
          totalCritical={severity.critical}
          totalHigh={severity.high}
          totalMedium={severity.medium}
          totalLow={severity.low}
          totalFindings={totalFindings}
        />
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <SeverityPieChart
            critical={severity.critical}
            high={severity.high}
            medium={severity.medium}
            low={severity.low}
            info={severity.info}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <QualityGateOverview projects={projects} />
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <ToolBarChart tools={toolData} />
        </div>
      </div>

      <ProjectRankingTable projects={sortedProjects} />
    </div>
  );
};

export default PortfolioDashboardPage;
