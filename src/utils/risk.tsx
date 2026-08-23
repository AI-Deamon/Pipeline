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
