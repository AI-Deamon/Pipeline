import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { SeveritySummary, ReportSummary, Scan, Finding } from '../types';

interface LocationState {
  scanId?: string;
}
import { ToolsTable } from '../components/reports/ToolsTable';
import { FindingsTable } from '../components/reports/FindingsTable';
import { 
  ChevronLeft, 
  ExternalLink, 
  AlertCircle, 
  Shield, 
  History, 
  Download
} from 'lucide-react';

const severityColors: Record<string, { text: string; bg: string; border: string }> = {
  Critical: { text: 'text-[#A32D2D]', bg: 'bg-[#FCEBEB]', border: 'border-[#E24B4A]' },
  High: { text: 'text-[#854F0B]', bg: 'bg-[#FAEEDA]', border: 'border-[#EF9F27]' },
  Medium: { text: 'text-[#185FA5]', bg: 'bg-[#E6F1FB]', border: 'border-[#378ADD]' },
  Low: { text: 'text-[#3B6D11]', bg: 'bg-[#EAF3DE]', border: 'border-[#639922]' },
  Info: { text: 'text-[#5F5E5A]', bg: 'bg-[#F1EFE8]', border: 'border-slate-400' },
};

const ProjectReportsPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const initialScanId = (location.state as LocationState)?.scanId;
  
  const [exportLoading, setExportLoading] = useState(false);
  const [selectedScanId, setSelectedScanId] = useState<string>(initialScanId || '');

  // Fetch project
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId!),
    enabled: !!projectId,
  });

  // Fetch scan history
  const { data: scans = [], isLoading: scansLoading } = useQuery<Scan[]>({
    queryKey: ['scanHistory', projectId],
    queryFn: () => api.scans.getHistory(projectId!),
    enabled: !!projectId,
  });

  // Set initial scan ID from completed scans
  const completedScans = useMemo(() => {
    return scans
      .filter((s: Scan) => s.state === 'COMPLETED')
      .sort((a: Scan, b: Scan) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [scans]);

  // Get current and previous scan for delta calculation
  const currentScanIndex = useMemo(() => {
    return completedScans.findIndex((s: Scan) => s.scan_id === selectedScanId);
  }, [completedScans, selectedScanId]);

  const currentScan = completedScans[currentScanIndex];
  const previousScan = completedScans[currentScanIndex + 1];

  // Fetch report summary for current scan
  const { data: summary, isLoading: summaryLoading } = useQuery<ReportSummary>({
    queryKey: ['reportSummary', projectId, selectedScanId],
    queryFn: () => api.reports.getSummary(projectId!, selectedScanId),
    enabled: !!projectId && !!selectedScanId,
  });

  // Fetch report details for current scan
  const { data: reports = [], isLoading: reportsLoading } = useQuery({
    queryKey: ['reports', projectId, selectedScanId],
    queryFn: () => api.reports.getAll(projectId!, selectedScanId),
    enabled: !!projectId && !!selectedScanId,
  });

  // Fetch previous scan summary for delta
  const { data: previousSummary } = useQuery<ReportSummary>({
    queryKey: ['reportSummary', projectId, previousScan?.scan_id],
    queryFn: () => api.reports.getSummary(projectId!, previousScan?.scan_id),
    enabled: !!projectId && !!previousScan?.scan_id,
  });

  // Fetch current scan with stage_results for ToolsTable status
  const { data: scanDetail } = useQuery({
    queryKey: ['scanDetail', selectedScanId],
    queryFn: () => api.scans.get(selectedScanId!) as Promise<Scan>,
    enabled: !!selectedScanId,
  });

  // Initialize selected scan
  useEffect(() => {
    if (!selectedScanId && completedScans.length > 0) {
      const target = initialScanId && completedScans.some((s: Scan) => s.scan_id === initialScanId)
        ? initialScanId
        : completedScans[0]?.scan_id;
      setSelectedScanId(target);
    }
  }, [completedScans, initialScanId, selectedScanId]);

  const isLoading = projectLoading || scansLoading || summaryLoading || reportsLoading;

  // Calculate delta
  const getDelta = (severity: keyof SeveritySummary): { value: number; direction: 'up' | 'down' | 'same' } => {
    if (!summary?.severity || !previousSummary?.severity) return { value: 0, direction: 'same' };
    const current = summary.severity[severity] || 0;
    const previous = previousSummary.severity[severity] || 0;
    const diff = current - previous;
    return {
      value: Math.abs(diff),
      direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
    };
  };

  // Format helpers
  const formatDuration = (startedAt?: string, finishedAt?: string): string => {
    if (!startedAt || !finishedAt) return 'N/A';
    const diffMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    }).replace(/,/g, '');
  };

  // Handle export
  const handleExport = async () => {
    if (!projectId || !selectedScanId) return;
    setExportLoading(true);
    try {
      const blob = await api.reports.exportUnified(projectId, 'pdf', selectedScanId, 'technical');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `security-report-${project?.name || 'project'}-${selectedScanId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExportLoading(false);
    }
  };

  // Get all findings flattened
  interface ReportDetail { tool: string; findings?: Finding[] }
  const allFindings = useMemo(() => {
    const findings: (Finding & { tool: string })[] = [];
    (reports as ReportDetail[]).forEach((report) => {
      report.findings?.forEach((finding) => {
        findings.push({ ...finding, tool: report.tool });
      });
    });
    return findings;
  }, [reports]);

  if (isLoading) {
    return (
      <div className="space-y-6 p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-200 rounded-lg animate-pulse" />
            <div>
              <div className="w-40 h-6 bg-slate-200 rounded animate-pulse" />
              <div className="w-24 h-4 bg-slate-200 rounded animate-pulse mt-2" />
            </div>
          </div>
          <div className="w-48 h-10 bg-slate-200 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="w-16 h-8 bg-slate-200 rounded animate-pulse" />
              <div className="w-20 h-4 bg-slate-200 rounded animate-pulse mt-2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-red-600 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>Project not found</span>
        </div>
      </div>
    );
  }

  if (completedScans.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(`/projects/${projectId}`)} className="p-2 hover:bg-slate-100 rounded-lg">
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Scan Report</h1>
              <p className="text-sm text-slate-500">{project.name}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-slate-200">
          <Shield className="w-16 h-16 text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No scans found</h3>
          <p className="text-slate-500 mb-6">Trigger your first scan to see results.</p>
          <button onClick={() => navigate(`/projects/${projectId}`)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">
            Go to Project
          </button>
        </div>
      </div>
    );
  }

  const scanNumber = currentScanIndex + 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/projects/${projectId}`)} className="p-2 hover:bg-slate-100 rounded-lg">
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Scan Report</h1>
            <p className="text-sm text-slate-500">Dashboard / {project.name} / Reports / Scan #{scanNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            disabled={exportLoading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium disabled:opacity-50"
          >
            {exportLoading ? (
              <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Export PDF
          </button>
          <button
            onClick={() => navigate(`/projects/${projectId}/reports/unified`)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <ExternalLink className="w-4 h-4" />
            View Unified Report
          </button>
        </div>
      </div>

      {/* Scan Selector */}
      {completedScans.length > 1 && (
        <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
          <History className="w-5 h-5 text-slate-400" />
          <select
            value={selectedScanId}
            onChange={(e) => setSelectedScanId(e.target.value)}
            className="flex-1 text-sm border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
          >
            {completedScans.map((s: Scan, idx: number) => (
              <option key={s.scan_id} value={s.scan_id}>
                Scan #{completedScans.length - idx} — {s.scan_id.slice(0, 8)}... ({new Date(s.created_at || '').toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Scan Metadata */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-4 divide-x divide-slate-200">
          <div className="px-4 first:pl-0">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Scan ID</div>
            <div className="font-mono text-sm text-slate-900">{currentScan?.scan_id?.slice(0, 12)}...</div>
          </div>
          <div className="px-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Date & Time</div>
            <div className="text-sm text-slate-900">{formatDate(currentScan?.created_at)}</div>
          </div>
          <div className="px-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Scan Mode</div>
            <div className="text-sm text-slate-900 capitalize">{currentScan?.scan_mode || 'Automated'}</div>
          </div>
          <div className="px-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Target</div>
            <div className="font-mono text-sm text-slate-900 truncate max-w-[200px]">
              {project.target_url || project.target_ip || 'N/A'}
            </div>
          </div>
          <div className="px-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Duration</div>
            <div className="text-sm text-slate-900">
              {formatDuration(currentScan?.started_at, currentScan?.finished_at)}
            </div>
          </div>
        </div>
      </div>

      {/* Severity Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {(['Critical', 'High', 'Medium', 'Low', 'Info'] as const).map((severity) => {
            const count = summary.severity[severity.toLowerCase() as keyof SeveritySummary] || 0;
            const delta = getDelta(severity.toLowerCase() as keyof SeveritySummary);
            const colors = severityColors[severity];
            
            return (
              <div key={severity} className={`bg-white rounded-xl border-t-4 ${colors.border} border-x border-b border-slate-200 p-4`}>
                <div className={`text-3xl font-bold ${colors.text}`}>{count}</div>
                <div className="text-sm text-slate-500">{severity}</div>
                {previousSummary && (
                  <div className="text-xs mt-2">
                    {delta.direction === 'up' && delta.value > 0 && <span className="text-red-600">↑ +{delta.value} new</span>}
                    {delta.direction === 'down' && delta.value > 0 && <span className="text-green-600">↓ −{delta.value} fixed</span>}
                    {delta.direction === 'same' && <span className="text-slate-400">no change</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tools Table */}
      {summary?.tools && (
        <ToolsTable
          tools={summary.tools}
          reports={reports}
          stages={scanDetail?.results ?? []}
        />
      )}

      {/* Findings Table */}
      <FindingsTable findings={allFindings} />
    </div>
  );
};

export default ProjectReportsPage;
