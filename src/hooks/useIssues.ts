import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { IssueCreatePayload, IssueAssignPayload, IssueStatusPayload } from '../types';

export function useProjectOverview(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-overview', projectId],
    queryFn: () => api.issues.getProjectOverview(projectId!),
    enabled: !!projectId,
  });
}

export function useToolIssues(projectId: string | undefined, toolName: string | undefined, page = 1, pageSize = 25, findingType?: string) {
  return useQuery({
    queryKey: ['tool-issues', projectId, toolName, page, pageSize, findingType],
    queryFn: () => api.issues.getToolIssues(projectId!, toolName!, page, pageSize, findingType),
    enabled: !!projectId && !!toolName,
  });
}

export function useMyIssues(page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ['my-issues', page, pageSize],
    queryFn: () => api.issues.getMyIssues(page, pageSize),
  });
}

export function useIssue(issueId: number | undefined) {
  return useQuery({
    queryKey: ['issue', issueId],
    queryFn: () => api.issues.get(issueId!),
    enabled: issueId !== undefined,
  });
}

export function useIssueHistory(issueId: number | undefined) {
  return useQuery({
    queryKey: ['issue-history', issueId],
    queryFn: () => api.issues.getHistory(issueId!),
    enabled: issueId !== undefined,
  });
}

export function useCreateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: IssueCreatePayload) => api.issues.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project-overview', data.project_id] });
      queryClient.invalidateQueries({ queryKey: ['tool-issues', data.project_id] });
      queryClient.invalidateQueries({ queryKey: ['my-issues'] });
    },
  });
}

export function useAssignIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, data }: { issueId: number; data: IssueAssignPayload }) =>
      api.issues.assign(issueId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue'] });
      queryClient.invalidateQueries({ queryKey: ['tool-issues'] });
      queryClient.invalidateQueries({ queryKey: ['my-issues'] });
      queryClient.invalidateQueries({ queryKey: ['project-overview'] });
    },
  });
}

export function useTransitionIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, data }: { issueId: number; data: IssueStatusPayload }) =>
      api.issues.transition(issueId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue'] });
      queryClient.invalidateQueries({ queryKey: ['tool-issues'] });
      queryClient.invalidateQueries({ queryKey: ['my-issues'] });
    },
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, message }: { issueId: number; message: string }) =>
      api.issues.addComment(issueId, message),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['issue-history', variables.issueId] });
    },
  });
}
