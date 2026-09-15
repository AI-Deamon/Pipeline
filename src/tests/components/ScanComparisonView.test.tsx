import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { ScanComparisonView } from '../../components/reports/ScanComparisonView';
import type { Finding } from '../../types';

const f = (id: string, title: string): Finding => ({ id, tool: 'zap', title, severity: 'High' });

test('shows resolved, persisting, and new counts prominently', () => {
  render(
    <ScanComparisonView
      previous={[f('a', 'Old finding'), f('b', 'Still here')]}
      current={[f('b', 'Still here'), f('c', 'Brand new')]}
    />
  );
  expect(screen.getAllByText('1').length).toBeGreaterThan(0); // resolved count appears at least once
  expect(screen.getByText('Old finding')).toBeInTheDocument();
  expect(screen.getByText('Brand new')).toBeInTheDocument();
  expect(screen.getByText('Still here')).toBeInTheDocument();
});

test('shows a "None." placeholder for empty buckets', () => {
  render(<ScanComparisonView previous={[]} current={[f('c', 'Brand new')]} />);
  // resolved and persisting are both empty
  expect(screen.getAllByText('None.').length).toBe(2);
});
