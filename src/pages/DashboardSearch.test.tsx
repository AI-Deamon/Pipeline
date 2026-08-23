import { screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import DashboardPage from "./DashboardPage";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { api } from "../services/api";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "../test/testUtils";

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    token: "mock-token",
    role: "admin",
    permissions: {
      canManageUsers: true,
      canManageProjectAccess: true,
      canViewAllProjects: true,
      canAssignIssues: true,
      canVerifyIssues: true,
      canUpdateAssignedIssues: true,
    },
    currentUser: { id: "u-1", username: "admin", role: "admin" },
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    refreshUser: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

vi.mock("../services/api", () => ({
  api: {
    projects: {
      list: vi.fn(),
      delete: vi.fn(),
    },
    portfolio: {
      getOverview: vi.fn().mockResolvedValue({
        total_projects: 3,
        total_findings: 0,
        severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        projects: [
          { project_id: "1", name: "Alpha Project", risk_score: 100, total_findings: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0, tools: [], last_scan_state: "COMPLETED" },
          { project_id: "2", name: "Beta Project", risk_score: 100, total_findings: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0, tools: [], last_scan_state: "FAILED" },
          { project_id: "3", name: "Gamma Project", risk_score: 100, total_findings: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0, tools: [], last_scan_state: "COMPLETED" },
        ],
      }),
    },
  },
}));

describe("DashboardPage Search", () => {
  const mockProjects = [
    { project_id: "1", name: "Alpha Project", last_scan_state: "COMPLETED" },
    { project_id: "2", name: "Beta Project", last_scan_state: "FAILED" },
    { project_id: "3", name: "Gamma Project", last_scan_state: "COMPLETED" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api.projects.list as any).mockResolvedValue(mockProjects);
  });

  afterEach(() => {
    cleanup();
  });

  it("filters projects based on search term after debounce", async () => {
    renderWithProviders(<DashboardPage />, { queryClient });

    // Wait for initial fetch to populate projects
    await waitFor(() => {
      expect(screen.getByText("Alpha Project")).toBeInTheDocument();
    });
    expect(screen.getByText("Beta Project")).toBeInTheDocument();
    expect(screen.getByText("Gamma Project")).toBeInTheDocument();

    const searchInput = screen.getByLabelText("Search projects");

    // Search for "Alpha"
    fireEvent.change(searchInput, { target: { value: "Alpha" } });

    // After the debounce (300ms), only Alpha should remain
    await waitFor(() => {
      expect(screen.queryByText("Beta Project")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Alpha Project")).toBeInTheDocument();
    expect(screen.queryByText("Gamma Project")).not.toBeInTheDocument();
  });

  it('shows "No projects found" message after debounce', async () => {
    renderWithProviders(<DashboardPage />, { queryClient });

    await waitFor(() => {
      expect(screen.getByText("Alpha Project")).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText("Search projects");

    // Search for something that doesn't exist
    fireEvent.change(searchInput, { target: { value: "Zeta" } });

    await waitFor(() => {
      expect(screen.getByText("No projects found")).toBeInTheDocument();
    });
    expect(screen.getByText(/No projects matching "Zeta"/)).toBeInTheDocument();
  });

  it('clears search when "Clear search" button is clicked', async () => {
    renderWithProviders(<DashboardPage />, { queryClient });

    await waitFor(() => {
      expect(screen.getByText("Alpha Project")).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText("Search projects");

    // Search for "Alpha"
    fireEvent.change(searchInput, { target: { value: "Alpha" } });

    await waitFor(() => {
      expect(screen.queryByText("Beta Project")).not.toBeInTheDocument();
    });

    // Click clear button
    const clearButton = screen.getByLabelText("Clear search");
    fireEvent.click(clearButton);

    // Search term clears immediately
    expect(searchInput).toHaveValue("");

    // List reverts after debounce
    await waitFor(() => {
      expect(screen.getByText("Beta Project")).toBeInTheDocument();
    });
    expect(screen.getByText("Alpha Project")).toBeInTheDocument();
    expect(screen.getByText("Gamma Project")).toBeInTheDocument();
  });
});
