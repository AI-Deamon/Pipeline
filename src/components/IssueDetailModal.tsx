import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, UserCheck, Loader2, Clock, Tag, FileCode, ExternalLink, RefreshCw, Code2, Bug } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useIssue, useIssueHistory, useAssignIssue, useTransitionIssue, useAddComment } from '../hooks/useIssues';
import { useRbac } from '../hooks/useRbac';
import { api } from '../services/api';
import CodeSnippet from './CodeSnippet';
import RescanRequestModal from './RescanRequestModal';
import { Modal } from './ui/Modal';
import { Badge } from './ui/Badge';
import type { IssueHistoryEntry } from '../types';

function statusBtnClass(color: string): string {
  return `px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${color}`;
}

function severityToBadgeVariant(severity: string, findingType?: string): 'danger' | 'warning' | 'info' {
  if (findingType === 'SECURITY_HOTSPOT') return 'info';
  if (severity === 'critical') return 'danger';
  if (severity === 'high') return 'warning';
  return 'info';
}

function renderHistoryEntryContent(entry: IssueHistoryEntry) {
  if (entry.change_type === 'comment' && entry.comment) {
    return <span>: {entry.comment}</span>;
  }
  if (entry.field_name === 'assignee_id') {
    return <span> assigned issue to {entry.new_value}</span>;
  }
  if (entry.field_name === 'status') {
    return <span> changed status from <span className="font-mono">{entry.old_value?.replace('_', ' ') || 'none'}</span> to <span className="font-mono">{entry.new_value?.replace('_', ' ')}</span></span>;
  }
  if (entry.field_name === 'priority') {
    return <span> set priority to {entry.new_value}</span>;
  }
  if (entry.comment) {
    return <span>: {entry.comment}</span>;
  }
  return null;
}

type IssueDetailModalProps = {
  issueId: number;
  onClose: () => void;
};

type StatusActionsProps = {
  canAssign: boolean;
  canStartWorking: boolean;
  canMarkFixed: boolean;
  canVerify: boolean;
  canReject: boolean;
  canRequestRescan: boolean;
  showAssign: boolean;
  assigneeId: string;
  projectMembers: Array<{ username: string }>;
  isAssignPending: boolean;
  isTransitionPending: boolean;
  onAssign: () => void;
  onTransition: (status: string) => void;
  onShowAssign: () => void;
  onCancelAssign: () => void;
  onAssigneeChange: (value: string) => void;
  onRequestRescan: () => void;
};

function StatusActions({
  canAssign,
  canStartWorking,
  canMarkFixed,
  canVerify,
  canReject,
  canRequestRescan,
  showAssign,
  assigneeId,
  projectMembers,
  isAssignPending,
  isTransitionPending,
  onAssign,
  onTransition,
  onShowAssign,
  onCancelAssign,
  onAssigneeChange,
  onRequestRescan,
}: StatusActionsProps) {
  return (
    <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap gap-2">
      {canAssign && (
        showAssign ? (
          <div className="flex items-center gap-2 w-full">
            <select
              value={assigneeId}
              onChange={(e) => onAssigneeChange(e.target.value)}
              disabled={projectMembers.length === 0}
              className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:border-blue-400 outline-none disabled:bg-slate-50 disabled:text-slate-400"
              autoFocus
            >
              <option value="">
                {projectMembers.length === 0 ? 'No project members' : 'Select user\u2026'}
              </option>
              {projectMembers.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.username}
                </option>
              ))}
            </select>
            <button
              onClick={onAssign}
              disabled={!assigneeId.trim() || isAssignPending || projectMembers.length === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {isAssignPending ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={14} />}
              Assign
            </button>
            <button onClick={onCancelAssign} className="text-xs text-slate-400">Cancel</button>
          </div>
        ) : (
          <button onClick={onShowAssign} className={statusBtnClass('border-blue-200 text-blue-700 hover:bg-blue-50')}>
            <UserCheck size={14} className="inline mr-1" /> Assign
          </button>
        )
      )}
      {canStartWorking && (
        <button onClick={() => onTransition('in_progress')} disabled={isTransitionPending} className={statusBtnClass('border-yellow-200 text-yellow-700 hover:bg-yellow-50')}>
          Start Working
        </button>
      )}
      {canMarkFixed && (
        <button onClick={() => onTransition('fixed')} disabled={isTransitionPending} className={statusBtnClass('border-emerald-200 text-emerald-700 hover:bg-emerald-50')}>
          Mark Fixed
        </button>
      )}
      {canVerify && (
        <button onClick={() => onTransition('verified')} disabled={isTransitionPending} className={statusBtnClass('border-green-200 text-green-700 hover:bg-green-50')}>
          Verify
        </button>
      )}
      {canReject && (
        <button onClick={() => onTransition('rejected')} disabled={isTransitionPending} className={statusBtnClass('border-red-200 text-red-700 hover:bg-red-50')}>
          Reject
        </button>
      )}
      {canRequestRescan && (
        <button
          onClick={onRequestRescan}
          className={statusBtnClass('border-purple-200 text-purple-700 hover:bg-purple-50')}
        >
          <RefreshCw size={14} className="inline mr-1" /> Request Rescan
        </button>
      )}
    </div>
  );
}

export default function IssueDetailModal({ issueId, onClose }: IssueDetailModalProps) {
  const { data: issue, isLoading, error } = useIssue(issueId);
  const { data: historyData } = useIssueHistory(issueId);
  const { canAssignIssues, canVerifyIssues, canUpdateAssignedIssues } = useRbac();

  const assignMutation = useAssignIssue();
  const transitionMutation = useTransitionIssue();
  const commentMutation = useAddComment();

  const [assigneeId, setAssigneeId] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showRescanRequest, setShowRescanRequest] = useState(false);

  const { data: projectMembers = [] } = useQuery({
    queryKey: ['issue', issueId, 'project-members', issue?.project_id],
    queryFn: async () => {
      if (!issue?.project_id) return [];
      try {
        const allUsers = await api.rbac.getUsers();
        return allUsers.map((u) => ({ username: u.username }));
      } catch {
        return [];
      }
    },
    enabled: !!issue?.project_id && canAssignIssues,
    staleTime: 60_000,
  });

  const history = historyData?.history ?? [];

  if (isLoading) {
    return (
      <Modal isOpen={true} onClose={onClose} title="Loading..." size="md">
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-blue-600" />
        </div>
      </Modal>
    );
  }

  if (error || !issue) {
    return (
      <Modal isOpen={true} onClose={onClose} title="Error" size="sm">
        <p className="text-red-600 text-sm">Failed to load issue details.</p>
        <button onClick={onClose} className="mt-4 text-sm text-blue-600 hover:underline">Close</button>
      </Modal>
    );
  }

  const status = issue.status;
  const handleAssign = () => {
    if (!assigneeId.trim()) return;
    assignMutation.mutate({ issueId, data: { assignee_id: assigneeId.trim() } });
    setShowAssign(false);
  };

  const handleTransition = (toStatus: string) => {
    transitionMutation.mutate({ issueId, data: { status: toStatus } });
  };

  const handleComment = () => {
    if (!commentText.trim()) return;
    commentMutation.mutate({ issueId, message: commentText.trim() });
    setCommentText('');
  };

  const canAssign = status === 'open' && canAssignIssues;
  const canStartWorking = status === 'assigned' && canUpdateAssignedIssues;
  const canMarkFixed = status === 'in_progress' && canUpdateAssignedIssues;
  const canVerify = status === 'fixed' && canVerifyIssues;
  const canReject = status !== 'verified' && status !== 'rejected' && status !== 'open' && canVerifyIssues;
  const canRequestRescan = (status === 'fixed' || status === 'in_progress') && canUpdateAssignedIssues;

  return (
    <Modal isOpen={true} onClose={onClose} title={issue.title} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-400 block text-xs">Severity</span>
            <Badge variant={severityToBadgeVariant(issue.severity, issue.finding_type)} size="md">
              {issue.severity}
            </Badge>
          </div>
          <div>
            <span className="text-slate-400 block text-xs">Status</span>
            <span className="font-semibold capitalize">{issue.status.replace('_', ' ')}</span>
          </div>
          {issue.tool_name && (
            <div>
              <span className="text-slate-400 block text-xs">Tool</span>
              <span className="capitalize">{issue.tool_name}</span>
            </div>
          )}
          {issue.finding_type && (
            <div>
              <span className="text-slate-400 block text-xs">Finding Type</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                issue.finding_type === 'SECURITY_HOTSPOT'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-slate-100 text-slate-600'
              }`}>
                {issue.finding_type === 'SECURITY_HOTSPOT' ? 'Security Hotspot' : issue.finding_type.replace(/_/g, ' ')}
              </span>
            </div>
          )}
          <div>
            <span className="text-slate-400 block text-xs">Issue ID</span>
            <span className="font-mono text-xs text-slate-600">{issue.issue_id}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-xs">First Seen</span>
            <span className="text-xs text-slate-600">{new Date(issue.first_seen_at).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-xs">Last Seen</span>
            <span className="text-xs text-slate-600">{new Date(issue.last_seen_at).toLocaleString()}</span>
          </div>
          {issue.resolved_at && (
            <div>
              <span className="text-slate-400 block text-xs">Resolved At</span>
              <span className="text-xs text-green-600">{new Date(issue.resolved_at).toLocaleString()}</span>
            </div>
          )}
          {issue.sonar_status && (
            <div>
              <span className="text-slate-400 block text-xs">Sonar Status</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                issue.sonar_status === 'REVIEWED'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-amber-50 text-amber-700'
              }`}>
                {issue.sonar_status.replace(/_/g, ' ')}
              </span>
            </div>
          )}
          {issue.sonar_resolution && (
            <div>
              <span className="text-slate-400 block text-xs">Sonar Resolution</span>
              <span className="text-xs text-slate-600 capitalize">{issue.sonar_resolution.replace(/_/g, ' ')}</span>
            </div>
          )}
          {issue.sonar_url && (
            <div className="col-span-2">
              <a
                href={issue.sonar_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                <Bug size={12} /> View in SonarQube <ExternalLink size={10} />
              </a>
            </div>
          )}
          {issue.assignee_id && (
            <div>
              <span className="text-slate-400 block text-xs">Assignee</span>
              <span>{issue.assignee_id}</span>
            </div>
          )}
          {issue.file_path && (
            <div className="col-span-2">
              <span className="text-slate-400 block text-xs">File</span>
              <div className="flex items-center gap-1.5 font-mono text-xs">
                <FileCode size={12} className="text-slate-400" />
                <span>{issue.file_path}</span>
                {issue.line_number && (
                  <span className="text-slate-400">:{issue.line_number}</span>
                )}
                {issue.git_url && (
                  <a
                    href={issue.git_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-blue-600 hover:underline inline-flex items-center gap-0.5"
                  >
                    view <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          )}
          {issue.effort && (
            <div>
              <span className="text-slate-400 block text-xs">Effort</span>
              <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded">
                <Clock size={12} /> {issue.effort}
              </span>
            </div>
          )}
          {issue.rule && (
            <div>
              <span className="text-slate-400 block text-xs">Rule</span>
              <div>
                {issue.rule_name && (
                  <span className="text-xs font-medium text-slate-700 block">{issue.rule_name}</span>
                )}
                <span className="font-mono text-xs text-slate-500">{issue.rule}</span>
              </div>
            </div>
          )}
          {issue.language && (
            <div>
              <span className="text-slate-400 block text-xs">Language</span>
              <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                <Code2 size={12} /> {issue.language}
              </span>
            </div>
          )}
          {(issue.tags && issue.tags.length > 0) && (
            <div className="col-span-2">
              <span className="text-slate-400 block text-xs">Tags</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {issue.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                    <Tag size={10} /> {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

          {issue.description && (
            <div>
              <span className="text-slate-400 block text-xs mb-1">Description</span>
              {issue.description.includes('<') ? (
                <div
                  className="text-sm text-slate-700 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(issue.description) }}
                />
              ) : (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{issue.description}</p>
              )}
            </div>
          )}

          {issue.recommendation && (
            <div className="bg-blue-50 rounded-lg p-3">
              <span className="text-blue-700 text-xs font-semibold block mb-1">Recommendation</span>
              {issue.recommendation.includes('<') ? (
                <div
                  className="text-sm text-blue-800 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(issue.recommendation) }}
                />
              ) : (
                <p className="text-sm text-blue-800 whitespace-pre-wrap">{issue.recommendation}</p>
              )}
            </div>
          )}

        {issue.file_path && issue.line_number && (
          <CodeSnippet
            snippet={issue.code_snippet ?? null}
            language={issue.code_snippet_language}
            highlightLine={issue.line_number}
            startLine={Math.max(1, issue.line_number - 10)}
            file={issue.file_path}
            gitUrl={issue.git_url}
          />
        )}
      </div>

      <StatusActions
        canAssign={canAssign}
        canStartWorking={canStartWorking}
        canMarkFixed={canMarkFixed}
        canVerify={canVerify}
        canReject={canReject}
        canRequestRescan={canRequestRescan}
        showAssign={showAssign}
        assigneeId={assigneeId}
        projectMembers={projectMembers}
        isAssignPending={assignMutation.isPending}
        isTransitionPending={transitionMutation.isPending}
        onAssign={handleAssign}
        onTransition={handleTransition}
        onShowAssign={() => setShowAssign(true)}
        onCancelAssign={() => setShowAssign(false)}
        onAssigneeChange={setAssigneeId}
        onRequestRescan={() => setShowRescanRequest(true)}
      />

      <div className="mt-4 pt-4 border-t border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            placeholder="Add a comment..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleComment()}
            className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:border-blue-400 outline-none"
          />
          <button
            onClick={handleComment}
            disabled={!commentText.trim() || commentMutation.isPending}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-40"
          >
            {commentMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        {history.length > 0 && (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {history.slice().reverse().map((entry: IssueHistoryEntry) => (
              <div key={entry.id} className="text-xs text-slate-500 border-l-2 border-slate-200 pl-3 py-1">
                <span className="font-medium text-slate-700">{entry.actor_id || 'system'}</span>
                {renderHistoryEntryContent(entry)}
                <span className="block text-slate-400 mt-0.5">{entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showRescanRequest && (
        <RescanRequestModal
          issueId={issueId}
          onClose={() => setShowRescanRequest(false)}
        />
      )}
    </Modal>
  );
}
