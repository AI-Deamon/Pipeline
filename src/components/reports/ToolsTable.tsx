import type { ToolSummary, ScanStage } from '../../types';

const severityColors: Record<string, { text: string; bg: string }> = {
  Critical: { text: 'text-[#A32D2D]', bg: 'bg-[#FCEBEB]' },
  High: { text: 'text-[#854F0B]', bg: 'bg-[#FAEEDA]' },
  Medium: { text: 'text-[#185FA5]', bg: 'bg-[#E6F1FB]' },
  Low: { text: 'text-[#3B6D11]', bg: 'bg-[#EAF3DE]' },
  Info: { text: 'text-[#5F5E5A]', bg: 'bg-[#F1EFE8]' },
};

const toolConfig: Record<string, { label: string; type: string; icon: string; color: string }> = {
  dependency_check: { label: 'Dependency Check', type: 'SCA', icon: 'D', color: 'bg-blue-500' },
  zap: { label: 'OWASP ZAP', type: 'DAST', icon: 'Z', color: 'bg-violet-500' },
  zap_scan: { label: 'OWASP ZAP', type: 'DAST', icon: 'Z', color: 'bg-violet-500' },
  nmap: { label: 'Nmap', type: 'Network', icon: 'N', color: 'bg-emerald-500' },
  nmap_scan: { label: 'Nmap', type: 'Network', icon: 'N', color: 'bg-emerald-500' },
  trivy_fs: { label: 'Trivy FS', type: 'Container', icon: 'TF', color: 'bg-cyan-500' },
  trivy_fs_scan: { label: 'Trivy FS', type: 'Container', icon: 'TF', color: 'bg-cyan-500' },
  trivy_image: { label: 'Trivy Image', type: 'Container', icon: 'TI', color: 'bg-cyan-700' },
  trivy_image_scan: { label: 'Trivy Image', type: 'Container', icon: 'TI', color: 'bg-cyan-700' },
  sonar: { label: 'SonarQube', type: 'SAST', icon: 'S', color: 'bg-orange-500' },
  sonar_scanner: { label: 'SonarQube', type: 'SAST', icon: 'S', color: 'bg-orange-500' },
};

const toolKeyToStage: Record<string, string> = {
  sonar: 'sonar_scanner',
  trivy_fs: 'trivy_fs_scan',
  trivy_image: 'trivy_image_scan',
  nmap: 'nmap_scan',
  zap: 'zap_scan',
};

function getToolStatus(toolKey: string, stages: ScanStage[]): 'pass' | 'fail' | 'warn' | 'skipped' {
  const stageKey = toolKeyToStage[toolKey] ?? toolKey;
  const stage = stages.find((s) => s.stage === stageKey);
  if (!stage) return 'skipped';
  const st = stage.status?.toUpperCase();
  if (st === 'FAIL' || st === 'FAILED') return 'fail';
  if (st === 'WARN' || st === 'UNSTABLE') return 'warn';
  return 'pass';
}

const statusConfig = {
  pass: { icon: '✓', color: 'text-green-600 bg-green-50', label: 'Pass' },
  fail: { icon: '✗', color: 'text-red-600 bg-red-50', label: 'Fail' },
  warn: { icon: '!', color: 'text-amber-600 bg-amber-50', label: 'Warning' },
  skipped: { icon: '–', color: 'text-slate-400 bg-slate-50', label: 'Skipped' },
};

interface ToolItem {
  name: string;
  type?: string;
  icon?: string;
  status: 'pass' | 'fail' | 'warn' | 'skipped';
  findings: number;
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  info?: number;
  link?: string;
}

interface ToolsTableProps {
  tools: ToolSummary[] | ToolItem[];
  stages?: ScanStage[];
}

export const ToolsTable = ({ tools, stages = [] }: ToolsTableProps) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="font-semibold text-slate-900">Tools This Scan</h3>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {tools.map((tool, idx) => {
            // Handle both old format (ToolSummary) and new format (ToolItem)
            const isNewFormat = 'status' in tool && 'name' in tool;
            
            let toolName: string;
            let toolType: string;
            let toolIcon: string;
            let toolColor: string;
            let status: 'pass' | 'fail' | 'warn' | 'skipped';
            let findings: number;
            let critical: number;
            let high: number;
            let medium: number;
            let link: string | undefined;

            if (isNewFormat) {
              const item = tool as ToolItem;
              toolName = item.name;
              toolType = item.type || 'Unknown';
              toolIcon = item.icon || toolName[0]?.toUpperCase() || '?';
              toolColor = 'bg-slate-500';
              status = item.status;
              findings = item.findings;
              critical = item.critical ?? 0;
              high = item.high ?? 0;
              medium = item.medium ?? 0;
              link = item.link;
            } else {
              const oldTool = tool as ToolSummary;
              const config = toolConfig[oldTool.tool] ?? {
                label: oldTool.tool.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
                type: 'Unknown',
                icon: oldTool.tool[0]?.toUpperCase() ?? '?',
                color: 'bg-slate-500',
              };
              toolName = config.label;
              toolType = config.type;
              toolIcon = config.icon;
              toolColor = config.color;
              status = getToolStatus(oldTool.tool, stages);
              findings = oldTool.findings;
              critical = oldTool.critical ?? 0;
              high = oldTool.high ?? 0;
              medium = oldTool.medium ?? 0;
              link = oldTool.link;
            }

            const statusCfg = statusConfig[status];

            return (
              <div
                key={`${toolName}-${idx}`}
                className={`relative p-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors ${
                  status === 'skipped' ? 'opacity-60' : ''
                }`}
              >
                {/* Status indicator */}
                <div className={`absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${statusCfg.color}`}>
                  {statusCfg.icon}
                </div>

                {/* Tool icon */}
                <div className={`w-8 h-8 ${toolColor} rounded-lg flex items-center justify-center text-white text-xs font-bold mb-2`}>
                  {toolIcon}
                </div>

                {/* Tool info */}
                <div className="font-medium text-slate-900 text-sm">{toolName}</div>
                <div className="text-xs text-slate-500 mb-2">{toolType}</div>

                {/* Findings count */}
                <div className="text-lg font-bold text-slate-900">{findings}</div>
                <div className="text-xs text-slate-500">
                  {findings === 0 ? 'no findings' : 'findings'}
                </div>

                {/* Severity pills (if any) */}
                {(critical > 0 || high > 0 || medium > 0) && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {critical > 0 && (
                      <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${severityColors.Critical.bg} ${severityColors.Critical.text}`}>
                        {critical}C
                      </span>
                    )}
                    {high > 0 && (
                      <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${severityColors.High.bg} ${severityColors.High.text}`}>
                        {high}H
                      </span>
                    )}
                    {medium > 0 && (
                      <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${severityColors.Medium.bg} ${severityColors.Medium.text}`}>
                        {medium}M
                      </span>
                    )}
                  </div>
                )}

                {/* External link */}
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-2 right-2 text-blue-600 hover:text-blue-800 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    ↗
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
