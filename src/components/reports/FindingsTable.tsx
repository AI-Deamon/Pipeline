import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Search, Shield, Bug, AlertTriangle, Code, Layers } from 'lucide-react';
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

export interface ToolFilterOption {
  key: string;
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skipped';
  findings: number;
}

interface FindingsTableProps {
  findings: (Finding & { tool: string })[];
  projectId?: string;
  scanId?: string;
  tools?: ToolFilterOption[];
}

/** A real file:line beats every fallback — "host" was frequently just the
 * project/scan target repeated identically on every row (finding #<TBD>,
 * caught during the reports-page redesign), which looked like distinguishing
 * data but wasn't. */
function locationOf(finding: Finding): string | null {
  if (finding.file_path) {
    return finding.line_number ? `${finding.file_path}:${finding.line_number}` : finding.file_path;
  }
  return finding.package || finding.uri || finding.host || null;
}

export const FindingsTable = ({ findings, projectId, scanId, tools }: FindingsTableProps) => {
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('grouped');
  const [severityFilter, setSeverityFilter] = useState<string>('All');
  const [toolFilter, setToolFilter] = useState<string>('All');
  const [searchText, setSearchText] = useState('');
  const [selectedFinding, setSelectedFinding] = useState<(Finding & { tool: string }) | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});
  const [expandedRules, setExpandedRules] = useState<Record<string, boolean>>({});

  const toolOptions = useMemo<ToolFilterOption[]>(() => {
    if (tools && tools.length > 0) return tools.filter((t) => t.findings > 0);
    const counts = new Map<string, number>();
    findings.forEach((f) => counts.set(f.tool, (counts.get(f.tool) ?? 0) + 1));
    return Array.from(counts.entries()).map(([key, count]) => ({
      key, name: key.replace(/_/g, ' '), status: 'pass' as const, findings: count,
    }));
  }, [tools, findings]);

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { All: findings.length };
    findings.forEach((f) => {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
    });
    return counts;
  }, [findings]);

  const filteredFindings = useMemo(() => {
    const severityOrder: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1, Info: 0 };

    let filtered = findings;
    if (toolFilter !== 'All') filtered = filtered.filter((f) => f.tool === toolFilter);
    if (severityFilter !== 'All') filtered = filtered.filter((f) => f.severity === severityFilter);

    if (searchText) {
      const q = searchText.toLowerCase();
      filtered = filtered.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.rule?.toLowerCase().includes(q) ||
          f.finding_type?.toLowerCase().includes(q) ||
          f.package?.toLowerCase().includes(q) ||
          f.file_path?.toLowerCase().includes(q) ||
          f.host?.toLowerCase().includes(q),
      );
    }

    return [...filtered].sort((a, b) => {
      const aScore = severityOrder[a.severity] ?? 0;
      const bScore = severityOrder[b.severity] ?? 0;
      return bScore - aScore;
    });
  }, [findings, toolFilter, severityFilter, searchText]);

  // Group FILTERED findings by type then by rule
  const groupedFindings = useMemo(() => {
    const groups: Record<string, { rule: string; title: string; findings: (Finding & { tool: string })[]; severity: Record<string, number> }[]> = {};

    filteredFindings.forEach((f) => {
      const type = f.finding_type || 'OTHER';
      // Grouping key must include the title, not just rule/description —
      // any two findings that both lack a `rule` (common on tools without
      // stable rule IDs) previously all fell into the same `'unknown'`
      // bucket and silently merged under whichever title got there first,
      // even when they were completely unrelated findings.
      const ruleKey = f.rule ? `rule:${f.rule}` : `title:${f.title}`;

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

  const toggleRule = (ruleKey: string) => {
    setExpandedRules((prev) => ({ ...prev, [ruleKey]: !prev[ruleKey] }));
  };

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

          {/* Tool chips — replaces the old sidebar "Tools" card and the plain
              dropdown; "All" is selected by default so findings across every
              tool show up immediately, no click required first. */}
          {toolOptions.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setToolFilter('All')}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  toolFilter === 'All'
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                All tools
              </button>
              {toolOptions.map((tool) => {
                const active = toolFilter === tool.key;
                return (
                  <button
                    key={tool.key}
                    onClick={() => setToolFilter(active ? 'All' : tool.key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                      active
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {tool.name} <span className="text-slate-400">{tool.findings}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by title, rule, type, package, file, or host…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
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
                          const isRuleExpanded = expandedRules[ruleKey] ?? false;
                          const hasMultiple = group.findings.length > 1;

                          return (
                            <div key={ruleKey}>
                              {/* One summary row per unique finding, not one row
                                  per occurrence — click to expand and see each
                                  occurrence's real location. */}
                              <button
                                onClick={() => hasMultiple ? toggleRule(ruleKey) : setSelectedFinding(group.findings[0])}
                                className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {hasMultiple ? (
                                    <ChevronRight className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isRuleExpanded ? 'rotate-90' : ''}`} />
                                  ) : (
                                    <span className="w-3.5 shrink-0" />
                                  )}
                                  <span className="font-medium text-sm text-slate-900 truncate">{group.title}</span>
                                  {hasMultiple && (
                                    <span className="text-xs text-slate-500 shrink-0">{group.findings.length} occurrences</span>
                                  )}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  {Object.entries(group.severity).map(([sev, count]) => (
                                    <span
                                      key={sev}
                                      className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${severityColors[sev]?.bg || ''} ${severityColors[sev]?.text || ''}`}
                                    >
                                      {count} {sev.charAt(0)}
                                    </span>
                                  ))}
                                </div>
                              </button>

                              {hasMultiple && isRuleExpanded && (
                                <div className="pb-2 pl-11 pr-4 space-y-0.5">
                                  {group.findings.map((finding, idx) => (
                                    <div
                                      key={finding.id || idx}
                                      className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-2 py-1.5"
                                      onClick={() => setSelectedFinding(finding)}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${severityColors[finding.severity]?.bg || ''}`} />
                                      <span className="truncate font-mono text-xs">
                                        {locationOf(finding) ?? <span className="text-slate-400 italic font-sans">Location unavailable</span>}
                                      </span>
                                      <span className="text-xs text-slate-400 ml-auto shrink-0">{finding.tool}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
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
                        {locationOf(finding) ?? '-'}
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
