import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { UnifiedReport, TrendData, Finding } from '../types';
import SeverityPieChart from '../components/SeverityPieChart';
import ToolBarChart from '../components/ToolBarChart';
import TrendLineChart from '../components/TrendLineChart';
import TableOfContents from '../components/TableOfContents';
import FilterBar from '../components/FilterBar';
import FindingDetailModal from '../components/FindingDetailModal';
import { ArrowLeft, Download } from 'lucide-react';

const UnifiedReportPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<UnifiedReport | null>(null);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSection, setCurrentSection] = useState<string>('Summary');
  const [search, setSearch] = useState('');
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const sections = ['Summary', 'Severity Distribution', 'Tool Comparison', 'Historical Trend', 'Findings'];

  useEffect(() => {
    if (!projectId) return;

    api.reports.getUnified(projectId)
      .then(data => {
        setReport(data);
        return api.reports.getTrends(projectId);
      })
      .then(trendsData => {
        setTrends(trendsData);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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

  // Compute available tools and filter findings
  const availableTools = [...new Set(report.findings.map(f => f.tool).filter(Boolean))] as string[];
  const filteredFindings = report.findings.filter(f => {
    // Search filter
    if (search && !f.title.toLowerCase().includes(search.toLowerCase()) &&
        !f.description?.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    // Severity filter
    if (selectedSeverities.length > 0 && !selectedSeverities.includes(f.severity)) {
      return false;
    }
    // Tool filter
    if (selectedTools.length > 0 && !selectedTools.includes(f.tool)) {
      return false;
    }
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/projects/${projectId}`)} className="p-2 hover:bg-slate-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-semibold text-slate-900">Security Report</h1>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg">
          <Download className="w-4 h-4" />
          Export PDF
        </button>
      </div>

      <TableOfContents
        sections={sections}
        currentSection={currentSection}
        onSectionClick={setCurrentSection}
      />

      {/* Summary Cards */}
      <div id="Summary" className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-3xl font-bold text-red-600">{report.severity.critical}</div>
          <div className="text-sm text-slate-500">Critical</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-3xl font-bold text-orange-600">{report.severity.high}</div>
          <div className="text-sm text-slate-500">High</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-3xl font-bold text-yellow-600">{report.severity.medium}</div>
          <div className="text-sm text-slate-500">Medium</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-3xl font-bold text-green-600">{report.severity.low}</div>
          <div className="text-sm text-slate-500">Low</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div id="Severity Distribution" className="bg-white rounded-xl border border-slate-200 p-6">
          <SeverityPieChart
            critical={report.severity.critical}
            high={report.severity.high}
            medium={report.severity.medium}
            low={report.severity.low}
          />
        </div>
        <div id="Tool Comparison" className="bg-white rounded-xl border border-slate-200 p-6">
          <ToolBarChart
            tools={[
              { tool: 'Trivy FS', findings: 23, critical: 1, high: 5, medium: 10, low: 7 },
              { tool: 'ZAP', findings: 8, critical: 2, high: 3, medium: 2, low: 1 },
            ]}
          />
        </div>
      </div>

      {/* Trend Chart */}
      <div id="Historical Trend" className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Historical Trend (Last 30 Days)</h3>
        {trends.length > 0 ? (
          <TrendLineChart data={trends} />
        ) : (
          <p className="text-slate-500">No trend data available</p>
        )}
      </div>

      {/* Filter Bar */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        selectedSeverities={selectedSeverities}
        onSeverityChange={setSelectedSeverities}
        selectedTools={selectedTools}
        onToolChange={setSelectedTools}
        availableTools={availableTools}
      />

      {/* Findings Table */}
      <div id="Findings" className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Findings ({filteredFindings.length} total)
        </h3>
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Severity</th>
              <th className="text-left p-2">Title</th>
              <th className="text-left p-2">Tool</th>
              <th className="text-left p-2">Host/Package</th>
            </tr>
          </thead>
          <tbody>
            {filteredFindings.map((finding, idx) => (
              <tr
                key={idx}
                className="border-b cursor-pointer hover:bg-slate-50"
                onClick={() => setSelectedFinding(finding)}
              >
                <td className="p-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    finding.severity === 'Critical' ? 'bg-red-100 text-red-700' :
                    finding.severity === 'High' ? 'bg-orange-100 text-orange-700' :
                    finding.severity === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {finding.severity}
                  </span>
                </td>
                <td className="p-2">{finding.title}</td>
                <td className="p-2">{finding.tool}</td>
                <td className="p-2">{finding.host || finding.package || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Finding Detail Modal */}
      <FindingDetailModal
        finding={selectedFinding}
        onClose={() => setSelectedFinding(null)}
      />
    </div>
  );
};

export default UnifiedReportPage;
