import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { ChevronLeft, Loader2, ExternalLink, AlertCircle, Shield, History } from 'lucide-react';

interface SeveritySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

interface ToolSummary {
  tool: string;
  findings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  link?: string;
}

interface ReportSummary {
  project_id: string;
  total_findings: number;
  severity: SeveritySummary;
  tools: ToolSummary[];
}

interface Finding {
  id: string;
  severity: string;
  title: string;
  description?: string;
  cve?: string;
  host?: string;
  port?: number;
  service?: string;
  uri?: string;
  package?: string;
  recommendation?: string;
}

interface ReportDetail {
  id: number;
  scan_id: string;
  tool: string;
  severity_summary: SeveritySummary;
  findings: Finding[];
  report_url?: string;
  created_at: string;
}

const severityColors: Record<string, string> = {
  Critical: 'bg-red-500 text-white',
  High: 'bg-orange-500 text-white',
  Medium: 'bg-yellow-500 text-white',
  Low: 'bg-blue-500 text-white',
  Info: 'bg-slate-500 text-white',
};

const toolIcons: Record<string, string> = {
  trivy_fs: 'T',
  trivy_image: 'Ti',
  zap: 'Z',
  dependency_check: 'D',
  nmap: 'N',
  sonar: 'S',
};

interface ScanInfo {
  scan_id: string;
  state: string;
  created_at: string;
}

const ProjectReportsPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const initialScanId = (location.state as any)?.scanId;
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<{ project_id: string; name: string } | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [reports, setReports] = useState<ReportDetail[]>([]);
  const [scans, setScans] = useState<ScanInfo[]>([]);
  const [selectedScanId, setSelectedScanId] = useState<string>('');

  const loadReports = (scanId: string) => {
    setLoading(true);
    const id = scanId || undefined;
    api.reports.getSummary(projectId!, id)
      .then(data => {
        setSummary(data);
        return api.reports.getAll(projectId!, id);
      })
      .then(data => {
        setReports(data || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load reports');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!projectId) return;

    Promise.all([
      api.projects.get(projectId),
      api.scans.getHistory(projectId),
    ])
      .then(([projectData, scanData]) => {
        if (projectData) {
          setProject(projectData);
        }
        const scanList: ScanInfo[] = (scanData || [])
          .filter((s: ScanInfo) => {
            if (initialScanId) return s.scan_id === initialScanId || s.state === 'COMPLETED';
            return s.state === 'COMPLETED';
          })
          .sort((a: ScanInfo, b: ScanInfo) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        setScans(scanList);
        const target = initialScanId && scanList.some(s => s.scan_id === initialScanId)
          ? initialScanId
          : (scanList[0]?.scan_id || '');
        setSelectedScanId(target);
        return loadReports(target);
      })
      .catch(() => {
        setError('Failed to load reports');
        setLoading(false);
      });
  }, [projectId]);

  const handleScanChange = (scanId: string) => {
    setSelectedScanId(scanId);
    loadReports(scanId);
  };

  const toggleTool = (tool: string) => {
    setExpandedTool(expandedTool === tool ? null : tool);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-red-600 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error || 'Project not found'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(`/projects/${projectId}`)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Security Reports</h1>
            <p className="text-sm text-slate-500">{project.name}</p>
          </div>
        </div>
      </div>

      {/* Scan Selector */}
      {scans.length > 1 && (
        <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
          <History className="w-5 h-5 text-slate-400" />
          <select
            value={selectedScanId}
            onChange={(e) => handleScanChange(e.target.value)}
            className="flex-1 text-sm border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {scans.map((s) => (
              <option key={s.scan_id} value={s.scan_id}>
                Scan {s.scan_id.slice(0, 8)}... ({new Date(s.created_at).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Summary Cards */}
      {summary && summary.total_findings > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-3xl font-bold text-red-600">{summary.severity.critical}</div>
            <div className="text-sm text-slate-500">Critical</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-3xl font-bold text-orange-600">{summary.severity.high}</div>
            <div className="text-sm text-slate-500">High</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-3xl font-bold text-yellow-600">{summary.severity.medium}</div>
            <div className="text-sm text-slate-500">Medium</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-3xl font-bold text-blue-600">{summary.severity.low}</div>
            <div className="text-sm text-slate-500">Low</div>
          </div>
        </div>
      )}

      {!summary || summary.total_findings === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Shield className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No Reports Yet</h3>
          <p className="text-slate-500 mb-4">Run a scan to generate security reports</p>
          <button
            onClick={() => navigate(`/projects/${projectId}/manual`)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Run Scan
          </button>
        </div>
      ) : (
        /* Tool Accordions */
        <div className="space-y-3">
          {summary?.tools.map((tool) => (
            <div key={tool.tool} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <button
                onClick={() => toggleTool(tool.tool)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center font-medium text-slate-600">
                    {toolIcons[tool.tool] || '?'}
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-slate-900 capitalize">{tool.tool.replace('_', ' ')}</div>
                    <div className="text-sm text-slate-500">{tool.findings} findings</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {tool.link && (
                    <a
                      href={tool.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <div className="flex gap-1">
                    {tool.critical > 0 && (
                      <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded">{tool.critical}</span>
                    )}
                    {tool.high > 0 && (
                      <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded">{tool.high}</span>
                    )}
                    {tool.medium > 0 && (
                      <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded">{tool.medium}</span>
                    )}
                    {tool.low > 0 && (
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">{tool.low}</span>
                    )}
                  </div>
                </div>
              </button>

              {/* Findings List */}
              {expandedTool === tool.tool && (
                <div className="border-t border-slate-200 p-4 space-y-3 max-h-96 overflow-y-auto">
                  {reports
                    .filter(r => r.tool === tool.tool)
                    .flatMap(r => r.findings || [])
                    .map((finding, idx) => (
                      <div key={`${finding.id}-${idx}`} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${severityColors[finding.severity] || 'bg-slate-500 text-white'}`}>
                          {finding.severity}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900">{finding.title}</div>
                          {finding.description && (
                            <div className="text-sm text-slate-500 truncate">{finding.description}</div>
                          )}
                          {(finding.host || finding.cve || finding.package) && (
                            <div className="text-xs text-slate-400 mt-1">
                              {finding.host && <span>{finding.host}</span>}
                              {finding.port && <span>:{finding.port}</span>}
                              {finding.cve && <span className="ml-2">{finding.cve}</span>}
                              {finding.package && <span className="ml-2">{finding.package}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectReportsPage;