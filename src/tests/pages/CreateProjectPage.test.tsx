import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CreateProjectPage from '../../pages/CreateProjectPage';
import { api } from '../../services/api';
import { ToastProvider } from '../../components/Toast';

// Regression tests for finding #101: validateStep(3) was never implemented at all —
// target_ip/target_url sailed through the whole wizard unchecked even though the
// backend rejects malformed values, giving the user a confusing 422 after seemingly
// completing every step with no field/step indication.

describe('CreateProjectPage step 3 validation', () => {
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

  async function goToStep3() {
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: 'My Project' } });
    fireEvent.change(screen.getByLabelText(/sonar/i), { target: { value: 'my-sonar-key' } });
    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByLabelText(/git repository url/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/git repository url/i), { target: { value: 'https://github.com/org/repo.git' } });
    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByLabelText(/target ip/i)).toBeInTheDocument());
  }

  test('invalid target_ip blocks submission and shows an error', async () => {
    renderPage();
    await goToStep3();

    fireEvent.change(screen.getByLabelText(/target ip/i), { target: { value: 'not-an-ip' } });
    fireEvent.click(screen.getByText('Create Project'));

    await waitFor(() => expect(screen.getByText('Invalid IPv4 address format')).toBeInTheDocument());
    expect(api.projects.create).not.toHaveBeenCalled();
  });

  test('invalid target_url blocks submission and shows an error', async () => {
    renderPage();
    await goToStep3();

    fireEvent.change(screen.getByLabelText(/target url/i), { target: { value: 'not a url' } });
    fireEvent.click(screen.getByText('Create Project'));

    await waitFor(() => expect(screen.getByText('Invalid URL format')).toBeInTheDocument());
    expect(api.projects.create).not.toHaveBeenCalled();
  });

  test('valid (or empty) step 3 fields allow submission through', async () => {
    renderPage();
    await goToStep3();

    fireEvent.change(screen.getByLabelText(/target ip/i), { target: { value: '10.0.0.1' } });
    fireEvent.click(screen.getByText('Create Project'));

    await waitFor(() => expect(api.projects.create).toHaveBeenCalledTimes(1));
  });
});
