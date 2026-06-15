import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { RescanRequestResponse } from '../types';

export function useEditRescanRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fix_note, version }: { id: number; fix_note: string; version: number }) =>
      api.issues.editRescanRequest(id, { fix_note, version }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-verification'] });
      qc.invalidateQueries({ queryKey: ['issue'] });
    },
  });
}

export function useCancelRescanRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: number; version: number }) =>
      api.issues.cancelRescanRequest(id, { version }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-verification'] });
      qc.invalidateQueries({ queryKey: ['issue'] });
    },
  });
}

export function useApproveRescan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, reviewer_note }: { issueId: number; reviewer_note?: string }) =>
      api.issues.approveRescan(issueId, { reviewer_note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-verification'] });
      qc.invalidateQueries({ queryKey: ['issue'] });
      qc.invalidateQueries({ queryKey: ['scans'] });
    },
  });
}

export function useRequestRescan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      issueId,
      fix_note,
      commit_sha,
    }: {
      issueId: number;
      fix_note: string;
      commit_sha?: string;
    }) => api.issues.requestRescan(issueId, { fix_note, commit_sha }),
    onSuccess: (_data: RescanRequestResponse) => {
      qc.invalidateQueries({ queryKey: ['pending-verification'] });
      qc.invalidateQueries({ queryKey: ['issue'] });
      qc.invalidateQueries({ queryKey: ['tool-issues'] });
    },
  });
}
