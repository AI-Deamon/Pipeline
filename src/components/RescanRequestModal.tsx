import { useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../services/api';
import type { RescanRequestResponse } from '../types';

type RescanRequestModalProps = {
  issueId: number;
  onClose: () => void;
  onSuccess?: (rescan: RescanRequestResponse) => void;
};

export default function RescanRequestModal({ issueId, onClose, onSuccess }: RescanRequestModalProps) {
  const [fixNote, setFixNote] = useState('');
  const [commitSha, setCommitSha] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.issues.requestRescan(issueId, {
        fix_note: fixNote.trim(),
        commit_sha: commitSha.trim() || undefined,
      }),
    onSuccess: (data: RescanRequestResponse) => {
      onSuccess?.(data);
      onClose();
    },
  });

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-xl max-w-lg w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Request Rescan Verification</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-slate-600">
            Describe what you changed to fix this issue. The team lead will review and
            trigger a verification scan.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Fix note <span className="text-red-500">*</span>
            </label>
            <textarea
              value={fixNote}
              onChange={(e) => setFixNote(e.target.value)}
              placeholder="e.g., Sanitized user input in UserForm.tsx:42. Replaced innerHTML with textContent and added a whitelist for allowed tags."
              rows={5}
              className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:border-blue-400 outline-none"
              autoFocus
              aria-required="true"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Commit SHA (optional)
            </label>
            <input
              type="text"
              value={commitSha}
              onChange={(e) => setCommitSha(e.target.value)}
              placeholder="a1b2c3d4"
              className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:border-blue-400 outline-none font-mono"
            />
          </div>

          {mutation.isError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              {(mutation.error as Error).message}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!fixNote.trim() || mutation.isPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Request Rescan
          </button>
        </div>
      </div>
    </div>
  );
}
