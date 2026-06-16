import axios from 'axios';
import type { Project, Scan, ScanStage, ScanMode, StageId, ProjectGroup, ProjectGroupDetail, ProjectGroupCreate, OverviewResponse, ToolIssuesResponse, MyIssuesResponse, IssueCreatePayload, IssueResponse, IssueAssignPayload, IssueStatusPayload, CommentResponse, IssueHistoryResponse, CurrentUser, UserAccess, AccessChange, ProjectAccessAssignment } from '../types';
import { ApiError } from '../utils/apiError';

const API_BASE_URL = '/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // T039: Abort requests after 30 seconds
});

apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Always include API Key for backend authentication
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
    list: async (): Promise<Project[]> => {
      const response = await apiClient.get('/projects');
      if (!Array.isArray(response.data)) {
        throw new ApiError(500, 'Invalid response format from server');
      }
      return response.data;
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
    }
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
    triggerVerifyScan: async (issueId: number, note: string) => {
      const response = await apiClient.post(`/issues/${issueId}/trigger-verify-scan`, { note });
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
      return response.data;
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
};
