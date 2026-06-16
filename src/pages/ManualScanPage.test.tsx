import { screen, fireEvent } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import ManualScanPage from './ManualScanPage';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { api } from '../services/api';
import { QueryClient } from '@tanstack/react-query';
import { renderWithProviders } from '../test/testUtils';

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
    'git_checkout',
    'sonar_scanner',
    'dependency_check',
    'trivy_fs_scan',
    'docker_build',
    'docker_push',
    'trivy_image_scan',
    'nmap_scan',
    'zap_scan'
  ],
  STAGE_DISPLAY_NAMES: {
    'git_checkout': 'Git Checkout',
    'sonar_scanner': 'Sonar Scanner',
    'dependency_check': 'Dependency Check',
    'trivy_fs_scan': 'Trivy FS Scan',
    'docker_build': 'Docker Build',
    'docker_push': 'Docker Push',
    'trivy_image_scan': 'Trivy Image Scan',
    'nmap_scan': 'Nmap Scan',
    'zap_scan': 'ZAP Scan'
  },
  STAGE_DEPENDENCIES: {}
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    token: 'mock-token',
    role: 'team_lead',
    permissions: {
      canManageUsers: false,
      canManageProjectAccess: false,
      canViewAllProjects: false,
      canAssignIssues: true,
      canVerifyIssues: true,
      canUpdateAssignedIssues: true,
    },
    currentUser: { id: 'user-1', username: 'tl', role: 'team_lead' },
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    refreshUser: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/projects/:projectId/manual" element={<ManualScanPage />} />
    </Routes>,
    { route: '/projects/1/manual', queryClient }
  );
}

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api.projects.get as any).mockResolvedValue(mockProject);
  });

  it('renders all 9 stages', async () => {
    renderPage();

    expect(await screen.findByText('Git Checkout')).toBeInTheDocument();
    expect(screen.getByText('Sonar Scanner')).toBeInTheDocument();
    expect(screen.getByText('ZAP Scan')).toBeInTheDocument();
  });

  it('toggles all stages when Select All / Deselect All is clicked', async () => {
    renderPage();

    await screen.findByText('Git Checkout');

    // Initially 0 stages selected (button shows "Start Scan (0 stages)")
    expect(screen.getByText(/Start Scan \(0 stages\)/)).toBeInTheDocument();
    const toggleBtn = screen.getByRole('button', { name: /select all/i });
    expect(toggleBtn).toHaveTextContent('Select All');

    // Click Select All — page has 9 fixed stages
    fireEvent.click(toggleBtn);
    expect(screen.getByText(/Start Scan \(9 stages\)/)).toBeInTheDocument();
    expect(toggleBtn).toHaveTextContent('Deselect All');

    // Click Deselect All
    fireEvent.click(toggleBtn);
    expect(screen.getByText(/Start Scan \(0 stages\)/)).toBeInTheDocument();
    expect(toggleBtn).toHaveTextContent('Select All');
  });
});
