import type { ReactNode } from 'react';
import {
  Download,
  ExternalLink,
  ListChecks,
  Clock,
  Calendar,
  Target,
  Zap,
  Code,
} from 'lucide-react';

interface ScanInfo {
  scanId: string;
  date: string;
  duration: string;
  mode: string;
  target: string;
}

interface SeveritySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

interface ProjectReportLayoutProps {
  scanInfo: ScanInfo;
  severity: SeveritySummary;
  projectId: string;
  scanId?: string;
  onExport: () => void;
  exportLoading: boolean;
  children: ReactNode;
}

const severityColors = {
  critical: { text: 'text-red-700', bg: 'bg-red-50', dot: 'bg-red-500' },
  high: { text: 'text-orange-700', bg: 'bg-orange-50', dot: 'bg-orange-500' },
  medium: { text: 'text-yellow-700', bg: 'bg-yellow-50', dot: 'bg-yellow-500' },
  low: { text: 'text-green-700', bg: 'bg-green-50', dot: 'bg-green-500' },
  info: { text: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400' },
};

// Redesigned per partner feedback: the previous version was a 4-card, fixed-height
// sidebar (Scan Info / Severity / Tools / Actions) with its own internal scroll
// region — on a real project it grew taller than the viewport and pushed the
// "Select a Tool" empty state below the fold, so getting to any findings meant
// scrolling the sidebar *and* clicking a tool first. Tools moved into the findings
// list itself as filter chips (see FindingsTable); everything else here collapses
// into one compact header so findings get the page's full width and height.
export const ProjectReportLayout = ({
  scanInfo,
  severity,
  projectId,
  scanId,
  onExport,
  exportLoading,
  children,
}: ProjectReportLayoutProps) => {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono text-slate-800">{scanInfo.scanId.slice(0, 8)}...</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {scanInfo.date}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {scanInfo.duration}
            </span>
            <span className="capitalize">{scanInfo.mode}</span>
            {scanInfo.target && (
              <span className="flex items-center gap-1.5 font-mono text-slate-500 truncate max-w-xs">
                <Target className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {scanInfo.target}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {scanId && (
              <a
                href={`/projects/${projectId}/reports/${scanId}/developer`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-xs font-medium transition-colors"
              >
                <Code className="w-3.5 h-3.5" />
                Developer View
              </a>
            )}
            <button
              onClick={onExport}
              disabled={exportLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {exportLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Export PDF
            </button>
            <a
              href={`/projects/${projectId}/reports/unified`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-xs font-medium transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Unified Report
            </a>
            <a
              href={`/projects/${projectId}/issues`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-xs font-medium transition-colors"
            >
              <ListChecks className="w-3.5 h-3.5" />
              Issues
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          {(['critical', 'high', 'medium', 'low', 'info'] as const).map((sev) => (
            <span
              key={sev}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${severityColors[sev].bg} ${severityColors[sev].text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${severityColors[sev].dot}`} />
              <span className="capitalize">{sev}</span>
              <span className="font-semibold">{severity[sev]}</span>
            </span>
          ))}
        </div>
      </div>

      {children}
    </div>
  );
};
