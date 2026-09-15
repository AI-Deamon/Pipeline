import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { test, expect } from 'vitest';
import { ReportVariantNav } from '../../components/reports/ReportVariantNav';

test('marks the current report variant as active', () => {
  render(
    <MemoryRouter>
      <ReportVariantNav projectId="p1" active="scan" />
    </MemoryRouter>
  );
  expect(screen.getByRole('link', { name: 'Scan report' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Unified report' })).not.toHaveAttribute('aria-current');
});
