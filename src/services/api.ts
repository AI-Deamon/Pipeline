import axios from 'axios';
import type { Project, Scan, ScanStage, ScanMode, StageId, ProjectGroup, ProjectGroupDetail, ProjectGroupCreate, OverviewResponse, ToolIssuesResponse, MyIssuesResponse, IssueCreatePayload, IssueResponse, IssueAssignPayload, IssueStatusPayload, CommentResponse, IssueHistoryResponse, CurrentUser, UserAccess, AccessChange, ProjectAccessAssignment, PortfolioOverview, PortfolioTrendsResponse, PortfolioProjectToolDetail, TeamWorkloadResponse } from '../types';
import { ApiError } from '../utils/apiError';
import { isLegacyAuthGracePeriodActive } from '../utils/authGracePeriod';

const API_BASE_URL = '/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // T039: Abort requests after 30 seconds
});

apiClient.interceptors.request.use((config) => {
  // Grace period (24h from the cookie-auth migration): fall back to sessionStorage
  // only while the window is open. Once it closes we stop reading this value even if
  // it's still present, so a stale/leftover token can't grant access indefinitely.
  if (isLegacyAuthGracePeriodActive()) {
    const legacyToken = sessionStorage.getItem('token');
    if (legacyToken) {
      console.warn('[api] Using legacy sessionStorage token — will be removed after migration.');
      config.headers.Authorization = `Bearer ${legacyToken}`;
    }
  }
  // Browser automatically sends httpOnly cookies; no manual header injection needed

  // API key for server-to-server auth (Jenkins callbacks use backend env var only)
  const apiKey = sessionStorage.getItem('API_KEY') || import.meta.env.VITE_API_KEY;
  if (apiKey) {
    config.headers['X-API-Key'] = apiKey;
  }

  return config;
});

// Response interceptor for consistent error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear all session state
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('API_KEY');

      // Check for specific auth reason
      const reason = error.response.headers?.['x-auth-reason'];
      const params = new URLSearchParams();
      if (reason === 'account-deleted') {
        params.set('reason', 'account-deleted');
      }

      // Redirect to login
      const loginPath = `/login?${params.toString()}`;
      if (window.location.pathname !== '/login') {
        window.location.href = loginPath;
      }
    }
    throw ApiError.fromAxiosError(error);
  }
);

export const api = {
  auth: {
    login: async (username: string, password: string): Promise<{ access_token: string, token_type: string }> => {
      // OAuth2 expects form-urlencoded
      const params = new URLSearchParams();
      params.append('username', username);
      params.append('password', password);

      const response = await apiClient.post('/auth/login', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      return response.data;
    },
    register: async (username: string, password: string): Promise<{ username: string }> => {
      const response = await apiClient.post('/auth/register', {
        username,
        password,
      });
      return response.data;
    },
    me: async (): Promise<CurrentUser> => {
      const response = await apiClient.get('/auth/me');
      return response.data;
    },
  },
  projects: {
    // Fetches every project across all pages. GET /projects is paginated server-side
    // (page_size defaults to 25, max 100) to avoid the N+1/latency issues a single
    // unbounded query caused at scale — but every caller of this method (dashboards,
    // portfolio/executive/team-workload/trend-analysis pages) needs the complete set
    // for correct aggregate totals, not just page 1. This loops through all pages so
    // those callers keep seeing the full project list instead of silently only the
    // first 25. A dedicated `listPage` is available for real paginated table UI.
    list: async (): Promise<Project[]> => {
      const PAGE_SIZE = 100;
      const MAX_PAGES = 100; // safety cap: 10,000 projects: well beyond any real deployment
      const firstPage = await api.projects.listPage(1, PAGE_SIZE);
      const items = [...firstPage.items];
      const totalPages = firstPage.total_pages ?? 1;

      if (totalPages > MAX_PAGES) {
        console.warn(
          `[api] projects.list: total_pages (${totalPages}) exceeds safety cap (${MAX_PAGES}); ` +
          `only the first ${MAX_PAGES * PAGE_SIZE} projects will be returned.`
        );
      }

      const pagesToFetch = Math.min(totalPages, MAX_PAGES);
      for (let page = 2; page <= pagesToFetch; page++) {
        const next = await api.projects.listPage(page, PAGE_SIZE);
        items.push(...next.items);
      }

      return items;
    },
    // Fetches a single page directly — use for a real paginated table UI where only
    // the current page's rows and the pagination metadata are needed.
    listPage: async (
      page: number = 1,
      pageSize: number = 25
    ): Promise<{ items: Project[]; total: number; page: number; page_size: number; total_pages: number }> => {
      const response = await apiClient.get('/projects', { params: { page, page_size: pageSize } });
      // Handle paginated response shape: { items, total, page, page_size, total_pages }
      if (response.data && Array.isArray(response.data.items)) {
        return response.data;
      }
      // Grace period fallback: if backend still returns a bare array (pre-migration)
      if (Array.isArray(response.data)) {
        return {
          items: response.data,
          total: response.data.length,
          page: 1,
          page_size: response.data.length,
          total_pages: 1,
        };
      }
      throw new ApiError(500, 'Invalid response format from server');
    },
    get: async (id: string): Promise<Project | undefined> => {
      const response = await apiClient.get(`/projects/${id}`);
      return response.data;
    },
    create: async (project: Omit<Project, 'project_id'>): Promise<Project> => {
      const response = await apiClient.post('/projects', project);
      return response.data;
    },
    update: async (id: string, project: Partial<Omit<Project, 'project_id'>>): Promise<Project> => {
      const response = await apiClient.patch(`/projects/${id}`, project);
      return response.data;
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/projects/${id}`);
    },
    getScanHistory: async (projectId: string) => {
      const response = await apiClient.get(`/projects/${projectId}/scans`);
      return response.data;
    }
  },
  scans: {
    list: async (): Promise<Scan[]> => {
      const response = await apiClient.get('/scans');
      if (!Array.isArray(response.data)) {
        throw new ApiError(500, 'Invalid response format from server');
      }
      return response.data;
    },
    get: async (id: string): Promise<Scan | undefined> => {
      const response = await apiClient.get(`/scans/${id}`);
      return response.data;
    },
    getResults: async (id: string): Promise<ScanStage[]> => {
      const response = await apiClient.get(`/scans/${id}/results`);
      return response.data.results || [];
    },
    trigger: async (project_id: string, scan_mode: ScanMode, selected_stages?: StageId[]): Promise<Scan> => {
      const response = await apiClient.post('/scans', {
        project_id,
        scan_mode,
        selected_stages
      });
      return response.data;
    },
    reset: async (id: string) => {
      const response = await apiClient.post(`/scans/${id}/reset`);
      return response.data;
    },
    cancel: async (id: string) => {
      const response = await apiClient.post(`/scans/${id}/cancel`);
      return response.data;
    },
    forceUnlock: async (id: string) => {
      const response = await apiClient.post(`/scans/${id}/force-unlock`);
      return response.data;
    },
    getHistory: async (projectId: string) => {
      const response = await apiClient.get(`/projects/${projectId}/scans`);
      return response.data;
    }
  },
  reports: {
    getSummary: async (projectId: string, scanId?: string) => {
      const url = scanId
        ? `/reports/projects/${projectId}/reports/summary?scan_id=${scanId}`
        : `/reports/projects/${projectId}/reports/summary`;
      const response = await apiClient.get(url);
      return response.data;
    },
    getAll: async (projectId: string, scanId?: string) => {
      const url = scanId
        ? `/reports/projects/${projectId}/reports?scan_id=${scanId}`
        : `/reports/projects/${projectId}/reports`;
      const response = await apiClient.get(url);
      return response.data;
    },
    getOne: async (reportId: number) => {
      const response = await apiClient.get(`/reports/${reportId}`);
      return response.data;
    },
    download: async (reportId: number) => {
      const response = await apiClient.get(`/reports/${reportId}/download`);
      return response.data;
    },
    getUnified: async (projectId: string, scanId?: string) => {
      const url = scanId
        ? `/reports/projects/${projectId}/reports/unified?scan_id=${scanId}`
        : `/reports/projects/${projectId}/reports/unified`;
      const response = await apiClient.get(url);
      return response.data;
    },
    getTrends: async (projectId: string, days: number = 30) => {
      const response = await apiClient.get(
        `/reports/projects/${projectId}/reports/trends?days=${days}`
      );
      return response.data;
    },
    getCompliance: async (projectId: string, scanId?: string) => {
      const url = scanId
        ? `/reports/projects/${projectId}/reports/compliance?scan_id=${scanId}`
        : `/reports/projects/${projectId}/reports/compliance`;
      const response = await apiClient.get(url);
      return response.data;
    },
    exportUnified: async (projectId: string, format: 'html' | 'pdf' = 'html', scanId?: string, reportType: string = 'technical') => {
      const params = new URLSearchParams();
      params.append('format', format);
      params.append('report_type', reportType);
      if (scanId) {
        params.append('scan_id', scanId);
      }
      const response = await apiClient.get(
        `/reports/projects/${projectId}/reports/unified/export?${params.toString()}`,
        { responseType: 'blob' }
      );
      return response.data;
    },
    getDeveloperReport: async (projectId: string, scanId: string) => {
      const response = await apiClient.get(
        `/reports/projects/${projectId}/reports/${scanId}/developer`
      );
      return response.data;
    },
    getFileMeasures: async (componentKey: string) => {
      const response = await apiClient.get(
        `/reports/file-measures/${encodeURIComponent(componentKey)}`
      );
      return response.data;
    },
  },
  projectGroups: {
    list: async (): Promise<ProjectGroup[]> => {
      const response = await apiClient.get('/project-groups');
      return response.data;
    },
    get: async (groupId: string): Promise<ProjectGroupDetail> => {
      const response = await apiClient.get(`/project-groups/${groupId}`);
      return response.data;
    },
    create: async (data: ProjectGroupCreate): Promise<ProjectGroup> => {
      const response = await apiClient.post('/project-groups', data);
      return response.data;
    },
    update: async (groupId: string, data: Partial<ProjectGroupCreate>): Promise<ProjectGroup> => {
      const response = await apiClient.patch(`/project-groups/${groupId}`, data);
      return response.data;
    },
    delete: async (groupId: string): Promise<void> => {
      await apiClient.delete(`/project-groups/${groupId}`);
    },
    autoAssign: async (groupId: string): Promise<{ status: string; message: string; assigned_count: number; total_matches: number }> => {
      const response = await apiClient.post(`/project-groups/${groupId}/auto-assign`);
      return response.data;
    },
    refresh: async (groupId: string, autoReassign: boolean = true): Promise<{ status: string; message: string; refreshed_count: number }> => {
      const response = await apiClient.post(`/project-groups/${groupId}/refresh?auto_reassign=${autoReassign}`);
      return response.data;
    },
    getSuggestions: async (): Promise<Array<{pattern: string; name_suggestion: string; related_projects: number}>> => {
      const response = await apiClient.get('/project-groups/suggest');
      return response.data;
    },
    assignScan: async (groupId: string, scanId: string): Promise<{ status: string; message: string }> => {
      const response = await apiClient.post(`/project-groups/${groupId}/assignments?scan_id=${scanId}`);
      return response.data;
    },
    removeScan: async (groupId: string, scanId: string): Promise<{ status: string; message: string }> => {
      const response = await apiClient.delete(`/project-groups/${groupId}/assignments/${scanId}`);
      return response.data;
    },
  },
  issues: {
    create: async (data: IssueCreatePayload): Promise<IssueResponse> => {
      const response = await apiClient.post('/issues', data);
      return response.data;
    },
    get: async (issueId: number): Promise<IssueResponse> => {
      const response = await apiClient.get(`/issues/${issueId}`);
      return response.data;
    },
    assign: async (issueId: number, data: IssueAssignPayload): Promise<IssueResponse> => {
      const response = await apiClient.post(`/issues/${issueId}/assign`, data);
      return response.data;
    },
    transition: async (issueId: number, data: IssueStatusPayload): Promise<IssueResponse> => {
      const response = await apiClient.post(`/issues/${issueId}/transition`, data);
      return response.data;
    },
    getProjectOverview: async (projectId: string): Promise<OverviewResponse> => {
      const response = await apiClient.get(`/issues/projects/${projectId}/overview`);
      return response.data;
    },
    getToolIssues: async (projectId: string, toolName: string, page?: number, pageSize?: number, findingType?: string): Promise<ToolIssuesResponse> => {
      const params = new URLSearchParams();
      if (page !== undefined) params.append('page', String(page));
      if (pageSize !== undefined) params.append('page_size', String(pageSize));
      if (findingType !== undefined) params.append('finding_type', findingType);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await apiClient.get(`/issues/projects/${projectId}/tools/${toolName}${query}`);
      return response.data;
    },
    getMyIssues: async (page?: number, pageSize?: number): Promise<MyIssuesResponse> => {
      const params = new URLSearchParams();
      if (page !== undefined) params.append('page', String(page));
      if (pageSize !== undefined) params.append('page_size', String(pageSize));
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await apiClient.get(`/issues/my${query}`);
      return response.data;
    },
    getCodeSnippet: async (
      projectId: string,
      params: { file: string; line: number; context?: number; branch?: string }
    ): Promise<{
      file: string;
      language: string;
      branch: string;
      start_line: number;
      end_line: number;
      highlight_line: number;
      content: string;
      git_url: string | null;
      source: string;
    }> => {
      const search = new URLSearchParams();
      search.append('file', params.file);
      search.append('line', String(params.line));
      if (params.context !== undefined) search.append('context', String(params.context));
      if (params.branch) search.append('branch', params.branch);
      const response = await apiClient.get(
        `/projects/${projectId}/code-snippet?${search.toString()}`
      );
      return response.data;
    },
    requestRescan: async (issueId: number, data: { fix_note: string; commit_sha?: string }) => {
      const response = await apiClient.post(`/issues/${issueId}/request-rescan`, data);
      return response.data;
    },
    editRescanRequest: async (id: number, data: { fix_note: string; version: number }) => {
      const response = await apiClient.patch(`/rescan-requests/${id}`, data);
      return response.data;
    },
    cancelRescanRequest: async (id: number, data: { version: number }) => {
      const response = await apiClient.delete(`/rescan-requests/${id}`, { data });
      return response.data;
    },
    approveRescan: async (issueId: number, data: { reviewer_note?: string }) => {
      const response = await apiClient.post(`/issues/${issueId}/approve-rescan`, data);
      return response.data;
    },
    rejectRescan: async (issueId: number, data: { reviewer_note?: string }) => {
      const response = await apiClient.post(`/issues/${issueId}/reject-rescan`, data);
      return response.data;
    },
    triggerVerifyScan: async (projectId: string, tool: string) => {
      const response = await apiClient.post(`/scans/trigger-verify`, null, {
        params: { project_id: projectId, tool },
      });
      return response.data;
    },
    getPendingVerification: async (params?: {
      project_id?: string;
      status?: string;
      page?: number;
    }) => {
      const search = new URLSearchParams();
      if (params?.project_id) search.append('project_id', params.project_id);
      if (params?.status) search.append('status', params.status);
      if (params?.page) search.append('page', String(params.page));
      const query = search.toString() ? `?${search.toString()}` : '';
      const response = await apiClient.get(`/issues/pending-verification${query}`);
      return response.data;
    },
    getRawFixNote: async (id: number) => {
      const response = await apiClient.get(`/fix-notes/${id}/raw`);
      return response.data;
    },
    addComment: async (issueId: number, message: string): Promise<CommentResponse> => {
      const response = await apiClient.post(`/issues/${issueId}/comments`, { message });
      return response.data;
    },
    getHistory: async (issueId: number): Promise<IssueHistoryResponse> => {
      const response = await apiClient.get(`/issues/${issueId}/history`);
      return response.data;
    },
    findByFindingKey: async (
      projectId: string,
      tool: string,
      findingId: string,
    ): Promise<IssueResponse | null> => {
      const PAGE_CAP = 5;
      const PAGE_SIZE = 25;
      for (let page = 1; page <= PAGE_CAP; page++) {
        const result = await api.issues.getToolIssues(projectId, tool, page, PAGE_SIZE, undefined);
        const match = result.issues.find((i) => i.issue_id === findingId);
        if (match) return match;
        if (result.issues.length < PAGE_SIZE) return null;
      }
      return null;
    },
  },
  health: {
    check: async (): Promise<{ status: 'operational' | 'degraded' | 'down'; details?: string }> => {
      const response = await apiClient.get('/health');
      return response.data;
    },
  },
  rbac: {
    getUsers: async (role?: string): Promise<CurrentUser[]> => {
      const params = new URLSearchParams();
      if (role) params.append('role', role);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await apiClient.get(`/users${query}`);
      return response.data;
    },
    deleteUser: async (userId: string): Promise<void> => {
      await apiClient.delete(`/users/${userId}`);
    },
    updateUserRole: async (userId: string, role: string): Promise<CurrentUser> => {
      const response = await apiClient.patch(`/users/${userId}/role`, { role });
      return response.data;
    },
    getProjectAccess: async (userId: string): Promise<UserAccess> => {
      const response = await apiClient.get(`/users/${userId}/project-access`);
      const d = response.data;
      return {
        userId: d.user_id ?? d.userId ?? '',
        assignments: (d.assignments || []).map((a: Record<string, unknown>) => ({
          id: a.id as number,
          userId: (a.user_id ?? a.userId ?? '') as string,
          scopeType: (a.scope_type ?? a.scopeType ?? '') as string,
          scopeId: (a.scope_id ?? a.scopeId ?? '') as string,
          scopeName: a.scope_name as string | undefined ?? a.scopeName as string | undefined,
          assignedBy: a.assigned_by as string | undefined ?? a.assignedBy as string | undefined,
          createdAt: (a.created_at ?? a.createdAt ?? '') as string,
        })),
      };
    },
    grantProjectAccess: async (userId: string, scopeType: string, scopeId: string): Promise<ProjectAccessAssignment> => {
      const response = await apiClient.post(`/users/${userId}/project-access`, {
        scope_type: scopeType,
        scope_id: scopeId,
      });
      return response.data;
    },
    revokeProjectAccess: async (userId: string, assignmentId: number): Promise<void> => {
      await apiClient.delete(`/users/${userId}/project-access/${assignmentId}`);
    },
    getAccessChanges: async (targetUserId?: string, actorId?: string, changeType?: string): Promise<AccessChange[]> => {
      const params = new URLSearchParams();
      if (targetUserId) params.append('target_user_id', targetUserId);
      if (actorId) params.append('actor_id', actorId);
      if (changeType) params.append('change_type', changeType);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await apiClient.get(`/access-changes${query}`);
      return response.data;
    },
  },
  portfolio: {
    getOverview: async (): Promise<PortfolioOverview> => {
      const response = await apiClient.get('/portfolio/overview');
      return response.data;
    },
    getTrends: async (months: number = 6): Promise<PortfolioTrendsResponse> => {
      const response = await apiClient.get(`/portfolio/trends?months=${months}`);
      return response.data;
    },
    getProjectToolDetail: async (projectId: string): Promise<PortfolioProjectToolDetail> => {
      const response = await apiClient.get(`/portfolio/project/${projectId}/tools`);
      return response.data;
    },
    getTeamWorkload: async (): Promise<TeamWorkloadResponse> => {
      const response = await apiClient.get('/portfolio/team-workload');
      return response.data;
    },
  },
};
