import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bug, Plus, Loader2 } from 'lucide-react';
import { useRbac } from '../hooks/useRbac';
import { useCreateIssue } from '../hooks/useIssues';
import { api } from '../services/api';
import { useToast } from './Toast';
import { Modal } from './ui/Modal';
import { Badge } from './ui/Badge';
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
          <div>
            <dt className="text-sm font-medium text-slate-500">Package</dt>
            <dd className="text-sm text-slate-900">{finding.package}</dd>
          </div>
        )}

        {finding.tool && (
          <div>
            <dt className="text-sm font-medium text-slate-500">Tool</dt>
            <dd className="text-sm text-slate-900">{finding.tool}</dd>
          </div>
        )}

        {finding.recommendation && (
          <div>
            <dt className="text-sm font-medium text-slate-500">Recommendation</dt>
            <dd className="text-sm text-slate-900">{finding.recommendation}</dd>
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
    </Modal>
  );
};
export default FindingDetailModal;
