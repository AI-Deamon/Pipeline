import { render, screen, fireEvent } from '@testing-library/react';
import { test, expect, vi } from 'vitest';
import { FindingsFilterBar } from '../../components/reports/FindingsFilterBar';

test('clicking a severity button calls onSeverityChange with that severity', () => {
  const onSeverityChange = vi.fn();
  render(
    <FindingsFilterBar
      search="" onSearchChange={() => {}}
      severityFilter="All" onSeverityChange={onSeverityChange}
      toolFilter="All" onToolChange={() => {}}
      availableTools={['sonar']}
      severityCounts={{ All: 2, Critical: 1 }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /Critical/ }));
  expect(onSeverityChange).toHaveBeenCalledWith('Critical');
});
