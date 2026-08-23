import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import ManualScanPage from '../../pages/ManualScanPage';
import { computeAutoStages } from '../../utils/scanStages';
import { api } from '../../services/api';
import { STAGE_DISPLAY_NAMES } from '../../types';

/**
 * Regression tests for #103 (a shared auto-added dependency could get stuck
 * greyed-out/unremovable forever once its original activating stage was
 * deselected) and #104 (the old incremental-Set-patching approach had impure
 * side effects nested inside a setState updater). Both are fixed by making
 * `autoStages` a pure value recomputed fresh from `manualStages` every time,
 * instead of an incrementally-patched Set.
 */
describe('computeAutoStages', () => {
  test('a dependency only needed by the deselected stage is freed entirely', () => {
    // git_checkout is a dependency of docker_build; nothing else selected.
    const afterSelectingDockerBuild = computeAutoStages(['docker_build']);
    expect(afterSelectingDockerBuild.has('git_checkout')).toBe(true);

    // Deselecting docker_build (removing it from manual) must free git_checkout —
    // the old code left it stuck in autoStages forever in this exact scenario.
    const afterDeselecting = computeAutoStages([]);
    expect(afterDeselecting.has('git_checkout')).toBe(false);
  });

  test('a dependency still needed by another manually-selected stage stays required', () => {
    // docker_build manually selected first (auto-adds git_checkout), then
    // docker_push manually selected too (also needs git_checkout — a no-op add
    // since it's already present). Deselecting docker_build alone must NOT free
    // git_checkout, since docker_push still needs it.
    const result = computeAutoStages(['docker_push']); // docker_build removed from manual
    expect(result.has('git_checkout')).toBe(true);
    expect(result.has('docker_build')).toBe(true); // still required transitively by docker_push
  });

  test('manually selected stages are never also reported as auto', () => {
    const result = computeAutoStages(['git_checkout', 'docker_build']);
    expect(result.has('git_checkout')).toBe(false);
  });
});

describe('ManualScanPage stage selection UI', () => {
  const originalGetProject = api.projects.get;
  const originalTrigger = api.scans.trigger;

  beforeEach(() => {
    api.projects.get = vi.fn().mockResolvedValue({
      project_id: 'proj-1', name: 'Test Project', git_url: 'https://x.com/y.git', branch: 'main',
    });
    api.scans.trigger = vi.fn().mockResolvedValue({ scan_id: 'scan-1' });
  });

  afterEach(() => {
    api.projects.get = originalGetProject;
    api.scans.trigger = originalTrigger;
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/projects/proj-1/manual']}>
        <Routes>
          <Route path="/projects/:projectId/manual" element={<ManualScanPage />} />
        </Routes>
      </MemoryRouter>
    );
  }

  test('a dependency stage is clickable again after its only activator is deselected', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(STAGE_DISPLAY_NAMES.docker_build)).toBeInTheDocument());

    const dockerBuildButton = screen.getByText(STAGE_DISPLAY_NAMES.docker_build).closest('button')!;
    const gitCheckoutButton = screen.getByText(STAGE_DISPLAY_NAMES.git_checkout).closest('button')!;

    // Select docker_build -> git_checkout auto-added, disabled (cursor-default).
    fireEvent.click(dockerBuildButton);
    await waitFor(() => expect(gitCheckoutButton.className).toContain('cursor-default'));

    // Deselect docker_build -> git_checkout must become clickable again, not
    // stuck forever (the #103 bug).
    fireEvent.click(dockerBuildButton);
    await waitFor(() => expect(gitCheckoutButton.className).not.toContain('cursor-default'));
  });
});
