import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import LoginPage from './LoginPage';
import { AuthProvider } from '../hooks/useAuth';

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

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
