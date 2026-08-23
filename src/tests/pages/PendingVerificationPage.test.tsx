import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, afterEach, test, expect, describe } from 'vitest';
import PendingVerificationPage from '../../pages/PendingVerificationPage';
import { api } from '../../services/api';

/**
 * Regression test for #61: Approve/Reject on the rescan queue previously fired
 * the mutation immediately on click, with no confirmation step — a mis-click
 * could silently approve or reject a developer's fix.
 */
vi.mock('../../hooks/useRescanWebSocket', () => ({
  useRescanWebSocket: () => ({ connected: true }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PendingVerificationPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const mockResponse = {
  total: 1,
  page: 1,
  page_size: 25,
  groups: [
    {
      project_id: 'proj-1',
      project_name: 'Project One',
      items: [
        {
          rescan_request_id: 10,
          issue_id: 99,
          issue_title: 'SQL Injection in login',
          issue_severity: 'high',
          tool: 'sonar',
          requested_by: 'dev1',
          requested_by_name: 'Dev One',
          fix_note: 'Fixed via parameterized query',
          status: 'pending',
          created_at: new Date().toISOString(),
          fix_elapsed_minutes: 30,
        },
      ],
    },
  ],
};

describe('PendingVerificationPage approve/reject confirmation', () => {
  const originalGetPendingVerification = api.issues.getPendingVerification;
  const originalApproveRescan = api.issues.approveRescan;
  const originalRejectRescan = api.issues.rejectRescan;

  afterEach(() => {
    api.issues.getPendingVerification = originalGetPendingVerification;
    api.issues.approveRescan = originalApproveRescan;
    api.issues.rejectRescan = originalRejectRescan;
  });

  test('clicking Verify Now does not call the API until confirmed', async () => {
    api.issues.getPendingVerification = vi.fn().mockResolvedValue(mockResponse);
    const approveSpy = vi.fn().mockResolvedValue({});
    api.issues.approveRescan = approveSpy;

    renderPage();

    await waitFor(() => expect(screen.getByText('SQL Injection in login')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /verify now/i }));

    // Modal shown, API not yet called.
    expect(screen.getByText('Approve fix?')).toBeInTheDocument();
    expect(approveSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));

    await waitFor(() => expect(approveSpy).toHaveBeenCalledWith(99, { reviewer_note: 'Approved from queue' }));
  });

  test('clicking Reject does not call the API until confirmed, and cancel avoids it entirely', async () => {
    api.issues.getPendingVerification = vi.fn().mockResolvedValue(mockResponse);
    const rejectSpy = vi.fn().mockResolvedValue({});
    api.issues.rejectRescan = rejectSpy;

    renderPage();

    await waitFor(() => expect(screen.getByText('SQL Injection in login')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.getByText('Reject fix?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText('Reject fix?')).not.toBeInTheDocument();
    expect(rejectSpy).not.toHaveBeenCalled();
  });
});
