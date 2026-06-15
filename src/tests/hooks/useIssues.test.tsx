import { renderHook, waitFor } from '@testing-library/react';
import { vi, afterEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '../../services/api';
import {
  useProjectOverview,
  useToolIssues,
  useMyIssues,
  useIssue,
  useCreateIssue,
  useAssignIssue,
  useTransitionIssue,
} from '../../hooks/useIssues';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useProjectOverview', () => {
  const original = api.issues.getProjectOverview;

  afterEach(() => {
    api.issues.getProjectOverview = original;
  });

  test('fetches overview', async () => {
    api.issues.getProjectOverview = vi.fn().mockResolvedValue({
      project_id: 'proj_1',
      tools: [{ tool: 'sonar', total: 5, severity: { high: 3, low: 2 } }],
    });
    const { result } = renderHook(() => useProjectOverview('proj_1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.project_id).toBe('proj_1');
    expect(result.current.data?.tools).toHaveLength(1);
  });

  test('disabled when no projectId', () => {
    const { result } = renderHook(() => useProjectOverview(undefined), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useToolIssues', () => {
  const original = api.issues.getToolIssues;

  afterEach(() => {
    api.issues.getToolIssues = original;
  });

  test('fetches tool issues', async () => {
    api.issues.getToolIssues = vi.fn().mockResolvedValue({
      total: 2, page: 1, page_size: 25, total_pages: 1,
      issues: [
        { id: 1, title: 'A', severity: 'high', status: 'open' },
        { id: 2, title: 'B', severity: 'low', status: 'open' },
      ],
    });
    const { result } = renderHook(() => useToolIssues('proj_1', 'sonar'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(2);
  });

  test('disabled when missing params', () => {
    const { result } = renderHook(() => useToolIssues(undefined, 'sonar'), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useMyIssues', () => {
  const original = api.issues.getMyIssues;

  afterEach(() => {
    api.issues.getMyIssues = original;
  });

  test('fetches my issues', async () => {
    api.issues.getMyIssues = vi.fn().mockResolvedValue({
      total: 3, page: 1, page_size: 25, projects: [{ project_id: 'p1', total: 3 }],
    });
    const { result } = renderHook(() => useMyIssues(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(3);
  });
});

describe('useIssue', () => {
  const original = api.issues.get;

  afterEach(() => {
    api.issues.get = original;
  });

  test('fetches single issue', async () => {
    api.issues.get = vi.fn().mockResolvedValue({ id: 1, title: 'Test', status: 'open' });
    const { result } = renderHook(() => useIssue(1), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe(1);
  });

  test('disabled when no issueId', () => {
    const { result } = renderHook(() => useIssue(undefined), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useCreateIssue', () => {
  const original = api.issues.create;

  afterEach(() => {
    api.issues.create = original;
  });

  test('mutates successfully', async () => {
    api.issues.create = vi.fn().mockResolvedValue({ id: 1, issue_id: 'test:001', project_id: 'proj_1' });
    const { result } = renderHook(() => useCreateIssue(), { wrapper: createWrapper() });
    result.current.mutate({ issue_id: 'test:001', project_id: 'proj_1', tool_name: 'sonar', severity: 'high', title: 'Test' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.issues.create).toHaveBeenCalledOnce();
  });
});

describe('useAssignIssue', () => {
  const original = api.issues.assign;

  afterEach(() => {
    api.issues.assign = original;
  });

  test('mutates successfully', async () => {
    api.issues.assign = vi.fn().mockResolvedValue({ id: 1, assignee_id: 'user_dev', status: 'assigned' });
    const { result } = renderHook(() => useAssignIssue(), { wrapper: createWrapper() });
    result.current.mutate({ issueId: 1, data: { assignee_id: 'user_dev' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.issues.assign).toHaveBeenCalledWith(1, { assignee_id: 'user_dev' });
  });
});

describe('useTransitionIssue', () => {
  const original = api.issues.transition;

  afterEach(() => {
    api.issues.transition = original;
  });

  test('mutates successfully', async () => {
    api.issues.transition = vi.fn().mockResolvedValue({ id: 1, status: 'fixed' });
    const { result } = renderHook(() => useTransitionIssue(), { wrapper: createWrapper() });
    result.current.mutate({ issueId: 1, data: { status: 'fixed' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.issues.transition).toHaveBeenCalledWith(1, { status: 'fixed' });
  });
});
