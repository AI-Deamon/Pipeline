import { render, screen } from '@testing-library/react';
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
