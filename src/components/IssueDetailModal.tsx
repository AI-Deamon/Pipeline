import { useState } from 'react';
import { X, Send, UserCheck, Loader2, Clock, Tag, FileCode, ExternalLink, RefreshCw } from 'lucide-react';
import { useIssue, useIssueHistory, useAssignIssue, useTransitionIssue, useAddComment } from '../hooks/useIssues';
import { useRbac } from '../hooks/useRbac';
import CodeSnippet from './CodeSnippet';
import RescanRequestModal from './RescanRequestModal';
import type { IssueHistoryEntry } from '../types';

function statusBtnClass(color: string): string {
  return `px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${color}`;
}

type IssueDetailModalProps = {
  issueId: number;
  onClose: () => void;
};

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

  const history = historyData?.history ?? [];

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-white rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
          <Loader2 size={24} className="animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
          <p className="text-red-600 text-sm">Failed to load issue details.</p>
          <button onClick={onClose} className="mt-4 text-sm text-blue-600 hover:underline">Close</button>
        </div>
      </div>
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
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 pt-12 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 truncate">{issue.title}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-400 block text-xs">Severity</span>
              <span className="font-semibold capitalize">{issue.severity}</span>
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
            {issue.assignee_id && (
              <div>
                <span className="text-slate-400 block text-xs">Assignee</span>
                <span>{issue.assignee_id}</span>
              </div>
            )}
            {(issue as any).file_path && (
              <div className="col-span-2">
                <span className="text-slate-400 block text-xs">File</span>
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <FileCode size={12} className="text-slate-400" />
                  <span>{(issue as any).file_path}</span>
                  {(issue as any).line_number && (
                    <span className="text-slate-400">:{(issue as any).line_number}</span>
                  )}
                  {(issue as any).git_url && (
                    <a
                      href={(issue as any).git_url}
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
                <span className="font-mono text-xs">{issue.rule}</span>
              </div>
            )}
            {((issue as any).tags && (issue as any).tags.length > 0) && (
              <div className="col-span-2">
                <span className="text-slate-400 block text-xs">Tags</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {((issue as any).tags as string[]).map((tag) => (
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
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{issue.description}</p>
            </div>
          )}

          {issue.recommendation && (
            <div className="bg-blue-50 rounded-lg p-3">
              <span className="text-blue-700 text-xs font-semibold block mb-1">Recommendation</span>
              <p className="text-sm text-blue-800">{issue.recommendation}</p>
            </div>
          )}

          {(issue as any).file_path && (issue as any).line_number && (
            <CodeSnippet
              snippet={issue.code_snippet ?? null}
              language={(issue as any).code_snippet_language}
              highlightLine={(issue as any).line_number}
              startLine={Math.max(1, (issue as any).line_number - 10)}
              file={(issue as any).file_path}
              gitUrl={(issue as any).git_url}
            />
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-200 flex flex-wrap gap-2">
          {canAssign && (
            showAssign ? (
              <div className="flex items-center gap-2 w-full">
                <input
                  type="text"
                  placeholder="Username..."
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:border-blue-400 outline-none"
                  autoFocus
                />
                <button
                  onClick={handleAssign}
                  disabled={!assigneeId.trim() || assignMutation.isPending}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  {assignMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={14} />}
                  Assign
                </button>
                <button onClick={() => setShowAssign(false)} className="text-xs text-slate-400">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setShowAssign(true)} className={statusBtnClass('border-blue-200 text-blue-700 hover:bg-blue-50')}>
                <UserCheck size={14} className="inline mr-1" /> Assign
              </button>
            )
          )}
          {canStartWorking && (
            <button onClick={() => handleTransition('in_progress')} disabled={transitionMutation.isPending} className={statusBtnClass('border-yellow-200 text-yellow-700 hover:bg-yellow-50')}>
              Start Working
            </button>
          )}
          {canMarkFixed && (
            <button onClick={() => handleTransition('fixed')} disabled={transitionMutation.isPending} className={statusBtnClass('border-emerald-200 text-emerald-700 hover:bg-emerald-50')}>
              Mark Fixed
            </button>
          )}
          {canVerify && (
            <button onClick={() => handleTransition('verified')} disabled={transitionMutation.isPending} className={statusBtnClass('border-green-200 text-green-700 hover:bg-green-50')}>
              Verify
            </button>
          )}
          {canReject && (
            <button onClick={() => handleTransition('rejected')} disabled={transitionMutation.isPending} className={statusBtnClass('border-red-200 text-red-700 hover:bg-red-50')}>
              Reject
            </button>
          )}
          {canRequestRescan && (
            <button
              onClick={() => setShowRescanRequest(true)}
              className={statusBtnClass('border-purple-200 text-purple-700 hover:bg-purple-50')}
            >
              <RefreshCw size={14} className="inline mr-1" /> Request Rescan
            </button>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-200">
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
                  {entry.change_type === 'comment' && entry.comment ? (
                    <span>: {entry.comment}</span>
                  ) : entry.field_name === 'assignee_id' ? (
                    <span> assigned issue to {entry.new_value}</span>
                  ) : entry.field_name === 'status' ? (
                    <span> changed status from <span className="font-mono">{entry.old_value?.replace('_', ' ') || 'none'}</span> to <span className="font-mono">{entry.new_value?.replace('_', ' ')}</span></span>
                  ) : entry.field_name === 'priority' ? (
                    <span> set priority to {entry.new_value}</span>
                  ) : entry.comment ? (
                    <span>: {entry.comment}</span>
                  ) : null}
                  <span className="block text-slate-400 mt-0.5">{entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showRescanRequest && (
        <RescanRequestModal
          issueId={issueId}
          onClose={() => setShowRescanRequest(false)}
        />
      )}
    </div>
  );
}
