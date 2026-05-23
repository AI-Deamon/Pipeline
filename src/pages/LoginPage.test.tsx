import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import LoginPage from './LoginPage';
import { AuthProvider } from '../hooks/useAuth';
import { api } from '../services/api';
import { ApiError } from '../utils/apiError';

vi.mock('../services/api');

describe('LoginPage', () => {
  it('toggles password visibility when the eye icon is clicked', () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>
    );

    const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    const toggleButton = screen.getByLabelText('Show password');

    // Initial state: password type
    expect(passwordInput.type).toBe('password');

    // Click to show
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('text');
    expect(screen.getByLabelText('Hide password')).toBeInTheDocument();

    // Click to hide again
    fireEvent.click(screen.getByLabelText('Hide password'));
    expect(passwordInput.type).toBe('password');
    expect(screen.getByLabelText('Show password')).toBeInTheDocument();
  });

  it('contains a username field and a sign-in button', () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>
    );

    expect(screen.getByLabelText(/operator identity/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /authorize entry/i })).toBeInTheDocument();
  });

  it('displays specific error message when ApiError is thrown', async () => {
    const mockApiError = new ApiError(401, 'Invalid credentials');
    vi.mocked(api.auth.login).mockRejectedValueOnce(mockApiError);

    render(
      <AuthProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>
    );

    const usernameInput = screen.getByLabelText(/operator identity/i);
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitButton = screen.getByRole('button', { name: /authorize entry/i });

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('displays generic error message for non-ApiError failures', async () => {
    vi.mocked(api.auth.login).mockRejectedValueOnce(new Error('Network error'));

    render(
      <AuthProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>
    );

    const usernameInput = screen.getByLabelText(/operator identity/i);
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitButton = screen.getByRole('button', { name: /authorize entry/i });

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials. Please verify your identity and try again.')).toBeInTheDocument();
    });
  });
});
