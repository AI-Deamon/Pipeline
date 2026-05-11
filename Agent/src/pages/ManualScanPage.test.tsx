import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ManualScanPage from './ManualScanPage';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { api } from '../services/api';
import { AuthProvider } from '../hooks/useAuth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

vi.mock('../services/api', () => ({
  api: {
    projects: {
      get: vi.fn(),
    },
    scans: {
      trigger: vi.fn(),
    }
  },
  FIXED_STAGES: [
    'Git Checkout',
    'Sonar Scanner',
    'Sonar Quality Gate',
    'NPM / PIP Install',
    'Dependency Check',
    'Trivy FS Scan',
    'Docker Build',
    'Docker Push',
    'Trivy Image Scan',
    'Nmap Scan',
    'ZAP Scan'
  ]
}));

describe('ManualScanPage', () => {
  const mockProject = {
    project_id: '1',
    name: 'Test Project',
    git_url: 'https://github.com/test/repo',
    branch: 'main',
    credentials_id: 'cred',
    sonar_key: 'sonar',
    target_ip: '1.2.3.4',
    target_url: 'https://test.com'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.projects.get as any).mockResolvedValue(mockProject); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it('renders all 11 stages', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/projects/1/manual']}>
            <Routes>
              <Route path="/projects/:id/manual" element={<ManualScanPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Git Checkout')).toBeInTheDocument();
    expect(screen.getByText('Sonar Scanner')).toBeInTheDocument();
    expect(screen.getByText('ZAP Scan')).toBeInTheDocument();
  });

  it('shows additional configuration when Nmap or ZAP is selected', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/projects/1/manual']}>
            <Routes>
              <Route path="/projects/:id/manual" element={<ManualScanPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    await screen.findByText('Git Checkout');

    // Initially should not show "Additional Configuration Status" (was Required)
    expect(screen.queryByText('Additional Configuration Status')).not.toBeInTheDocument();

    // Select Nmap Scan
    fireEvent.click(screen.getByText('Nmap Scan'));
    expect(screen.getByText('Additional Configuration Status')).toBeInTheDocument();
    expect(screen.getByText('Target IP (for Nmap)')).toBeInTheDocument();

    // Select ZAP Scan
    fireEvent.click(screen.getByText('ZAP Scan'));
    expect(screen.getByText('Target URL (for ZAP)')).toBeInTheDocument();
  });

  it('toggles all stages when Select All / Deselect All is clicked', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/projects/1/manual']}>
            <Routes>
              <Route path="/projects/:id/manual" element={<ManualScanPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    await screen.findByText('Git Checkout');

    // Initially 0 stages selected
    expect(screen.getByText('0 Stages Selected')).toBeInTheDocument();
    const toggleBtn = screen.getByRole('button', { name: /select all stages/i });
    expect(toggleBtn).toHaveTextContent('Select All');

    // Click Select All
    fireEvent.click(toggleBtn);
    expect(screen.getByText('11 Stages Selected')).toBeInTheDocument();
    expect(toggleBtn).toHaveTextContent('Deselect All');
    expect(toggleBtn).toHaveAttribute('aria-label', 'Deselect all stages');

    // Click Deselect All
    fireEvent.click(toggleBtn);
    expect(screen.getByText('0 Stages Selected')).toBeInTheDocument();
    expect(toggleBtn).toHaveTextContent('Select All');
    expect(toggleBtn).toHaveAttribute('aria-label', 'Select all stages');
  });
});
