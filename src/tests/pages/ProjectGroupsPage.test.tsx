import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import ProjectGroupsPage from '../../pages/ProjectGroupsPage';
import { api } from '../../services/api';
import { ToastProvider } from '../../components/Toast';
import type { ProjectGroup, ProjectGroupDetail } from '../../types';

// Regression test for finding #100: handleAutoAssign/handleRefreshGroup checked
// `selectedGroup?.group_id === groupId` from a closure captured when the button was
// clicked, not re-read after the await. Switching to a different group before the
// first group's request resolved let the stale closure's check still pass, silently
// overwriting the newly-selected group's displayed data.

describe('ProjectGroupsPage', () => {
  const originalList = api.projectGroups.list;
  const originalGet = api.projectGroups.get;
  const originalAutoAssign = api.projectGroups.autoAssign;

  const groupA: ProjectGroup = {
    group_id: 'group-a', name: 'Group A', naming_pattern: 'a_*', created_at: '2026-01-01T00:00:00Z',
  };
  const groupB: ProjectGroup = {
    group_id: 'group-b', name: 'Group B', naming_pattern: 'b_*', created_at: '2026-01-01T00:00:00Z',
  };

  function detailFor(group: ProjectGroup, criticalCount: number): ProjectGroupDetail {
    return {
      ...group,
      assigned_scans: [],
      total_findings: criticalCount,
      severity_summary: { critical: criticalCount, high: 0, medium: 0, low: 0, info: 0 },
    };
  }

  let resolveAutoAssign: (() => void) | undefined;

  beforeEach(() => {
    api.projectGroups.list = vi.fn().mockResolvedValue([groupA, groupB]);
    api.projectGroups.get = vi.fn().mockImplementation(async (groupId: string) => {
      if (groupId === 'group-a') return detailFor(groupA, 111);
      return detailFor(groupB, 222);
    });
    // Auto-assign for group A hangs until the test explicitly resolves it, so we can
    // switch the selected group before it completes.
    api.projectGroups.autoAssign = vi.fn().mockImplementation(
      () => new Promise((resolve) => {
        resolveAutoAssign = () => resolve({ status: 'ok', message: 'done', assigned_count: 1, total_matches: 1 });
      })
    );
  });

  afterEach(() => {
    api.projectGroups.list = originalList;
    api.projectGroups.get = originalGet;
    api.projectGroups.autoAssign = originalAutoAssign;
    resolveAutoAssign = undefined;
  });

  function renderPage() {
    return render(
      <ToastProvider>
        <ProjectGroupsPage />
      </ToastProvider>
    );
  }

  test('switching groups while a request for the previous group is in flight does not overwrite the new selection', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Group A')).toBeInTheDocument());

    // Select group A, then kick off auto-assign (request hangs, mock not resolved yet).
    fireEvent.click(screen.getByText('Group A'));
    await waitFor(() => expect(screen.getByText('111')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Auto-Assign Scans'));
    await waitFor(() => expect(resolveAutoAssign).toBeDefined());

    // Switch to group B before A's auto-assign request resolves.
    fireEvent.click(screen.getByText('Group B'));
    await waitFor(() => expect(screen.getByText('222')).toBeInTheDocument());

    // Now let A's stale request resolve.
    resolveAutoAssign?.();

    // B's data must still be showing — A's late response must not clobber it. Give
    // any (incorrect) re-fetch of A a moment to land before asserting it didn't.
    await waitFor(() => expect(api.projectGroups.autoAssign).toHaveBeenCalledTimes(1));
    expect(screen.getByText('222')).toBeInTheDocument();
    expect(screen.queryByText('111')).not.toBeInTheDocument();
  });
});
