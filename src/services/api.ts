import axios from 'axios';
import type { Project, Scan, ScanStage, ScanMode, StageId } from '../types';
import { ApiError } from '../utils/apiError';

const API_BASE_URL = '/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
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
    register: async (username: string, password: string, email?: string): Promise<{ username: string }> => {
      const response = await apiClient.post('/auth/register', {
        username,
        password,
        email: email || `${username}@example.com`
      });
      return response.data;
    }
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
  }
};
