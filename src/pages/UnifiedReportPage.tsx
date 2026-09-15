import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { api } from '../services/api';
import type { UnifiedReport, TrendData, Finding, ComplianceReport } from '../types';
import SeverityPieChart from '../components/SeverityPieChart';
import ToolBarChart from '../components/ToolBarChart';
import TrendLineChart from '../components/TrendLineChart';
import TableOfContents from '../components/TableOfContents';
import FilterBar from '../components/FilterBar';
import FindingDetailModal from '../components/FindingDetailModal';
import { RiskGauge } from '../components/RiskGauge';
import { ReportVariantNav } from '../components/reports/ReportVariantNav';
import { useToast } from '../components/Toast';
import { useRbac } from '../hooks/useRbac';
import { useScanHistory } from '../hooks/useScanHistory';
import { getSeverityColor } from '../utils/risk';
import { ArrowLeft, ChevronLeft, Download, History, ShieldOff, ListChecks } from 'lucide-react';

const UnifiedReportPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { canAssignIssues, isAdmin } = useRbac();
  const { scans, isLoading: scansLoading } = useScanHistory(projectId);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedScanId = searchParams.get('scanId') || '';
  const setSelectedScanId = (scanId: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('scanId', scanId);
      return next;
    }, { replace: true });
  };
  const [report, setReport] = useState<UnifiedReport | null>(null);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [compliance, setCompliance] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [currentSection, setCurrentSection] = useState<string>('Summary');
  const [search, setSearch] = useState('');
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [reportType, setReportType] = useState<'technical' | 'executive' | 'compliance' | 'comparison'>('technical');
  const sections = ['Summary', 'Severity Distribution', 'Tool Comparison', 'Historical Trend', 'Compliance', 'Findings'];

  // Fetch a severity summary per scan (for the scan selector options)
  const scanSummaryQueries = useQueries({
    queries: scans.map((s) => ({
      queryKey: ['reportSummary', projectId, s.scan_id],
      queryFn: () => api.reports.getSummary(projectId!, s.scan_id),
      enabled: !!projectId,
    })),
  });

  useEffect(() => {
    if (scans.length > 0 && !selectedScanId) {
      setSelectedScanId(scans[0].scan_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scans, selectedScanId]);

  useEffect(() => {
    if (!projectId || !selectedScanId) return;
    setLoading(true);
    Promise.all([
      api.reports.getUnified(projectId, selectedScanId),
      api.reports.getTrends(projectId),
      api.reports.getCompliance(projectId, selectedScanId)
    ]).then(([reportData, trendsData, complianceData]) => {
      setReport(reportData);
      setTrends(trendsData);
      setCompliance(complianceData);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [projectId, selectedScanId]);

  useEffect(() => {
    if (!report) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) setCurrentSection(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [report, sections]);

  const handleExport = async (format: 'pdf' | 'html') => {
    setExporting(true);
    try {
      const blob = await api.reports.exportUnified(projectId!, format, selectedScanId, reportType);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `security-report-${projectId}-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      addToast({ type: 'error', title: 'Export failed', message: 'Please try again.' });
    } finally {
      setExporting(false);
    }
  };

  if (loading || scansLoading) {
    return (
      <div className="max-w-6xl mx-auto p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-200 rounded-lg animate-pulse" />
            <div className="w-40 h-7 bg-slate-200 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-36 h-10 bg-slate-200 rounded-lg animate-pulse" />
            <div className="w-28 h-10 bg-slate-200 rounded-lg animate-pulse" />
            <div className="w-28 h-10 bg-slate-200 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="w-16 h-8 bg-slate-200 rounded animate-pulse" />
              <div className="w-20 h-4 bg-slate-200 rounded animate-pulse mt-2" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 h-64 animate-pulse" />
          <div className="bg-white rounded-xl border border-slate-200 p-6 h-64 animate-pulse" />
        </div>
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(`/projects/${projectId}`)} className="p-2 rounded-lg transition-colors hover:bg-slate-100 active:scale-[0.96]">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-display text-2xl font-semibold text-slate-900 tracking-tight">Security report</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200">
          <ShieldOff className="w-12 h-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-1.5">No scans yet</h3>
          <p className="text-slate-500 mb-6">Trigger your first scan to see security results.</p>
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="px-4 py-2.5 bg-teal-700 text-white rounded-lg transition-all hover:bg-teal-800 active:scale-[0.98] text-sm font-medium"
          >
            Go to project
          </button>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">No report data found</p>
      </div>
    );
  }

  if (!projectId) return null;

  // Compute available tools and filter findings
  const availableTools = [...new Set(report.findings.map(f => f.tool).filter((tool): tool is string => Boolean(tool)))];
  
  // Compute tool summaries from findings
  const toolSummaries = report.findings.reduce<Record<string, { tool: string; findings: number; critical: number; high: number; medium: number; low: number }>>((acc, f) => {
    const tool = f.tool || 'unknown';
    if (!acc[tool]) {
      acc[tool] = { tool, findings: 0, critical: 0, high: 0, medium: 0, low: 0 };
    }
    acc[tool].findings++;
    const sev = f.severity.toLowerCase();
    if (sev === 'critical') acc[tool].critical++;
    else if (sev === 'high') acc[tool].high++;
    else if (sev === 'medium') acc[tool].medium++;
    else if (sev === 'low') acc[tool].low++;
    return acc;
  }, {});
  const toolSummariesArray = Object.values(toolSummaries);

  const filteredFindings = report.findings.filter(f => {
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      const matches =
        f.title.toLowerCase().includes(q) ||
        f.description?.toLowerCase().includes(q) ||
        f.rule?.toLowerCase().includes(q) ||
        f.cwe_ids?.some((c) => c.toLowerCase().includes(q));
      if (!matches) return false;
    }
    // Severity filter
    if (selectedSeverities.length > 0 && !selectedSeverities.includes(f.severity)) {
      return false;
    }
    // Tool filter
    if (selectedTools.length > 0 && f.tool && !selectedTools.includes(f.tool)) {
      return false;
    }
    return true;
  });

  const openFindingId = searchParams.get('finding');
  const selectedFinding = openFindingId
    ? filteredFindings.find((f) => f.id === openFindingId) ?? null
    : null;
  const setSelectedFinding = (finding: Finding | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (finding) next.set('finding', finding.id);
      else next.delete('finding');
      return next;
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/projects/${projectId}`)} className="p-2 rounded-lg transition-colors hover:bg-slate-100 active:scale-[0.96]">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display text-2xl font-semibold text-slate-900 tracking-tight">Security report</h1>
        </div>
        <div className="flex items-center gap-2.5">
          {(canAssignIssues || isAdmin) && (
            <Link
              to={`/projects/${projectId}/issues`}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg transition-all hover:bg-slate-50 active:scale-[0.98] text-sm font-medium"
            >
              <ListChecks className="w-4 h-4" />
              Issues
            </Link>
          )}
          <button
            onClick={() => navigate(`/projects/${projectId}/reports`, { state: { scanId: selectedScanId } })}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg transition-all hover:bg-slate-50 active:scale-[0.98] text-sm font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to detailed view
          </button>
        </div>
      </div>

      <ReportVariantNav projectId={projectId} active="unified" scanId={selectedScanId} />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <select
          value={reportType}
          onChange={(e) => setReportType(e.target.value as typeof reportType)}
          aria-label="Export format"
          title="Controls the export format, not the on-screen report"
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm transition-colors hover:border-slate-400 focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
        >
          <option value="technical">Technical export</option>
          <option value="executive">Executive summary export</option>
          <option value="compliance">Compliance export</option>
          <option value="comparison">Comparison export</option>
        </select>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => handleExport('html')}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg transition-all hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting…' : 'Export HTML'}
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-teal-700 text-white rounded-lg transition-all hover:bg-teal-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* Scan Selector */}
      {scans.length > 1 && (
        <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3 mb-6">
          <History className="w-5 h-5 text-slate-400 shrink-0" />
          <select
            value={selectedScanId}
            onChange={(e) => setSelectedScanId(e.target.value)}
            aria-label="Select scan"
            className="flex-1 text-sm border-slate-200 rounded-lg px-3 py-2 transition-colors focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          >
            {scans.map((s, idx) => {
              const sev = scanSummaryQueries[idx]?.data?.severity;
              const countsLabel = sev ? ` — ${sev.critical}C ${sev.high}H ${sev.medium}M` : '';
              return (
                <option key={s.scan_id} value={s.scan_id}>
                  Scan {s.scan_id.slice(0, 8)}…{countsLabel} ({new Date(s.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })})
                </option>
              );
            })}
          </select>
        </div>
      )}

      <TableOfContents
        sections={sections}
        currentSection={currentSection}
        onSectionClick={(section) => {
          setCurrentSection(section);
          document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />

      {/* Summary Cards */}
      <div id="Summary" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Critical', value: report.severity.critical, bar: 'bg-red-500', text: 'text-red-600' },
          { label: 'High', value: report.severity.high, bar: 'bg-orange-500', text: 'text-orange-600' },
          { label: 'Medium', value: report.severity.medium, bar: 'bg-amber-500', text: 'text-amber-600' },
          { label: 'Low', value: report.severity.low, bar: 'bg-emerald-500', text: 'text-emerald-600' },
          { label: 'Info', value: report.severity.info, bar: 'bg-slate-400', text: 'text-slate-500' },
        ].map((s) => (
          <div key={s.label} className="relative overflow-hidden bg-white rounded-xl border border-slate-200 p-4 transition-shadow hover:shadow-sm">
            <span className={`absolute inset-y-0 left-0 w-1 ${s.bar}`} aria-hidden="true" />
            <div className={`tabular-nums text-3xl font-semibold ${s.text}`}>{s.value}</div>
            <div className="text-sm text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

       {/* Risk Score Card */}
       {report.risk_score && (
         <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8">
           <h3 className="text-sm font-semibold text-slate-900 mb-5">Risk assessment</h3>
           <div className="flex items-center gap-8">
             <RiskGauge score={report.risk_score.score} size={80} />
             <div>
               <div className="text-sm text-slate-500 mb-0.5">{report.risk_score.level} risk</div>
               <div className="text-sm">
                 Trend: <span className="font-medium capitalize">{report.risk_score.trend}</span>
               </div>
               <div className="text-sm text-slate-500">
                 Previous score: <span className="tabular-nums">{report.risk_score.previous_score ?? 'N/A'}</span>
               </div>
             </div>
           </div>
         </div>
       )}

       {/* Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        <div id="Severity Distribution" className="bg-white rounded-2xl border border-slate-200 p-6">
          <SeverityPieChart
            critical={report.severity.critical}
            high={report.severity.high}
            medium={report.severity.medium}
            low={report.severity.low}
          />
        </div>
        <div id="Tool Comparison" className="bg-white rounded-2xl border border-slate-200 p-6">
          <ToolBarChart tools={toolSummariesArray} />
        </div>
      </div>

      {/* Trend Chart */}
      <div id="Historical Trend" className="bg-white rounded-2xl border border-slate-200 p-6 mb-8">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Historical trend — last 30 days</h3>
        {trends.length > 0 ? (
          <TrendLineChart data={trends} />
        ) : (
          <p className="text-slate-500 text-sm">No trend data available yet.</p>
        )}
      </div>

      {/* Compliance Section */}
      {compliance && compliance.compliance && (
        <div id="Compliance" className="bg-white rounded-2xl border border-slate-200 p-6 mb-8">
          <h3 className="text-sm font-semibold text-slate-900 mb-5">Compliance mapping</h3>

          {/* OWASP Top 10 */}
          {compliance.compliance.owasp_top_10 && compliance.compliance.owasp_top_10.length > 0 && (
            <div className="mb-6">
              <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-3">OWASP Top 10, 2021</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {compliance.compliance.owasp_top_10.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSearch(item.id);
                      document.getElementById('Findings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSearch(item.id);
                        document.getElementById('Findings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg transition-colors hover:bg-slate-100 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-slate-900">{item.id}</span>
                      <span className="ml-2 text-slate-600">{item.name}</span>
                    </div>
                    <span className="tabular-nums shrink-0 ml-3 px-2 py-1 bg-red-100 text-red-700 rounded text-sm font-medium">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CWE Top 25 */}
          {compliance.compliance.cwe_top_25 && compliance.compliance.cwe_top_25.length > 0 && (
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-3">CWE Top 25, 2023</h4>
              <div className="space-y-2">
                {compliance.compliance.cwe_top_25.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSearch(item.id);
                      document.getElementById('Findings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSearch(item.id);
                        document.getElementById('Findings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg transition-colors hover:bg-slate-100 cursor-pointer"
                  >
                    <span className="font-medium text-slate-900">{item.id}</span>
                    <span className="tabular-nums px-2 py-1 bg-orange-100 text-orange-700 rounded text-sm font-medium">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!compliance.compliance.owasp_top_10 || compliance.compliance.owasp_top_10.length === 0) &&
           (!compliance.compliance.cwe_top_25 || compliance.compliance.cwe_top_25.length === 0) && (
            <p className="text-slate-500 text-sm">No compliance mappings found for this scan.</p>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm pt-2 pb-2 -mx-8 px-8">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          selectedSeverities={selectedSeverities}
          onSeverityChange={setSelectedSeverities}
          selectedTools={selectedTools}
          onToolChange={setSelectedTools}
          availableTools={availableTools}
        />
      </div>

      {/* Findings Table */}
      <div id="Findings" className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">
          Findings <span className="tabular-nums text-slate-500 font-normal">({filteredFindings.length} total)</span>
        </h3>
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left p-2 text-xs font-medium uppercase tracking-wide text-slate-500">Severity</th>
              <th className="text-left p-2 text-xs font-medium uppercase tracking-wide text-slate-500">Title</th>
              <th className="text-left p-2 text-xs font-medium uppercase tracking-wide text-slate-500">Tool</th>
              <th className="text-left p-2 text-xs font-medium uppercase tracking-wide text-slate-500">Host/Package</th>
            </tr>
          </thead>
          <tbody>
            {filteredFindings.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-sm text-slate-500">
                  No findings match the current filters.
                </td>
              </tr>
            ) : (
              filteredFindings.map((finding, idx) => (
                <tr
                  key={idx}
                  className={`border-b border-slate-100 cursor-pointer transition-colors ${
                    selectedFinding === finding ? 'bg-teal-50' : 'hover:bg-slate-50'
                  }`}
                  tabIndex={0}
                  role="button"
                  onClick={() => setSelectedFinding(finding)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedFinding(finding);
                    }
                  }}
                >
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${getSeverityColor(finding.severity)}`}>
                      {finding.severity}
                    </span>
                  </td>
                  <td className="p-2">{finding.title}</td>
                  <td className="p-2 text-slate-600">{finding.tool}</td>
                  <td className="p-2 text-slate-600">{finding.host || finding.package || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Finding Detail Panel */}
      <FindingDetailModal
        finding={selectedFinding}
        projectId={projectId}
        scanId={selectedScanId ?? undefined}
        onClose={() => setSelectedFinding(null)}
        onPrev={() => {
          if (!selectedFinding) return;
          const idx = filteredFindings.indexOf(selectedFinding);
          if (idx > 0) setSelectedFinding(filteredFindings[idx - 1]);
        }}
        onNext={() => {
          if (!selectedFinding) return;
          const idx = filteredFindings.indexOf(selectedFinding);
          if (idx >= 0 && idx < filteredFindings.length - 1) setSelectedFinding(filteredFindings[idx + 1]);
        }}
        hasPrev={!!selectedFinding && filteredFindings.indexOf(selectedFinding) > 0}
        hasNext={!!selectedFinding && filteredFindings.indexOf(selectedFinding) < filteredFindings.length - 1}
        position={
          selectedFinding && filteredFindings.indexOf(selectedFinding) >= 0
            ? `${filteredFindings.indexOf(selectedFinding) + 1} of ${filteredFindings.length}`
            : undefined
        }
      />
    </div>
  );
};

export default UnifiedReportPage;
