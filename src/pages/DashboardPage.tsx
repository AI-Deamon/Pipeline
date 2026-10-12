import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
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
  LayoutDashboard,
  TrendingUp,
  Users,
} from "lucide-react";
import { useDebounce } from "../hooks/useDebounce";
import { useRbac } from "../hooks/useRbac";
import { PageSkeleton } from "../components/PageSkeleton";
import { OnboardingChecklist } from "../components/OnboardingChecklist";
import EmptyState from "../components/EmptyState";
import SeverityPieChart from "../components/SeverityPieChart";
import QualityGateOverview from "../components/QualityGateOverview";
import ToolBarChart from "../components/ToolBarChart";
import ProjectRow from "../components/ProjectRow";
import DashboardTrendsTab from "../components/dashboard/DashboardTrendsTab";
import DashboardWorkloadTab from "../components/dashboard/DashboardWorkloadTab";
import { getRiskLevel } from "../utils/risk";

const ACTIVE_STATES = new Set(["CREATED", "QUEUED", "RUNNING"]);
const STATUS_FILTERS = ["All", "Running", "Completed", "Failed"] as const;
const RISK_FILTERS = ["All", "Low", "Medium", "High", "Critical"] as const;

type TabId = "overview" | "trends" | "workload";
const TABS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "trends", label: "Trends", icon: TrendingUp },
  { id: "workload", label: "Team Workload", icon: Users },
];

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

const DashboardOverviewTab = () => {
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

  // Top tools by finding volume across the portfolio — same shape PortfolioDashboardPage
  // used to compute independently; folded in here since it's the only piece of that
  // page's content that wasn't already a duplicate of what's on this page.
  const toolData = useMemo(() => {
    const toolMap: Record<string, { tool: string; findings: number; critical: number; high: number; medium: number; low: number }> = {};
    portfolioProjects.forEach((p) => {
      p.tools.forEach((tool) => {
        if (!toolMap[tool]) {
          toolMap[tool] = { tool: tool.replace("_", " "), findings: 0, critical: 0, high: 0, medium: 0, low: 0 };
        }
      });
    });
    portfolioProjects.forEach((p) => {
      p.tools.forEach((tool) => {
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
      .map((t) => ({ ...t, findings: Math.round(t.findings), critical: Math.round(t.critical), high: Math.round(t.high), medium: Math.round(t.medium), low: Math.round(t.low) }));
  }, [portfolioProjects]);

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
    <div>
      <div className="flex items-center justify-end gap-3 mb-6">
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
        <>
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

          {toolData.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
              <ToolBarChart tools={toolData} />
            </div>
          )}
        </>
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

const DashboardPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: TabId = (["overview", "trends", "workload"] as const).includes(
    searchParams.get("tab") as TabId
  )
    ? (searchParams.get("tab") as TabId)
    : "overview";

  return (
    <div className="max-w-6xl mx-auto p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">
          Projects, portfolio health, trends, and team workload in one place.
        </p>
      </header>

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSearchParams(id === "overview" ? {} : { tab: id })}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === id
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <DashboardOverviewTab />}
      {activeTab === "trends" && <DashboardTrendsTab />}
      {activeTab === "workload" && <DashboardWorkloadTab />}
    </div>
  );
};

export default DashboardPage;
