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

interface ToolCard {
  name: string;
  key: string;
  status: 'pass' | 'fail' | 'warn' | 'skipped';
  findings: number;
  link?: string;
}

interface ProjectReportLayoutProps {
  scanInfo: ScanInfo;
  severity: SeveritySummary;
  tools: ToolCard[];
  projectId: string;
  scanId?: string;
  selectedTool?: string | null;
  onToolSelect?: (tool: string | null) => void;
  onExport: () => void;
  exportLoading: boolean;
  children: ReactNode;
}

const statusConfig = {
  pass: { icon: '✓', color: 'text-green-600 bg-green-50', label: 'Pass' },
  fail: { icon: '✗', color: 'text-red-600 bg-red-50', label: 'Fail' },
  warn: { icon: '!', color: 'text-amber-600 bg-amber-50', label: 'Warning' },
  skipped: { icon: '–', color: 'text-slate-400 bg-slate-50', label: 'Skipped' },
};

const severityColors = {
  critical: { text: 'text-red-600', bg: 'bg-red-50' },
  high: { text: 'text-orange-600', bg: 'bg-orange-50' },
  medium: { text: 'text-yellow-600', bg: 'bg-yellow-50' },
  low: { text: 'text-green-600', bg: 'bg-green-50' },
  info: { text: 'text-slate-500', bg: 'bg-slate-50' },
};

export const ProjectReportLayout = ({
  scanInfo,
  severity,
  tools,
  projectId,
  scanId,
  selectedTool,
  onToolSelect,
  onExport,
  exportLoading,
  children,
}: ProjectReportLayoutProps) => {
  const totalFindings = severity.critical + severity.high + severity.medium + severity.low + severity.info;

  return (
    <div className="flex gap-6 h-[calc(100vh-12rem)]">
      {/* Left Panel - Fixed */}
      <div className="w-80 flex-shrink-0 space-y-4 overflow-y-auto">
        {/* Scan Info Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Scan Info</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500">ID:</span>
              <span className="font-mono text-slate-900 truncate">{scanInfo.scanId.slice(0, 12)}...</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500">Date:</span>
              <span className="text-slate-900">{scanInfo.date}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500">Duration:</span>
              <span className="text-slate-900">{scanInfo.duration}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Target className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500">Mode:</span>
              <span className="text-slate-900 capitalize">{scanInfo.mode}</span>
            </div>
            {scanInfo.target && (
              <div className="flex items-center gap-2 text-sm">
                <Target className="w-4 h-4 text-slate-400" />
                <span className="text-slate-500">Target:</span>
                <span className="font-mono text-slate-900 truncate">{scanInfo.target}</span>
              </div>
            )}
          </div>
        </div>

        {/* Severity Summary Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Severity Summary
            <span className="ml-2 text-xs font-normal text-slate-500">({totalFindings} total)</span>
          </h3>
          <div className="space-y-2">
            {(['critical', 'high', 'medium', 'low', 'info'] as const).map((sev) => (
              <div key={sev} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${severityColors[sev].bg}`} />
                  <span className="text-sm text-slate-600 capitalize">{sev}</span>
                </div>
                <span className={`text-sm font-semibold ${severityColors[sev].text}`}>
                  {severity[sev]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Tools Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Tools</h3>
          <div className="space-y-2">
            {tools.map((tool) => {
              const config = statusConfig[tool.status];
              const isSelected = selectedTool === tool.key;
              return (
                <button
                  key={tool.key}
                  onClick={() => onToolSelect?.(isSelected ? null : tool.key)}
                  className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                    isSelected 
                      ? 'bg-indigo-50 border border-indigo-200' 
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${config.color}`}>
                      {config.icon}
                    </span>
                    <span className={`text-sm font-medium ${isSelected ? 'text-indigo-900' : 'text-slate-900'}`}>
                      {tool.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${isSelected ? 'text-indigo-600' : 'text-slate-600'}`}>
                      {tool.findings}
                    </span>
                    {tool.link && (
                      <a
                        href={tool.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Actions</h3>
          <div className="space-y-2">
            {scanId && (
              <a
                href={`/projects/${projectId}/reports/${scanId}/developer`}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
              >
                <Code className="w-4 h-4" />
                Developer View
              </a>
            )}
            <button
              onClick={onExport}
              disabled={exportLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {exportLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Export PDF
            </button>
            <a
              href={`/projects/${projectId}/reports/unified`}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View Unified Report
            </a>
            <a
              href={`/projects/${projectId}/issues`}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors"
            >
              <ListChecks className="w-4 h-4" />
              View Issues
            </a>
          </div>
        </div>
      </div>

      {/* Right Panel - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
};
