import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, test, expect, describe } from 'vitest';
import ToolCard from '../../components/ToolCard';
import type { ToolOverview } from '../../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('ToolCard', () => {
  const tool: ToolOverview = {
    tool: 'sonarqube',
    total: 10,
    severity: { critical: 2, high: 3, medium: 4, low: 1 },
  };

  test('renders tool name and total', () => {
    render(<MemoryRouter><ToolCard tool={tool} projectId="proj_1" /></MemoryRouter>);
    expect(screen.getByText('sonarqube')).toBeInTheDocument();
    expect(screen.getByText('10 findings')).toBeInTheDocument();
  });

  test('renders severity badges', () => {
    render(<MemoryRouter><ToolCard tool={tool} projectId="proj_1" /></MemoryRouter>);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  test('hides badge for zero count', () => {
    const noMedium = { ...tool, severity: { critical: 2, high: 3, medium: 0, low: 1 } };
    render(<MemoryRouter><ToolCard tool={noMedium} projectId="proj_1" /></MemoryRouter>);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('navigates on click', () => {
    render(<MemoryRouter><ToolCard tool={tool} projectId="proj_1" /></MemoryRouter>);
    screen.getByRole('button').click();
    expect(mockNavigate).toHaveBeenCalledWith('/projects/proj_1/issues/sonarqube');
  });
});
