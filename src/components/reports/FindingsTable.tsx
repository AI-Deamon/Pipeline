import { useState, useMemo } from 'react';
import { ChevronDown, Shield, Bug, AlertTriangle, Code, Layers } from 'lucide-react';
import type { Finding } from '../../types';
import FindingDetailModal from '../FindingDetailModal';
import { FindingsFilterBar } from './FindingsFilterBar';
import { getSeverityColor, getSeverityDotColor } from '../../utils/risk';
import { findingKey } from '../../utils/scanDiff';
import { useRbac } from '../../hooks/useRbac';
import { useCreateIssue } from '../../hooks/useIssues';
import { useToast } from '../Toast';

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
  previousScanFindingKeys?: Set<string>; // from findingKey() over the previous scan's findings
}

export const FindingsTable = ({ findings, projectId, scanId, selectedTool, previousScanFindingKeys }: FindingsTableProps) => {
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('grouped');
  const [severityFilter, setSeverityFilter] = useState<string>('All');
  const [toolFilter, setToolFilter] = useState<string>(selectedTool || 'All');
  const [searchText, setSearchText] = useState('');
  const [selectedFinding, setSelectedFinding] = useState<(Finding & { tool: string }) | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { canAssignIssues } = useRbac();
  const createMutation = useCreateIssue();
  const { addToast } = useToast();

  const uniqueTools = useMemo(() => {
    const tools = new Set<string>();
    findings.forEach((f) => tools.add(f.tool));
    return Array.from(tools);
  }, [findings]);

  // Findings scoped to the active sidebar tool selection (if any), shared by the
  // severity badge counts and the main filtered list so both stay in sync.
  const toolScopedFindings = useMemo(
    () => (selectedTool ? findings.filter((f) => f.tool === selectedTool) : findings),
    [findings, selectedTool],
  );

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { All: toolScopedFindings.length };
    toolScopedFindings.forEach((f) => {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
    });
    return counts;
  }, [toolScopedFindings]);

  // Filter findings FIRST
  const filteredFindings = useMemo(() => {
    const severityOrder: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1, Info: 0 };

    let filtered = toolScopedFindings;

    // Apply severity filter
    if (severityFilter !== 'All') filtered = filtered.filter((f) => f.severity === severityFilter);
    
    // Apply tool filter (from dropdown) — inert whenever selectedTool is set, since the
    // dropdown is disabled and synced to selectedTool in that case (see render below)
    if (toolFilter !== 'All') filtered = filtered.filter((f) => f.tool === toolFilter);
    
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
  }, [toolScopedFindings, severityFilter, toolFilter, searchText]);

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

  // Keep the selection in sync with what's actually visible: a filter change
  // (severity/tool/search/selectedTool) can drop a previously-selected finding out
  // of filteredFindings. Deriving this on every render (rather than pruning
  // selectedIds itself in an effect, which would cause an extra render pass) means
  // the displayed count and handleBulkCreate's target list always agree — no
  // silent undercount, and no need for the raw selection to ever be "wrong".
  const visibleSelectedIds = useMemo(() => {
    if (selectedIds.size === 0) return selectedIds;
    const visible = new Set(filteredFindings.map((f) => f.id));
    let changed = false;
    const next = new Set<string>();
    selectedIds.forEach((id) => {
      if (visible.has(id)) next.add(id);
      else changed = true;
    });
    return changed ? next : selectedIds;
  }, [selectedIds, filteredFindings]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllCritical = () => {
    setSelectedIds(new Set(filteredFindings.filter((f) => f.severity === 'Critical').map((f) => f.id)));
  };

  const handleBulkCreate = async () => {
    if (!projectId || !scanId) return;
    // No `f.tool` guard here: the FindingsTableProps type requires `tool: string`
    // on every finding, so all of filteredFindings already has it.
    const targets = filteredFindings.filter((f) => visibleSelectedIds.has(f.id));
    let created = 0;
    for (const finding of targets) {
      try {
        await createMutation.mutateAsync({
          issue_id: `${finding.id}:${scanId}`,
          project_id: projectId,
          tool_name: finding.tool,
          severity: finding.severity,
          title: finding.title,
          scan_id: scanId,
        });
        created++;
      } catch {
        // Tolerate individual failures — keep working through the rest of the
        // selection rather than aborting the whole batch on the first error.
      }
    }
    addToast({
      type: created === targets.length ? 'success' : 'error',
      title: `${created} issue${created === 1 ? '' : 's'} created`,
    });
    setSelectedIds(new Set());
  };

  const selectedIndex = selectedFinding ? filteredFindings.indexOf(selectedFinding) : -1;
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex >= 0 && selectedIndex < filteredFindings.length - 1;
  const goToPrev = () => hasPrev && setSelectedFinding(filteredFindings[selectedIndex - 1]);
  const goToNext = () => hasNext && setSelectedFinding(filteredFindings[selectedIndex + 1]);

  // Zero findings state
  if (findings.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 flex flex-col items-center gap-3">
        <Shield className="w-10 h-10 text-emerald-500" />
        <p className="text-lg font-semibold text-slate-800">No vulnerabilities found in this scan.</p>
        <p className="text-sm text-slate-500">This scan completed with zero security findings.</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            Findings — <span className="tabular-nums">{filteredFindings.length}</span>
            {filteredFindings.length !== findings.length && (
              <span className="text-sm font-normal text-slate-500 tabular-nums"> of {findings.length}</span>
            )}
            {(severityFilter !== 'All' || toolFilter !== (selectedTool || 'All') || searchText) && (
              <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">Filtered</span>
            )}
          </h3>
          <div className="flex items-center gap-3">
            {canAssignIssues && (
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAllCritical}
                  className="px-3 py-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Select all Critical
                </button>
                {visibleSelectedIds.size > 0 && (
                  <button
                    onClick={handleBulkCreate}
                    disabled={createMutation.isPending}
                    className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Create issues for selected ({visibleSelectedIds.size})
                  </button>
                )}
              </div>
            )}
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
        </div>

        {/* Filter bar */}
        <FindingsFilterBar
          search={searchText}
          onSearchChange={setSearchText}
          severityFilter={severityFilter}
          onSeverityChange={setSeverityFilter}
          toolFilter={selectedTool || toolFilter}
          onToolChange={setToolFilter}
          availableTools={uniqueTools}
          severityCounts={severityCounts}
          toolLocked={!!selectedTool}
        />

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
                                      className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${getSeverityColor(sev)}`}
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
                                    className={`flex items-center gap-2 text-sm text-slate-600 cursor-pointer rounded px-2 py-1 ${
                                      selectedFinding?.id === finding.id ? 'bg-teal-50' : 'hover:bg-slate-50'
                                    }`}
                                    onClick={() => setSelectedFinding(finding)}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${getSeverityDotColor(finding.severity)}`} />
                                    <span className="truncate">{finding.host || finding.package || finding.uri || 'Unknown'}</span>
                                    {previousScanFindingKeys && !previousScanFindingKeys.has(findingKey(finding)) && (
                                      <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 rounded">New</span>
                                    )}
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
                  {canAssignIssues && <th className="px-4 py-3 w-8" />}
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase">Severity</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase">Title</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase">Location</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase">Tool</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFindings.length === 0 ? (
                  <tr>
                    <td colSpan={canAssignIssues ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
                      No findings match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredFindings.map((finding, idx) => (
                    <tr
                      key={finding.id || idx}
                      className={`cursor-pointer ${selectedFinding?.id === finding.id ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
                      onClick={() => setSelectedFinding(finding)}
                    >
                      {canAssignIssues && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${finding.title}`}
                            checked={visibleSelectedIds.has(finding.id)}
                            onChange={() => toggleSelected(finding.id)}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-semibold rounded ${getSeverityColor(finding.severity)}`}>
                          {finding.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-900 max-w-xs truncate">
                        {finding.title}
                        {previousScanFindingKeys && !previousScanFindingKeys.has(findingKey(finding)) && (
                          <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 rounded">New</span>
                        )}
                      </td>
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

      {/* Finding Detail Panel */}
      {selectedFinding && (
        <FindingDetailModal
          finding={selectedFinding}
          onClose={() => setSelectedFinding(null)}
          projectId={projectId}
          scanId={scanId}
          onPrev={goToPrev}
          onNext={goToNext}
          hasPrev={hasPrev}
          hasNext={hasNext}
          position={selectedIndex >= 0 ? `${selectedIndex + 1} of ${filteredFindings.length}` : undefined}
        />
      )}
    </>
  );
};
