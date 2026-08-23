import { useState, useMemo } from 'react';
import { ChevronDown, Search, Shield, Bug, AlertTriangle, Code, Layers } from 'lucide-react';
import type { Finding } from '../../types';
import FindingDetailModal from '../FindingDetailModal';

const severityColors: Record<string, { text: string; bg: string; border: string }> = {
  Critical: { text: 'text-[#A32D2D]', bg: 'bg-[#FCEBEB]', border: 'border-[#E24B4A]' },
  High: { text: 'text-[#854F0B]', bg: 'bg-[#FAEEDA]', border: 'border-[#EF9F27]' },
  Medium: { text: 'text-[#185FA5]', bg: 'bg-[#E6F1FB]', border: 'border-[#378ADD]' },
  Low: { text: 'text-[#3B6D11]', bg: 'bg-[#EAF3DE]', border: 'border-[#639922]' },
  Info: { text: 'text-[#5F5E5A]', bg: 'bg-[#F1EFE8]', border: 'border-slate-400' },
};

const SEVERITIES = ['All', 'Critical', 'High', 'Medium', 'Low'] as const;

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Bug; color: string; bg: string }> = {
  VULNERABILITY: { label: 'Security Vulnerabilities', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  BUG: { label: 'Reliability Issues', icon: Bug, color: 'text-amber-600', bg: 'bg-amber-50' },
  CODE_SMELL: { label: 'Maintainability Issues', icon: Code, color: 'text-blue-600', bg: 'bg-blue-50' },
};

interface FindingsTableProps {
  findings: (Finding & { tool: string })[];
  projectId?: string;
  scanId?: string;
  selectedTool?: string | null;
}

export const FindingsTable = ({ findings, projectId, scanId, selectedTool }: FindingsTableProps) => {
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('grouped');
  const [severityFilter, setSeverityFilter] = useState<string>('All');
  const [toolFilter, setToolFilter] = useState<string>(selectedTool || 'All');
  const [searchText, setSearchText] = useState('');
  const [selectedFinding, setSelectedFinding] = useState<(Finding & { tool: string }) | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});

  const uniqueTools = useMemo(() => {
    const tools = new Set<string>();
    findings.forEach((f) => tools.add(f.tool));
    return Array.from(tools);
  }, [findings]);

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { All: findings.length };
    findings.forEach((f) => {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
    });
    return counts;
  }, [findings]);

  // Filter findings FIRST
  const filteredFindings = useMemo(() => {
    const severityOrder: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1, Info: 0 };

    let filtered = findings;
    
    // Apply selectedTool filter (from tool click in side panel)
    if (selectedTool) filtered = filtered.filter((f) => f.tool === selectedTool);
    
    // Apply severity filter
    if (severityFilter !== 'All') filtered = filtered.filter((f) => f.severity === severityFilter);
    
    // Apply tool filter (from dropdown)
    if (toolFilter !== 'All' && !selectedTool) filtered = filtered.filter((f) => f.tool === toolFilter);
    
    // Apply search filter
    if (searchText) {
      const q = searchText.toLowerCase();
      filtered = filtered.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.rule?.toLowerCase().includes(q) ||
          f.finding_type?.toLowerCase().includes(q) ||
          f.package?.toLowerCase().includes(q) ||
          f.host?.toLowerCase().includes(q),
      );
    }

    return [...filtered].sort((a, b) => {
      const aScore = severityOrder[a.severity] ?? 0;
      const bScore = severityOrder[b.severity] ?? 0;
      return bScore - aScore;
    });
  }, [findings, selectedTool, severityFilter, toolFilter, searchText]);

  // Group FILTERED findings by type then by rule
  const groupedFindings = useMemo(() => {
    const groups: Record<string, { rule: string; title: string; findings: (Finding & { tool: string })[]; severity: Record<string, number> }[]> = {};

    filteredFindings.forEach((f) => {
      const type = f.finding_type || 'OTHER';
      const ruleKey = f.rule || f.description || 'unknown';

      if (!groups[type]) groups[type] = [];
      let ruleGroup = groups[type].find((g) => g.rule === ruleKey);
      if (!ruleGroup) {
        ruleGroup = { rule: ruleKey, title: f.title, findings: [], severity: {} };
        groups[type].push(ruleGroup);
      }
      ruleGroup.findings.push(f);
      const sev = f.severity.toLowerCase();
      ruleGroup.severity[sev] = (ruleGroup.severity[sev] || 0) + 1;
    });

    return groups;
  }, [filteredFindings]);

  // Sort groups by count desc
  const sortedTypes = useMemo(() => {
    const typeOrder = ['VULNERABILITY', 'BUG', 'CODE_SMELL', 'OTHER'];
    return Object.entries(groupedFindings)
      .sort(([a], [b]) => {
        const ai = typeOrder.indexOf(a);
        const bi = typeOrder.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
  }, [groupedFindings]);

  const toggleType = (type: string) => {
    setExpandedTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  // Zero findings state
  if (findings.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 flex flex-col items-center gap-3">
        <Shield className="w-12 h-12 text-green-400" />
        <p className="text-lg font-semibold text-slate-800">✓ No vulnerabilities found in this scan.</p>
        <p className="text-sm text-slate-500">This scan completed with zero security findings.</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            Findings — {filteredFindings.length}
            {filteredFindings.length !== findings.length && (
              <span className="text-sm font-normal text-slate-500"> of {findings.length}</span>
            )}
          </h3>
          <div className="flex items-center gap-1 bg-slate-200 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'grouped' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Grouped
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {SEVERITIES.map((sev) => {
              const count = severityCounts[sev] ?? 0;
              const active = severityFilter === sev;
              return (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                active
                  ? 'bg-slate-900 text-white shadow-md ring-2 ring-slate-400'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {sev}{count > 0 ? ` ${count}` : ''}
            </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={toolFilter}
              onChange={(e) => setToolFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="All">All tools</option>
              {uniqueTools.map((tool) => (
                <option key={tool} value={tool}>{tool.replace(/_/g, ' ')}</option>
              ))}
            </select>

            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by title, rule, type, package, or host…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {viewMode === 'grouped' ? (
          /* Grouped View */
          <div className="divide-y divide-slate-200">
            {sortedTypes.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No findings match the current filters.
              </div>
            ) : (
              sortedTypes.map(([type, ruleGroups]) => {
                const config = TYPE_CONFIG[type] || { label: 'Other', icon: Layers, color: 'text-slate-600', bg: 'bg-slate-50' };
                const Icon = config.icon;
                const typeTotal = ruleGroups.reduce((sum, g) => sum + g.findings.length, 0);
                const isExpanded = expandedTypes[type] ?? true;

                return (
                  <div key={type}>
                    {/* Type Header */}
                    <button
                      onClick={() => toggleType(type)}
                      className={`w-full flex items-center justify-between px-4 py-3 ${config.bg} hover:bg-opacity-80 transition-colors`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 ${config.color}`} />
                        <span className={`font-semibold text-sm ${config.color}`}>{config.label}</span>
                        <span className="text-sm font-bold text-slate-700">{typeTotal}</span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                    </button>

                    {isExpanded && (
                      <div className="divide-y divide-slate-100">
                        {ruleGroups.map((group) => {
                          const ruleKey = `${type}-${group.rule}`;
                          return (
                            <div key={ruleKey} className="px-4 py-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm text-slate-900">{group.title}</span>
                                  <span className="text-xs text-slate-500">({group.findings.length})</span>
                                </div>
                                <div className="flex gap-1">
                                  {Object.entries(group.severity).map(([sev, count]) => (
                                    <span
                                      key={sev}
                                      className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${severityColors[sev]?.bg || ''} ${severityColors[sev]?.text || ''}`}
                                    >
                                      {count} {sev.charAt(0)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-1">
                                {group.findings.slice(0, 3).map((finding) => (
                                  <div
                                    key={finding.id || finding.title}
                                    className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-2 py-1"
                                    onClick={() => setSelectedFinding(finding)}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${severityColors[finding.severity]?.bg || ''}`} />
                                    <span className="truncate">{finding.host || finding.package || finding.uri || 'Unknown'}</span>
                                    <span className="text-xs text-slate-400 ml-auto">{finding.tool}</span>
                                  </div>
                                ))}
                                {group.findings.length > 3 && (
                                  <div className="text-xs text-slate-500 pl-4">
                                    +{group.findings.length - 3} more
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* List View */
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase">Severity</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase">Title</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase">Location</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase">Tool</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFindings.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No findings match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredFindings.map((finding, idx) => (
                    <tr
                      key={finding.id || idx}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => setSelectedFinding(finding)}
                    >
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-semibold rounded ${severityColors[finding.severity]?.bg || ''} ${severityColors[finding.severity]?.text || ''}`}>
                          {finding.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-900 max-w-xs truncate">{finding.title}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                        {finding.host || finding.package || finding.uri || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{finding.tool}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Finding Detail Modal */}
      {selectedFinding && (
        <FindingDetailModal
          finding={selectedFinding}
          onClose={() => setSelectedFinding(null)}
          projectId={projectId}
          scanId={scanId}
        />
      )}
    </>
  );
};
