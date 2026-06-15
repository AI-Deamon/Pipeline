import { render, screen, fireEvent } from '@testing-library/react';
import { vi, test, expect, describe } from 'vitest';
import IssueFilterBar from '../../components/IssueFilterBar';

describe('IssueFilterBar', () => {
  const defaultProps = {
    search: '',
    onSearchChange: vi.fn(),
    statusFilter: '',
    onStatusFilterChange: vi.fn(),
    severityFilter: '',
    onSeverityFilterChange: vi.fn(),
  };

  test('renders search input and selects', () => {
    render(<IssueFilterBar {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search issues...')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All Statuses')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All Severities')).toBeInTheDocument();
  });

  test('calls onSearchChange on input', () => {
    const onSearchChange = vi.fn();
    render(<IssueFilterBar {...defaultProps} onSearchChange={onSearchChange} />);
    fireEvent.change(screen.getByPlaceholderText('Search issues...'), { target: { value: 'sql' } });
    expect(onSearchChange).toHaveBeenCalledWith('sql');
  });

  test('calls onStatusFilterChange on select', () => {
    const onStatusFilterChange = vi.fn();
    render(<IssueFilterBar {...defaultProps} onStatusFilterChange={onStatusFilterChange} />);
    fireEvent.change(screen.getByDisplayValue('All Statuses'), { target: { value: 'open' } });
    expect(onStatusFilterChange).toHaveBeenCalledWith('open');
  });

  test('calls onSeverityFilterChange on select', () => {
    const onSeverityFilterChange = vi.fn();
    render(<IssueFilterBar {...defaultProps} onSeverityFilterChange={onSeverityFilterChange} />);
    fireEvent.change(screen.getByDisplayValue('All Severities'), { target: { value: 'high' } });
    expect(onSeverityFilterChange).toHaveBeenCalledWith('high');
  });
});
