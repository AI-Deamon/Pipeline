import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToolDetailViewPage from '../../pages/ToolDetailViewPage';
import { api } from '../../services/api';

describe('ToolDetailViewPage', () => {
  const original = api.issues.getToolIssues;

  beforeEach(() => {
    api.issues.getToolIssues = vi.fn().mockResolvedValue({
      total: 2,
      page: 1,
      page_size: 25,
      total_pages: 1,
      issues: [
        { id: 1, project_id: 'proj_1', tool_name: 'sonarqube', title: 'SQL Injection', severity: 'high', status: 'open', last_seen_at: '2026-01-15T00:00:00Z' },
        { id: 2, project_id: 'proj_1', tool_name: 'sonarqube', title: 'XSS', severity: 'medium', status: 'assigned', last_seen_at: '2026-01-14T00:00:00Z' },
      ],
    });
  });

  afterEach(() => {
    api.issues.getToolIssues = original;
  });

  function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/projects/proj_1/issues/sonarqube']}>
          <Routes>
            <Route path="/projects/:projectId/issues/:toolName" element={<ToolDetailViewPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  test('renders error state', async () => {
    api.issues.getToolIssues = vi.fn().mockRejectedValue(new Error('API error'));
    renderPage();
    expect(await screen.findByText('Failed to load issues')).toBeInTheDocument();
  });

  test('renders issues in table', async () => {
    renderPage();
    expect(await screen.findByText('SQL Injection')).toBeInTheDocument();
    expect(screen.getByText('XSS')).toBeInTheDocument();
  });

  test('filters by search', async () => {
    renderPage();
    await screen.findByText('SQL Injection');
    fireEvent.change(screen.getByPlaceholderText('Search issues...'), { target: { value: 'XSS' } });
    expect(screen.getByText('XSS')).toBeInTheDocument();
    expect(screen.queryByText('SQL Injection')).not.toBeInTheDocument();
  });

  test('filters by status', async () => {
    renderPage();
    await screen.findByText('SQL Injection');
    fireEvent.change(screen.getByDisplayValue('All Statuses'), { target: { value: 'assigned' } });
    expect(screen.getByText('XSS')).toBeInTheDocument();
    expect(screen.queryByText('SQL Injection')).not.toBeInTheDocument();
  });

  test('filters by severity', async () => {
    renderPage();
    await screen.findByText('SQL Injection');
    fireEvent.change(screen.getByDisplayValue('All Severities'), { target: { value: 'high' } });
    expect(screen.getByText('SQL Injection')).toBeInTheDocument();
    expect(screen.queryByText('XSS')).not.toBeInTheDocument();
  });
});
