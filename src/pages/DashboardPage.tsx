import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import {
  Plus,
  Search,
  X,
  Loader2,
  Shield,
  ShieldAlert,
  User,
  AlertTriangle,
  CheckCircle,
  BarChart3,
} from "lucide-react";
import { useDebounce } from "../hooks/useDebounce";
import { useRbac } from "../hooks/useRbac";
import { PageSkeleton } from "../components/PageSkeleton";
import { OnboardingChecklist } from "../components/OnboardingChecklist";
import EmptyState from "../components/EmptyState";
import SeverityPieChart from "../components/SeverityPieChart";
import TrendLineChart from "../components/TrendLineChart";
import QualityGateOverview from "../components/QualityGateOverview";
import ProjectRow from "../components/ProjectRow";
import { getRiskLevel } from "../utils/risk";

const ACTIVE_STATES = new Set(["CREATED", "QUEUED", "RUNNING"]);
const STATUS_FILTERS = ["All", "Running", "Completed", "Failed"] as const;
const RISK_FILTERS = ["All", "Low", "Medium", "High", "Critical"] as const;

const StatsCard = ({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
}) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      <div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-sm text-slate-500">{label}</div>
      </div>
    </div>
  </div>
);

const DashboardPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [riskFilter, setRiskFilter] = useState<string>("All");
  const { isAdmin, canViewAllProjects } = useRbac();

  const { data: projects = [], isLoading: loading, error: projectsError, refetch: refetchProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });

  const { data: portfolioOverview, isLoading: portfolioLoading } = useQuery({
    queryKey: ["portfolio-overview"],
    queryFn: api.portfolio.getOverview,
    enabled: !!projects.length,
    refetchInterval: 60_000,
  });

  const { data: portfolioTrends } = useQuery({
    queryKey: ["portfolio-trends"],
    queryFn: () => api.portfolio.getTrends(6),
    enabled: !!projects.length,
    refetchInterval: 120_000,
  });

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const portfolioProjects = useMemo(() => {
    if (!portfolioOverview) return [];
    return portfolioOverview.projects;
  }, [portfolioOverview]);

  const activeScanProjects = useMemo(
    () => portfolioProjects.filter((p) => ACTIVE_STATES.has(p.last_scan_state ?? "")),
    [portfolioProjects]
  );

  const stats = useMemo(() => {
    let totalFindings = 0;
    let totalCritical = 0;
    let totalRiskScore = 0;
    let projectsWithRisk = 0;

    for (const p of portfolioProjects) {
      totalFindings += p.total_findings;
      totalCritical += p.critical;
      totalRiskScore += p.risk_score;
      projectsWithRisk++;
    }

    return {
      totalProjects: projects.length,
      totalFindings,
      totalCritical,
      avgRiskScore: projectsWithRisk > 0 ? Math.round(totalRiskScore / projectsWithRisk) : 0,
    };
  }, [portfolioProjects, projects.length]);

  const filteredProjects = useMemo(() => {
    let result = portfolioProjects;

    if (debouncedSearchTerm) {
      const lowerSearch = debouncedSearchTerm.toLowerCase();
      result = result.filter((p) =>
        p.name.toLowerCase().includes(lowerSearch)
      );
    }

    if (statusFilter !== "All") {
      result = result.filter((p) => {
        const state = p.last_scan_state;
        if (statusFilter === "Running") return ACTIVE_STATES.has(state ?? "");
        if (statusFilter === "Completed") return state === "COMPLETED";
        if (statusFilter === "Failed") return state === "FAILED";
        return true;
      });
    }

    if (riskFilter !== "All") {
      result = result.filter((p) => {
        const riskLevel = getRiskLevel(p.risk_score);
        return riskLevel === riskFilter;
      });
    }

    return result;
  }, [portfolioProjects, debouncedSearchTerm, statusFilter, riskFilter]);

  const isLoading = loading || portfolioLoading;

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatsCard
          icon={<BarChart3 className="w-5 h-5 text-indigo-600" />}
          label="Total Projects"
          value={stats.totalProjects}
          color="bg-indigo-50"
        />
        <StatsCard
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          label="Critical Issues"
          value={stats.totalCritical}
          color="bg-red-50"
        />
        <StatsCard
          icon={<CheckCircle className="w-5 h-5 text-green-600" />}
          label="Total Findings"
          value={stats.totalFindings}
          color="bg-green-50"
        />
        <StatsCard
          icon={<Shield className="w-5 h-5 text-slate-600" />}
          label="Avg Risk Score"
          value={stats.avgRiskScore}
          color="bg-slate-50"
        />
      </div>

      {portfolioOverview && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <SeverityPieChart
              critical={portfolioOverview.severity.critical}
              high={portfolioOverview.severity.high}
              medium={portfolioOverview.severity.medium}
              low={portfolioOverview.severity.low}
              info={portfolioOverview.severity.info}
            />
          </div>
          <QualityGateOverview projects={portfolioOverview.projects} />
        </div>
      )}

      {portfolioTrends && portfolioTrends.trends.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
          <TrendLineChart data={portfolioTrends.trends.map(t => ({
            date: t.month,
            critical: t.critical,
            high: t.high,
            medium: t.medium,
            low: t.low,
            coverage_avg: t.coverage_avg,
          }))} />
        </div>
      )}

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
        <div className="px-4 pb-4 flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Status:</span>
            <div className="flex gap-1">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    statusFilter === filter
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Risk:</span>
            <div className="flex gap-1">
              {RISK_FILTERS.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setRiskFilter(filter)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    riskFilter === filter
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {projectsError ? (
        // Previously a failed fetch fell straight through to the "no projects" empty
        // state below — indistinguishable from a genuinely empty account, so a failed
        // fetch could read as "this project has no issues" (finding #60).
        <EmptyState
          variant="error"
          title="Couldn't load projects"
          message={projectsError instanceof Error ? projectsError.message : "Something went wrong."}
          action={{ label: "Retry", onClick: () => refetchProjects() }}
        />
      ) : filteredProjects.length === 0 ? (
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
                  Risk Score
                </th>
                <th className="px-6 py-4 text-sm font-medium text-slate-600">
                  Trend
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
