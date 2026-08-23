// Single source of truth for severity levels and their visual encodings.
// Previously the level list and the hex/badge colors were re-declared independently
// in FilterBar, SeverityPieChart, DashboardPage, FindingsTable, ToolsTable, ToolCard,
// and IssueDetailPanel — which drifted (e.g. FilterBar silently omitted "Info", so
// Info-severity findings could never be filtered). Import from here instead.

export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

// Ordered most→least severe. Use for filter option lists and sorting.
export const SEVERITY_LEVELS: SeverityLevel[] = ['Critical', 'High', 'Medium', 'Low', 'Info'];

// Hex colors for chart marks (recharts Cell, inline SVG) — cannot use Tailwind classes there.
export const SEVERITY_HEX: Record<Lowercase<SeverityLevel>, string> = {
  critical: '#dc2626', // red-600
  high: '#ea580c',     // orange-600
  medium: '#ca8a04',   // yellow-600
  low: '#16a34a',      // green-600
  info: '#4b5563',     // gray-600
};

// Map a severity string (any case) to a chart hex color, falling back to neutral gray.
export function severityHex(severity: string | null | undefined): string {
  if (!severity) return SEVERITY_HEX.info;
  return SEVERITY_HEX[severity.toLowerCase() as Lowercase<SeverityLevel>] ?? SEVERITY_HEX.info;
}

// Tailwind bg/text classes for pill-style badges that render outside the shared
// <Badge> component (e.g. inline `<span>` severity chips). Finding #59: two call
// sites (RescanRequestCard, ToolDetailViewPage) each independently duplicated this
// exact mapping and both used blue for "low", while the chart palette above
// (SEVERITY_HEX) uses green for "low" — same severity read as two different colors
// depending on which screen you were on. Kept in sync with SEVERITY_HEX's color
// families (red/orange/yellow/green/gray) rather than introducing a third scheme.
export function severityPillClass(severity: string | null | undefined): string {
  switch ((severity ?? '').toLowerCase()) {
    case 'critical': return 'bg-red-100 text-red-700';
    case 'high': return 'bg-orange-100 text-orange-700';
    case 'medium': return 'bg-yellow-100 text-yellow-700';
    case 'low': return 'bg-green-100 text-green-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

// Map a severity string (any case) to a shared <Badge> variant for pill rendering.
export type SeverityBadgeVariant = 'danger' | 'warning' | 'info' | 'default';
export function severityBadgeVariant(severity: string | null | undefined): SeverityBadgeVariant {
  switch ((severity ?? '').toLowerCase()) {
    case 'critical':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
      return 'warning';
    case 'low':
      return 'info';
    default:
      return 'default';
  }
}
