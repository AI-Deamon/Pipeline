import { memo } from 'react';
import { CheckCircle, XCircle, Loader2, FileCode, Clock, User } from 'lucide-react';
import type { PendingVerificationItem } from '../types';

type RescanRequestCardProps = {
  request: PendingVerificationItem;
  onVerify?: (request: PendingVerificationItem) => void;
  onReject?: (request: PendingVerificationItem) => void;
  isVerifying?: boolean;
  isRejecting?: boolean;
};

function severityClass(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical': return 'bg-red-100 text-red-700';
    case 'high': return 'bg-orange-100 text-orange-700';
    case 'medium': return 'bg-yellow-100 text-yellow-700';
    case 'low': return 'bg-blue-100 text-blue-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

const RescanRequestCard = memo(function RescanRequestCard({
  request,
  onVerify,
  onReject,
  isVerifying,
  isRejecting,
}: RescanRequestCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${severityClass(request.issue_severity)}`}>
              {request.issue_severity}
            </span>
            <span className="text-xs text-slate-500 inline-flex items-center gap-1">
              <FileCode size={12} /> {request.tool}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-900 truncate">{request.issue_title}</h3>
          <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1">
            <User size={12} /> {request.requested_by_name} • <Clock size={12} /> {request.fix_elapsed_minutes}m ago
          </p>
        </div>
      </div>

      {request.fix_note && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 whitespace-pre-wrap">
          {request.fix_note}
        </div>
      )}

      {request.commit_sha && (
        <div className="text-xs text-slate-500 font-mono">commit: {request.commit_sha}</div>
      )}

      {(onVerify || onReject) && (
        <div className="flex gap-2 pt-1">
          {onVerify && (
            <button
              onClick={() => onVerify(request)}
              disabled={isVerifying || isRejecting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              {isVerifying ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              Verify Now
            </button>
          )}
          {onReject && (
            <button
              onClick={() => onReject(request)}
              disabled={isVerifying || isRejecting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              {isRejecting ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
              Reject
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default RescanRequestCard;
