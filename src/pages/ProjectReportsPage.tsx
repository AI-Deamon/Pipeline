import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { ReportSummary, Scan, Finding } from '../types';

interface LocationState {
  scanId?: string;
}
import { FindingsTable } from '../components/reports/FindingsTable';
import { ProjectReportLayout } from '../components/reports/ProjectReportLayout';
import {
  ChevronLeft,
  AlertCircle,
  Shield,
  History,
} from 'lucide-react';

const ProjectReportsPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const initialScanId = (location.state as LocationState)?.scanId;
  
  const [exportLoading, setExportLoading] = useState(false);
  const [selectedScanId, setSelectedScanId] = useState<string>(initialScanId || '');
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

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

  // Prepare tools for layout - include ALL stages, not just those with findings
  const allStages = scanDetail?.results || [];
  const toolsWithFindings = summary?.tools || [];
  
  // Create a map of tools with findings
  const findingsMap = new Map(toolsWithFindings.map(t => [t.tool, t]));
  
  // Stage to tool name mapping (mirrors backend STAGE_TO_TOOL)
  const stageToTool: Record<string, { name: string; type: string; icon: string; key: string | undefined }> = {
    'git_checkout': { name: 'Git Checkout', type: 'Pipeline', icon: 'G', key: undefined },
    'sonar_scanner': { name: 'SonarQube', type: 'SAST', icon: 'S', key: 'sonar' },
    'dependency_check': { name: 'Dependency Check', type: 'SCA', icon: 'D', key: 'dependency_check' },
    'trivy_fs_scan': { name: 'Trivy FS', type: 'SCA', icon: 'TF', key: 'trivy_fs' },
    'docker_build': { name: 'Docker Build', type: 'Pipeline', icon: 'DB', key: undefined },
    'docker_push': { name: 'Docker Push', type: 'Pipeline', icon: 'DP', key: undefined },
    'trivy_image_scan': { name: 'Trivy Image', type: 'Container', icon: 'TI', key: 'trivy_image' },
    'nmap_scan': { name: 'Nmap', type: 'Network', icon: 'N', key: 'nmap' },
    'zap_scan': { name: 'OWASP ZAP', type: 'DAST', icon: 'Z', key: 'zap' },
  };

  // Build tools list from all stages
  const toolsForLayout = allStages.map((stage) => {
    const stageInfo = stageToTool[stage.stage] || {
      name: stage.stage.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      type: 'Unknown',
      icon: stage.stage[0]?.toUpperCase() ?? '?',
      key: undefined,
    };
    
    const st = stage.status?.toUpperCase();
    let status: 'pass' | 'fail' | 'warn' | 'skipped' = 'pass';
    if (st === 'FAIL' || st === 'FAILED') status = 'fail';
    else if (st === 'WARN' || st === 'UNSTABLE') status = 'warn';
    else if (st === 'SKIP' || st === 'SKIPPED') status = 'skipped';
    
    // Find findings for this tool using explicit key mapping
    const toolKey = stageInfo.key || [...findingsMap.keys()].find(k => 
      k === stage.stage
    ) || stage.stage;
    const toolData = findingsMap.get(toolKey);
    
    return {
      name: stageInfo.name,
      key: toolKey,
      type: stageInfo.type,
      icon: stageInfo.icon,
      status,
      findings: toolData?.findings ?? 0,
      critical: toolData?.critical ?? 0,
      high: toolData?.high ?? 0,
      medium: toolData?.medium ?? 0,
      low: toolData?.low ?? 0,
      info: toolData?.info ?? 0,
      link: toolData?.link,
    };
  });

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(`/projects/${projectId}`)} className="p-2 hover:bg-slate-100 rounded-lg">
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Scan Report</h1>
          <p className="text-sm text-slate-500">Dashboard / {project.name} / Reports / Scan #{scanNumber}</p>
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

      {/* Side Panel Layout */}
      <ProjectReportLayout
        scanInfo={{
          scanId: currentScan?.scan_id || '',
          date: formatDate(currentScan?.created_at),
          duration: formatDuration(currentScan?.started_at, currentScan?.finished_at),
          mode: currentScan?.scan_mode || 'Automated',
          target: project.target_url || project.target_ip || '',
        }}
        severity={{
          critical: summary?.severity?.critical ?? 0,
          high: summary?.severity?.high ?? 0,
          medium: summary?.severity?.medium ?? 0,
          low: summary?.severity?.low ?? 0,
          info: summary?.severity?.info ?? 0,
        }}
        tools={toolsForLayout}
        projectId={projectId || ''}
        scanId={selectedScanId}
        selectedTool={selectedTool}
        onToolSelect={setSelectedTool}
        onExport={handleExport}
        exportLoading={exportLoading}
      >
        {selectedTool ? (
          <FindingsTable 
            findings={allFindings} 
            projectId={projectId} 
            scanId={selectedScanId}
            selectedTool={selectedTool}
          />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Select a Tool</h3>
              <p className="text-sm text-slate-500">Click on a tool in the sidebar to view its findings</p>
            </div>
          </div>
        )}
      </ProjectReportLayout>
    </div>
  );
};

export default ProjectReportsPage;
