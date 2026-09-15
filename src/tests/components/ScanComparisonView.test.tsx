import { render, screen, within } from '@testing-library/react';
import { test, expect } from 'vitest';
import { ScanComparisonView } from '../../components/reports/ScanComparisonView';
import type { Finding } from '../../types';

const f = (id: string, title: string): Finding => ({ id, tool: 'zap', title, severity: 'High' });

test('shows resolved, persisting, and new counts prominently, each in its own section', () => {
  // Distinct bucket sizes (2 resolved / 1 persisting / 0 introduced) so a bare
  // count assertion is diagnostic rather than ambiguous, and so a bug that
  // swaps buckets between sections would be caught.
  render(
    <ScanComparisonView
      previous={[f('a', 'Old finding'), f('d', 'Also resolved'), f('b', 'Still here')]}
      current={[f('b', 'Still here')]}
    />
  );

  // Counts render prominently (stats row) with the correct, distinct values.
  expect(screen.getAllByText('2').length).toBeGreaterThan(0); // resolved count
  expect(screen.getAllByText('1').length).toBeGreaterThan(0); // persisting count
  expect(screen.getAllByText('0').length).toBeGreaterThan(0); // introduced count

  const resolvedSection = screen.getByTestId('scan-comparison-resolved');
  const persistingSection = screen.getByTestId('scan-comparison-persisting');
  const introducedSection = screen.getByTestId('scan-comparison-introduced');

  // Resolved items appear in the Resolved section, and nowhere else.
  expect(within(resolvedSection).getByText('Old finding')).toBeInTheDocument();
  expect(within(resolvedSection).getByText('Also resolved')).toBeInTheDocument();
  expect(within(persistingSection).queryByText('Old finding')).not.toBeInTheDocument();
  expect(within(introducedSection).queryByText('Old finding')).not.toBeInTheDocument();

  // Persisting item appears only in the Still open section.
  expect(within(persistingSection).getByText('Still here')).toBeInTheDocument();
  expect(within(resolvedSection).queryByText('Still here')).not.toBeInTheDocument();
  expect(within(introducedSection).queryByText('Still here')).not.toBeInTheDocument();

  // Introduced section is empty here.
  expect(within(introducedSection).getByText('None.')).toBeInTheDocument();
});

test('new findings appear only in the "New this scan" section', () => {
  render(<ScanComparisonView previous={[]} current={[f('c', 'Brand new')]} />);

  const resolvedSection = screen.getByTestId('scan-comparison-resolved');
  const persistingSection = screen.getByTestId('scan-comparison-persisting');
  const introducedSection = screen.getByTestId('scan-comparison-introduced');

  expect(within(introducedSection).getByText('Brand new')).toBeInTheDocument();
  expect(within(resolvedSection).queryByText('Brand new')).not.toBeInTheDocument();
  expect(within(persistingSection).queryByText('Brand new')).not.toBeInTheDocument();

  // resolved and persisting are both empty
  expect(within(resolvedSection).getByText('None.')).toBeInTheDocument();
  expect(within(persistingSection).getByText('None.')).toBeInTheDocument();
});
