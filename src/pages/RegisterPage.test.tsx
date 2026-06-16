import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import RegisterPage from './RegisterPage';
import { api } from '../services/api';
import { ApiError } from '../utils/apiError';

vi.mock('../services/api');

describe('RegisterPage', () => {
  it('displays the specific 422 detail message when the API throws an ApiError', async () => {
    // Mirrors the real backend response shape for a 422 validation failure:
    //   {"detail": "Password must be at least 8 characters long"}
    // The apiClient response interceptor (services/api.ts:52) rewrites the
    // axios error into an ApiError instance before it reaches the catch block,
    // so the page must use ApiError.getErrorMessage() — not raw err.response.
    const mockApiError = new ApiError(422, 'Password must be at least 8 characters long');
    vi.mocked(api.auth.register).mockRejectedValueOnce(mockApiError);

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByPlaceholderText(/at least 8 characters/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    fireEvent.change(usernameInput, { target: { value: 'newdev' } });
    fireEvent.change(passwordInput, { target: { value: 'weak' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters long')).toBeInTheDocument();
    });
  });

  it('falls back to "Registration failed." for non-Error, non-ApiError rejections', async () => {
    // A bare string (not an Error, not an ApiError, not an axios error) is the
    // only shape where ApiError.getErrorMessage has nothing to extract a message
    // from — the fallback is the only available message.
    vi.mocked(api.auth.register).mockRejectedValueOnce('something exploded');

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByPlaceholderText(/at least 8 characters/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    fireEvent.change(usernameInput, { target: { value: 'newdev' } });
    fireEvent.change(passwordInput, { target: { value: 'validpassword123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Registration failed.')).toBeInTheDocument();
    });
  });
});
