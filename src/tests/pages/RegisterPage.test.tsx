import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { test, expect, describe } from 'vitest';
import RegisterPage from '../../pages/RegisterPage';

/**
 * Regression test for #62: RegisterPage's show/hide-password toggle was
 * missing the `aria-label` that LoginPage's identical control has — a
 * screen-reader user heard an unlabeled button.
 */
describe('RegisterPage password toggle accessibility', () => {
  test('show/hide password button has an aria-label', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();
  });
});
