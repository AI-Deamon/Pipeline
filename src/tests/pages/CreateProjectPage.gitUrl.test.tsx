import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CreateProjectPage from '../../pages/CreateProjectPage';
import { api } from '../../services/api';
import { ToastProvider } from '../../components/Toast';

/**
 * Regression test for #102: git_url client validation used `new URL(...)`, which
 * accepts any scheme — an `ssh://git@host/repo.git` URL (a plausible paste from a
 * real git remote) passed client validation and only failed on submit with an
 * unmapped 422. The backend requires http(s):// (schemas/project.py). Client
 * validation must match.
 */
describe('CreateProjectPage git_url scheme validation', () => {
  const originalCreate = api.projects.create;

  beforeEach(() => {
    api.projects.create = vi.fn().mockResolvedValue({ project_id: 'p1', name: 'Test' });
  });

  afterEach(() => {
    api.projects.create = originalCreate;
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <ToastProvider>
          <CreateProjectPage />
        </ToastProvider>
      </MemoryRouter>
    );
  }

  test('ssh:// git url is rejected at step 2 with a scheme-specific error', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: 'My Project' } });
    fireEvent.change(screen.getByLabelText(/sonar/i), { target: { value: 'my-sonar-key' } });
    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByLabelText(/git repository url/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/git repository url/i), {
      target: { value: 'ssh://git@github.com/org/repo.git' },
    });
    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() =>
      expect(screen.getByText('Git URL must start with http:// or https://')).toBeInTheDocument()
    );
    // Must not have advanced to step 3.
    expect(screen.queryByLabelText(/target ip/i)).not.toBeInTheDocument();
  });

  test('https:// git url still passes through to step 3', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: 'My Project' } });
    fireEvent.change(screen.getByLabelText(/sonar/i), { target: { value: 'my-sonar-key' } });
    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByLabelText(/git repository url/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/git repository url/i), {
      target: { value: 'https://github.com/org/repo.git' },
    });
    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByLabelText(/target ip/i)).toBeInTheDocument());
  });
});
