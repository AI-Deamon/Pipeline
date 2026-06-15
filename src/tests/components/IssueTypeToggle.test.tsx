import { render, screen, fireEvent } from '@testing-library/react';
import { vi, test, expect, describe } from 'vitest';
import IssueTypeToggle from '../../components/IssueTypeToggle';

describe('IssueTypeToggle', () => {
  test('renders all type options', () => {
    render(<IssueTypeToggle value="" onChange={vi.fn()} />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Bugs')).toBeInTheDocument();
    expect(screen.getByText('Vulnerabilities')).toBeInTheDocument();
    expect(screen.getByText('Code Smells')).toBeInTheDocument();
  });

  test('highlights active type', () => {
    render(<IssueTypeToggle value="bug" onChange={vi.fn()} />);
    const btn = screen.getByText('Bugs').closest('button')!;
    expect(btn.className).toContain('bg-white');
  });

  test('calls onChange on click', () => {
    const onChange = vi.fn();
    render(<IssueTypeToggle value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('Bugs'));
    expect(onChange).toHaveBeenCalledWith('bug');
  });

  test('does not highlight inactive types', () => {
    render(<IssueTypeToggle value="bug" onChange={vi.fn()} />);
    const allBtn = screen.getByText('All').closest('button')!;
    expect(allBtn.className).not.toContain('bg-white');
  });
});
