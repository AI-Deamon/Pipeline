import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bug, Plus, Loader2, ExternalLink, Package, Shield, Zap } from 'lucide-react';
import { useRbac } from '../hooks/useRbac';
import { useCreateIssue } from '../hooks/useIssues';
import { api } from '../services/api';
import { useToast } from './Toast';
import { Modal } from './ui/Modal';
import { Badge } from './ui/Badge';
import { isSafeHttpUrl } from '../utils/url';
import type { Finding } from '../types';

interface FindingDetailModalProps {
  finding: Finding | null;
  projectId?: string;
  scanId?: string;
  onClose: () => void;
}

const severityVariant: Record<string, 'danger' | 'warning' | 'info' | 'default'> = {
  Critical: 'danger',
  High: 'warning',
  Medium: 'info',
  Low: 'default',
  Info: 'default',
};

const FindingDetailModal: React.FC<FindingDetailModalProps> = ({
  finding,
  projectId,
  scanId,
  onClose,
}) => {
  const navigate = useNavigate();
  const [hasSearched, setHasSearched] = useState(false);

  const isOpen = !!finding;
  const { canAssignIssues } = useRbac();
  const { addToast } = useToast();
  const createMutation = useCreateIssue();

  const enabled = isOpen && !!projectId && !!finding?.tool && canAssignIssues;

  const {
    data: matchedIssue,
    isFetching: isSearching,
    refetch: searchForIssue,
  } = useQuery({
    queryKey: ['finding-lookup', projectId, finding?.tool, finding?.id],
    queryFn: () => api.issues.findByFindingKey(projectId!, finding!.tool!, finding!.id),
    enabled: false,
  });

  if (!finding) return null;

  const handleOpenInIssueTracker = async () => {
    if (!enabled) return;
    setHasSearched(true);
    const result = await searchForIssue();
    if (result.data) {
      addToast({ type: 'success', title: 'Issue found' });
      onClose();
      navigate(`/projects/${projectId}/issues/${finding.tool}?highlight=${result.data.id}`);
    }
  };

  const handleCreateIssue = async () => {
    if (!projectId || !scanId || !finding.tool) return;
    try {
      const compositeId = `${finding.id}:${scanId}`;
      const created = await createMutation.mutateAsync({
        issue_id: compositeId,
        project_id: projectId,
        tool_name: finding.tool,
        severity: finding.severity,
        title: finding.title,
        scan_id: scanId,
      });
      addToast({ type: 'success', title: 'Issue created' });
      onClose();
      navigate(`/projects/${projectId}/issues/${finding.tool}?highlight=${created.id}`);
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Failed to create issue',
        message: (e as Error).message,
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Finding Details" size="lg">
      <div className="max-h-[60vh] overflow-y-auto">
        <div className="mb-4">
          <Badge variant={severityVariant[finding.severity] || 'default'} size="md">
            {finding.severity}
          </Badge>
        </div>

        <h3 className="text-lg font-medium text-slate-900 mb-3">{finding.title}</h3>

        <dl className="space-y-3">
        <div>
          <dt className="text-sm font-medium text-slate-500">ID</dt>
          <dd className="text-sm text-slate-900">{finding.id}</dd>
        </div>

        {finding.description && (
          <div>
            <dt className="text-sm font-medium text-slate-500">Description</dt>
            <dd className="text-sm text-slate-900">{finding.description}</dd>
          </div>
        )}

        {finding.cve && (
          <div>
            <dt className="text-sm font-medium text-slate-500">CVE</dt>
            <dd className="text-sm text-slate-900">{finding.cve}</dd>
          </div>
        )}

        {finding.cvss_score && finding.cvss_score > 0 && (
          <div>
            <dt className="text-sm font-medium text-slate-500">CVSS Score</dt>
            <dd className="text-sm text-slate-900">
              <span className="font-semibold">{finding.cvss_score}</span>
              {finding.cvss_severity && (
                <span className="ml-2 text-xs text-slate-500">({finding.cvss_severity})</span>
              )}
            </dd>
          </div>
        )}

        {finding.file_path && (
          <div>
            <dt className="text-sm font-medium text-slate-500">File</dt>
            <dd className="text-sm text-slate-900 font-mono">
              {finding.file_path}
              {finding.line_number && <span className="text-slate-500">:{finding.line_number}</span>}
            </dd>
          </div>
        )}

        {finding.host && (
          <div>
            <dt className="text-sm font-medium text-slate-500">Host</dt>
            <dd className="text-sm text-slate-900">{finding.host}</dd>
          </div>
        )}

        {finding.port && (
          <div>
            <dt className="text-sm font-medium text-slate-500">Port</dt>
            <dd className="text-sm text-slate-900">{finding.port}</dd>
          </div>
        )}

        {finding.package && (
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-400" />
            <div>
              <dt className="text-sm font-medium text-slate-500">Package</dt>
              <dd className="text-sm text-slate-900">
                {finding.package}
                {finding.package_version && (
                  <span className="ml-1 text-slate-500">v{finding.package_version}</span>
                )}
                {finding.fixed_version && (
                  <span className="ml-2 text-green-600 font-medium">→ {finding.fixed_version}</span>
                )}
              </dd>
            </div>
          </div>
        )}

        {finding.tool && (
          <div>
            <dt className="text-sm font-medium text-slate-500">Tool</dt>
            <dd className="text-sm text-slate-900">{finding.tool}</dd>
          </div>
        )}

        {finding.fix_command && (
          <div className="flex items-start gap-2">
            <Zap className="w-4 h-4 text-green-600 mt-0.5" />
            <div>
              <dt className="text-sm font-medium text-slate-500">Fix Command</dt>
              <dd className="text-sm text-slate-900 font-mono bg-slate-900 text-green-400 p-2 rounded">
                {finding.fix_command}
              </dd>
            </div>
          </div>
        )}

        {finding.recommendation && (
          <div>
            <dt className="text-sm font-medium text-slate-500">Recommendation</dt>
            <dd className="text-sm text-slate-900">{finding.recommendation}</dd>
          </div>
        )}

        {finding.cwe_ids && finding.cwe_ids.length > 0 && (
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-slate-400 mt-0.5" />
            <div>
              <dt className="text-sm font-medium text-slate-500">CWE IDs</dt>
              <dd className="flex flex-wrap gap-1 mt-1">
                {finding.cwe_ids.map((cwe) => (
                  <span key={cwe} className="px-2 py-0.5 text-xs font-mono bg-slate-100 text-slate-700 rounded">
                    {cwe}
                  </span>
                ))}
              </dd>
            </div>
          </div>
        )}

        {finding.references && finding.references.length > 0 && (
          <div>
            <dt className="text-sm font-medium text-slate-500">References</dt>
            <dd className="space-y-1 mt-1">
              {finding.references.slice(0, 5).map((ref, idx) =>
                isSafeHttpUrl(ref) ? (
                  <a
                    key={idx}
                    href={ref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 truncate"
                  >
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{ref}</span>
                  </a>
                ) : (
                  <span key={idx} className="flex items-center gap-1 text-xs text-slate-500 truncate">
                    <span className="truncate">{ref}</span>
                  </span>
                )
              )}
            </dd>
          </div>
        )}

        {finding.rule && (
          <div>
            <dt className="text-sm font-medium text-slate-500">Rule</dt>
            <dd className="text-sm text-slate-900">
              {finding.rule_name && <span className="font-medium">{finding.rule_name}<br /></span>}
              <span className="font-mono text-xs text-slate-500">{finding.rule}</span>
            </dd>
          </div>
        )}

        {finding.language && (
          <div>
            <dt className="text-sm font-medium text-slate-500">Language</dt>
            <dd className="text-sm text-slate-900">{finding.language}</dd>
          </div>
        )}
      </dl>

      {finding.raw_evidence && (
        <div className="mt-4">
          <dt className="text-sm font-medium text-slate-500 mb-2">Raw Evidence</dt>
          <pre className="text-xs bg-slate-50 p-3 rounded-lg overflow-x-auto">
            {finding.raw_evidence}
          </pre>
        </div>
      )}

      {canAssignIssues && projectId && finding.tool && (
        <div className="mt-6 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenInIssueTracker}
            disabled={isSearching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-40"
          >
            {isSearching ? <Loader2 size={12} className="animate-spin" /> : <Bug size={14} />}
            Open in Issue Tracker
          </button>
          {hasSearched && !matchedIssue && (
            <button
              type="button"
              onClick={handleCreateIssue}
              disabled={createMutation.isPending || !scanId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {createMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={14} />}
              Create issue
            </button>
          )}
          {hasSearched && matchedIssue && (
            <span className="text-xs text-emerald-600">Matched existing issue #{matchedIssue.id}</span>
          )}
        </div>
      )}
      </div>
    </Modal>
  );
};
export default FindingDetailModal;
