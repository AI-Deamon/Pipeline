import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { TrendData } from "../types";
import { PageSkeleton } from "../components/PageSkeleton";
import { ErrorDisplay } from "../components/ui/ErrorDisplay";
import { getTrendIcon, getTrendDirection } from "../utils/risk";
import { TrendingUp, TrendingDown, Minus, Calendar } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const TrendSummaryCard = ({
  title,
  current,
  previous,
  trend,
  color,
}: {
  title: string;
  current: number;
  previous: number;
  trend: string;
  color: string;
}) => {
  const change = current - previous;
  const changePercent = previous > 0 ? Math.round((change / previous) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-500">{title}</span>
        <div className="flex items-center gap-1">
          {getTrendIcon(trend)}
          <span className="text-xs text-slate-500 capitalize">{trend}</span>
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold" style={{ color }}>
          {current}
        </span>
        <span
          className={`text-sm mb-1 ${
            change > 0 ? "text-red-600" : change < 0 ? "text-green-600" : "text-slate-500"
          }`}
        >
          {change > 0 ? "+" : ""}
          {change} ({changePercent > 0 ? "+" : ""}
          {changePercent}%)
        </span>
      </div>
    </div>
  );
};

const TrendChart = ({ data }: { data: TrendData[] }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
    <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
      <Calendar className="w-5 h-5 text-indigo-600" />
      Issue Count Over Time
    </h2>
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => {
              const date = new Date(value);
              return date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
            }}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
            }}
            labelFormatter={(value) => {
              const date = new Date(value);
              return date.toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              });
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="critical"
            stroke="#dc2626"
            strokeWidth={2}
            dot={{ fill: "#dc2626" }}
            name="Critical"
          />
          <Line
            type="monotone"
            dataKey="high"
            stroke="#ea580c"
            strokeWidth={2}
            dot={{ fill: "#ea580c" }}
            name="High"
          />
          <Line
            type="monotone"
            dataKey="medium"
            stroke="#ca8a04"
            strokeWidth={2}
            dot={{ fill: "#ca8a04" }}
            name="Medium"
          />
          <Line
            type="monotone"
            dataKey="low"
            stroke="#16a34a"
            strokeWidth={2}
            dot={{ fill: "#16a34a" }}
            name="Low"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

const KeyInsights = ({
  data,
}: {
  data: TrendData[];
}) => {
  const insights = useMemo(() => {
    if (data.length < 2) return [];

    const first = data[0];
    const last = data[data.length - 1];
    const insights: { text: string; type: "positive" | "negative" | "neutral" }[] = [];

    // Critical trend
    const criticalChange = last.critical - first.critical;
    if (criticalChange < 0) {
      insights.push({
        text: `Critical issues down ${Math.abs(criticalChange)} since ${new Date(first.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        type: "positive",
      });
    } else if (criticalChange > 0) {
      insights.push({
        text: `Critical issues increased by ${criticalChange} since ${new Date(first.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        type: "negative",
      });
    }

    // High trend
    const highChange = last.high - first.high;
    if (highChange < 0) {
      insights.push({
        text: `High issues down ${Math.abs(highChange)} since ${new Date(first.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        type: "positive",
      });
    } else if (highChange > 0) {
      insights.push({
        text: `High issues increased by ${highChange} since ${new Date(first.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        type: "negative",
      });
    }

    // Overall trend
    const totalFirst = first.critical + first.high + first.medium + first.low;
    const totalLast = last.critical + last.high + last.medium + last.low;
    const totalChange = totalLast - totalFirst;
    if (totalChange < 0) {
      insights.push({
        text: `Overall issues improved: ${totalFirst} → ${totalLast} (${Math.abs(totalChange)} fixed)`,
        type: "positive",
      });
    } else if (totalChange > 0) {
      insights.push({
        text: `Overall issues worsened: ${totalFirst} → ${totalLast} (+${totalChange} new)`,
        type: "negative",
      });
    } else {
      insights.push({
        text: "Overall issue count stable",
        type: "neutral",
      });
    }

    return insights;
  }, [data]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Key Insights</h2>
      <div className="space-y-3">
        {insights.length === 0 ? (
          <p className="text-slate-500 text-sm">
            Not enough data to generate insights. Need at least 2 scans.
          </p>
        ) : (
          insights.map((insight, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 p-3 rounded-lg ${
                insight.type === "positive"
                  ? "bg-green-50 text-green-800"
                  : insight.type === "negative"
                  ? "bg-red-50 text-red-800"
                  : "bg-slate-50 text-slate-800"
              }`}
            >
              <div className="mt-0.5">
                {insight.type === "positive" ? (
                  <TrendingUp className="w-4 h-4 text-green-600" />
                ) : insight.type === "negative" ? (
                  <TrendingDown className="w-4 h-4 text-red-600" />
                ) : (
                  <Minus className="w-4 h-4 text-slate-500" />
                )}
              </div>
              <span className="text-sm">{insight.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const TrendAnalysisPage = () => {
  const { data: projects = [], isLoading: loadingProjects, isError: projectsError, refetch: refetchProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });

  // Finding #106: queryFn closes over `projects` from the separate query above,
  // but the key never reflected that — TanStack Query only considers `["trends",
  // "all"]` for staleness, so a project created/deleted while this page was
  // mounted wouldn't fold into the aggregate until a full remount (a stale key
  // means "same cache entry," no refetch trigger). Deriving a stable key from
  // the actual project id set means the trends query is treated as genuinely
  // different data once that set changes.
  const projectIdsKey = useMemo(
    () => projects.map((p) => p.project_id).filter(Boolean).sort().join(","),
    [projects]
  );

  const { data: allTrends = [], isLoading: loadingTrends, isError: trendsError, refetch: refetchTrends } = useQuery({
    queryKey: ["trends", "all", projectIdsKey],
    queryFn: async () => {
      const trendPromises = projects
        .filter((project) => project.project_id)
        .map((project) =>
          api.reports.getTrends(project.project_id, 90).then(
            (trends) => [project.project_id, trends] as const
          )
        );

      const results = await Promise.allSettled(trendPromises);
      const allTrends: TrendData[] = [];

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          const [, trends] = result.value;
          allTrends.push(...trends);
        }
      });

      // Aggregate trends by date
      const aggregated: Record<string, TrendData> = {};
      allTrends.forEach((trend) => {
        if (!aggregated[trend.date]) {
          aggregated[trend.date] = {
            date: trend.date,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
          };
        }
        aggregated[trend.date].critical += trend.critical;
        aggregated[trend.date].high += trend.high;
        aggregated[trend.date].medium += trend.medium;
        aggregated[trend.date].low += trend.low;
      });

      return Object.values(aggregated).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    },
    enabled: !!projects.length,
  });

  const isLoading = loadingProjects || loadingTrends;

  if (isLoading) return <PageSkeleton type="dashboard" />;
  if (projectsError) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <ErrorDisplay message="Couldn't load project data." onRetry={refetchProjects} />
      </div>
    );
  }
  if (trendsError) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <ErrorDisplay message="Couldn't load trend data." onRetry={refetchTrends} />
      </div>
    );
  }

  const current = allTrends[allTrends.length - 1] || {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  const previous = allTrends[allTrends.length - 2] || current;

  return (
    <div className="max-w-7xl mx-auto p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Trend Analysis</h1>
        <p className="text-slate-500 mt-1">
          Security issue trends across all projects over time
        </p>
      </header>

      {allTrends.length >= 2 && (
        // Finding #107: "current"/"previous" are just the last two calendar
        // dates in the merged multi-project series, not necessarily the same
        // date across all projects — if project A scanned today but B's last
        // scan was 3 days ago, "Critical down 12" can mean fewer projects
        // contributed data that day, not that anything was actually fixed.
        // Not fixable by relabeling alone (that would need true per-project
        // date alignment, a bigger change), so surface the actual date being
        // compared instead of letting the numbers imply same-day parity.
        <p className="text-xs text-slate-400 mb-3">
          Comparing {new Date(current.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} to{" "}
          {new Date(previous.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — each date reflects
          whichever projects had scan data on that day, not all projects necessarily.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <TrendSummaryCard
          title="Critical"
          current={current.critical}
          previous={previous.critical}
          trend={getTrendDirection(current.critical, previous.critical)}
          color="#dc2626"
        />
        <TrendSummaryCard
          title="High"
          current={current.high}
          previous={previous.high}
          trend={getTrendDirection(current.high, previous.high)}
          color="#ea580c"
        />
        <TrendSummaryCard
          title="Medium"
          current={current.medium}
          previous={previous.medium}
          trend={getTrendDirection(current.medium, previous.medium)}
          color="#ca8a04"
        />
        <TrendSummaryCard
          title="Low"
          current={current.low}
          previous={previous.low}
          trend={getTrendDirection(current.low, previous.low)}
          color="#16a34a"
        />
      </div>

      <div className="mb-6">
        <TrendChart data={allTrends} />
      </div>

      <KeyInsights data={allTrends} />
    </div>
  );
};

export default TrendAnalysisPage;
