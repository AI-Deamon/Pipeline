export const getRiskLevel = (score: number): string => {
  if (score >= 80) return "Low";
  if (score >= 60) return "Medium";
  if (score >= 40) return "High";
  return "Critical";
};

export const getRiskColor = (level: string): string => {
  switch (level) {
    case "Low": return "text-green-600 bg-green-50";
    case "Medium": return "text-yellow-600 bg-yellow-50";
    case "High": return "text-orange-600 bg-orange-50";
    case "Critical": return "text-red-600 bg-red-50";
    default: return "text-slate-600 bg-slate-50";
  }
};

export const getRiskScoreColor = (score: number): string => {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  if (score >= 40) return "#f97316";
  return "#ef4444";
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-700 bg-red-50 ring-1 ring-inset ring-red-600/15",
  high: "text-orange-700 bg-orange-50 ring-1 ring-inset ring-orange-600/15",
  medium: "text-amber-700 bg-amber-50 ring-1 ring-inset ring-amber-600/15",
  low: "text-emerald-700 bg-emerald-50 ring-1 ring-inset ring-emerald-600/15",
  info: "text-slate-600 bg-slate-100 ring-1 ring-inset ring-slate-500/10",
};

export const getSeverityColor = (severity: string): string =>
  SEVERITY_COLORS[severity.toLowerCase()] ?? SEVERITY_COLORS.info;

const SEVERITY_DOT_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
  info: "bg-slate-400",
};

export const getSeverityDotColor = (severity: string): string =>
  SEVERITY_DOT_COLORS[severity.toLowerCase()] ?? SEVERITY_DOT_COLORS.info;

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ReactNode } from "react";

export const getTrendIcon = (trend: string): ReactNode => {
  switch (trend) {
    case "improving": return <TrendingUp className="w-4 h-4 text-green-600" />;
    case "worsening": return <TrendingDown className="w-4 h-4 text-red-600" />;
    default: return <Minus className="w-4 h-4 text-slate-400" />;
  }
};

export const getTrendDirection = (current: number, previous: number): string => {
  if (current < previous) return "improving";
  if (current > previous) return "worsening";
  return "stable";
};
