import { render, screen, fireEvent } from '@testing-library/react';
import { test, expect } from 'vitest';
import { FindingsTable } from '../../components/reports/FindingsTable';

const findings = [
  { id: '1', severity: 'Critical', title: 'A', tool: 'sonar' },
  { id: '2', severity: 'High', title: 'B', tool: 'trivy' },
];

test('in-table tool dropdown is disabled while a sidebar tool is active', () => {
  render(<FindingsTable findings={findings} selectedTool="sonar" />);
  const select = screen.getByRole('combobox');
  expect(select).toBeDisabled();
  expect(select).toHaveValue('sonar');
});

test('in-table tool dropdown filters findings when no sidebar tool is active', () => {
  render(<FindingsTable findings={findings} />);
  const select = screen.getByRole('combobox');
  expect(select).not.toBeDisabled();

  // Switch to list view so each finding's title renders as its own row.
  fireEvent.click(screen.getByText('List'));
  expect(screen.getByText('A')).toBeInTheDocument();
  expect(screen.getByText('B')).toBeInTheDocument();

  fireEvent.change(select, { target: { value: 'sonar' } });

  expect(screen.getByText('A')).toBeInTheDocument();
  expect(screen.queryByText('B')).not.toBeInTheDocument();
});

test('severity badge counts are scoped to the active tool filter', () => {
  render(<FindingsTable findings={findings} selectedTool="sonar" />);
  // findings fixture: 1 Critical/sonar, 1 High/trivy — with sonar selected, only the
  // Critical count (1) should reflect sonar's findings, not both tools combined
  expect(screen.getByRole('button', { name: 'Critical 1' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'High 1' })).not.toBeInTheDocument();
});

test('search input has an accessible label', () => {
  render(<FindingsTable findings={findings} selectedTool="sonar" />);
  expect(screen.getByLabelText('Search findings')).toBeInTheDocument();
});
