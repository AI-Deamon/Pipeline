import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { DeveloperReport, DeveloperIssue } from '../types';
import { FileHealthCard } from '../components/reports/FileHealthCard';
import { IssueDetailPanel } from '../components/reports/IssueDetailPanel';
import { QualityGateCard } from '../components/reports/QualityGateCard';
import { ProjectReportLayout } from '../components/reports/ProjectReportLayout';
import {
  ChevronLeft,
  FileText,
  AlertTriangle,
} from 'lucide-react';

const SEVERITY_WEIGHT: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1, Info: 0 };

const DeveloperReportPage = () => {
  const { projectId, scanId } = useParams<{ projectId: string; scanId: string }>();
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<DeveloperIssue | null>(null);

  // Fetch project
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId!),
    enabled: !!projectId,
  });

  // Fetch developer report
  const { data: report, isLoading } = useQuery<DeveloperReport>({
    queryKey: ['developerReport', projectId, scanId],
    queryFn: () => api.reports.getDeveloperReport(projectId!, scanId!),
    enabled: !!projectId && !!scanId,
  });

  // Fetch scan for metadata
  const { data: scan } = useQuery({
    queryKey: ['scan', scanId],
    queryFn: () => api.scans.get(scanId!),
    enabled: !!scanId,
  });

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
    });
  };

  const selectedFileData = report?.files.find((f) => f.file_path === selectedFile);

  // The worst file/issue first — used only to pick sensible defaults below,
  // not to reorder the visible lists (file list stays in the order the API
  // returns it; issue list stays in file order).
  const worstFileFirst = useMemo(() => {
    if (!report) return [];
    return [...report.files].sort((a, b) => {
      const score = (f: typeof a) => f.issues.reduce((sum, i) => sum + (SEVERITY_WEIGHT[i.severity] ?? 0), 0);
      return score(b) - score(a);
    });
  }, [report]);

  // Previously the page required two clicks (pick a file, then pick an
  // issue in it) before any real issue content showed at all — same
  // "content should show immediately" gap fixed on ProjectReportsPage and
  // UnifiedReportPage (tracker #138/#139). Auto-select the file with the
  // worst findings on load, so a developer sees something real without
  // clicking anything first; they can still pick a different file manually.
  useEffect(() => {
    if (!selectedFile && worstFileFirst.length > 0) {
      setSelectedFile(worstFileFirst[0].file_path);
    }
  }, [selectedFile, worstFileFirst]);

  // Same principle for the second click: once a file is selected (whether
  // by the effect above or a manual click), show its worst issue right
  // away instead of requiring a second click to see any detail.
  useEffect(() => {
    if (selectedFileData && (!selectedIssue || !selectedFileData.issues.some((i) => i.id === selectedIssue.id))) {
      const worst = [...selectedFileData.issues].sort(
        (a, b) => (SEVERITY_WEIGHT[b.severity] ?? 0) - (SEVERITY_WEIGHT[a.severity] ?? 0),
      )[0];
      setSelectedIssue(worst ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFileData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-500">Loading developer report...</div>
      </div>
    );
  }

  if (!report || !project) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-red-600">Report not found</div>
      </div>
    );
  }

  // Calculate total severity counts
  const totalSeverity = report.files.reduce(
    (acc, file) => {
      file.issues.forEach((issue) => {
        const sev = issue.severity;
        acc[sev] = (acc[sev] || 0) + 1;
      });
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(`/projects/${projectId}/reports`)}
          className="p-2 hover:bg-slate-100 rounded-lg"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Developer View</h1>
          <p className="text-sm text-slate-500">
            {project.name} / Reports / Developer Dashboard
          </p>
        </div>
      </div>

      {/* Side Panel Layout */}
      <ProjectReportLayout
        scanInfo={{
          scanId: scanId || '',
          date: formatDate(scan?.created_at),
          duration: formatDuration(scan?.started_at, scan?.finished_at),
          mode: scan?.scan_mode || 'Automated',
          target: project.target_url || project.target_ip || '',
        }}
        severity={{
          critical: totalSeverity['Critical'] || 0,
          high: totalSeverity['High'] || 0,
          medium: totalSeverity['Medium'] || 0,
          low: totalSeverity['Low'] || 0,
          info: totalSeverity['Info'] || 0,
        }}
        projectId={projectId || ''}
        onExport={() => {}}
        exportLoading={false}
      >
        <div className="space-y-4">
          {/* Quality Gate */}
          <QualityGateCard gate={report.quality_gate} />

          {/* Summary */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 mb-2">Summary</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-slate-900">{report.summary.total_files}</div>
                <div className="text-xs text-slate-500">Files with Issues</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">{report.summary.total_issues}</div>
                <div className="text-xs text-slate-500">Total Issues</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{totalSeverity['Critical'] || 0}</div>
                <div className="text-xs text-slate-500">Critical</div>
              </div>
            </div>
          </div>

          {/* File List */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Files with Issues ({report.files.length})
            </h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {report.files.map((file) => (
                <FileHealthCard
                  key={file.file_path}
                  file={file}
                  isSelected={selectedFile === file.file_path}
                  onClick={() => {
                    setSelectedFile(file.file_path);
                    setSelectedIssue(null);
                  }}
                />
              ))}
            </div>
          </div>

          {/* Selected File Issues */}
          {selectedFileData && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Issues in {selectedFileData.file_path.split('/').pop()} ({selectedFileData.issues.length})
              </h3>
              <div className="space-y-2">
                {selectedFileData.issues.map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => setSelectedIssue(issue)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedIssue?.id === issue.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        issue.severity === 'Critical' ? 'bg-red-500' :
                        issue.severity === 'High' ? 'bg-orange-500' :
                        issue.severity === 'Medium' ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`} />
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {issue.message}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                      {issue.line && <span>Line {issue.line}</span>}
                      {issue.rule && <span className="font-mono">{issue.rule}</span>}
                      {issue.effort && <span>{issue.effort}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Issue Detail */}
          {selectedIssue && (
            <IssueDetailPanel
              issue={selectedIssue}
              sonarUrl={`http://localhost:9000/project/issues?id=${project.sonar_key}&issues=${selectedIssue.id.replace('SONAR-', '')}&open=${selectedIssue.id.replace('SONAR-', '')}`}
            />
          )}
        </div>
      </ProjectReportLayout>
    </div>
  );
};

export default DeveloperReportPage;
