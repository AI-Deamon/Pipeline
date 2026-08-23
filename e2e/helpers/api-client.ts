/**
 * Direct API client for E2E test setup/teardown.
 *
 * Uses the backend API directly (bypasses the UI) for faster
 * data seeding and cleanup operations.
 */
import { type APIRequestContext } from '@playwright/test';

const API_BASE = `${process.env.E2E_API_URL || 'http://localhost:8000'}/api/v1`;

interface APIClientOptions {
  request: APIRequestContext;
  token?: string;
  apiKey?: string;
}

const REQUEST_TIMEOUT = 60_000;

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 2000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}

export class TestAPIClient {
  private request: APIRequestContext;
  private token?: string;
  private apiKey: string;

  constructor(opts: APIClientOptions) {
    this.request = opts.request;
    this.token = opts.token;
    this.apiKey = opts.apiKey !== undefined ? opts.apiKey : (process.env.VITE_API_KEY || 'z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4');
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    if (this.apiKey) h['X-API-Key'] = this.apiKey;
    return h;
  }

  /**
   * Authenticate and store the token for subsequent calls.
   * NOTE: This hits the rate-limited login endpoint (10/min).
   * Prefer using API key auth (default) for setup/teardown.
   * Only call this when you need a real user token for UI testing.
   */
  async login(username: string, password: string): Promise<string> {
    return withRetry(async () => {
      const params = new URLSearchParams();
      params.append('username', username);
      params.append('password', password);

      const res = await this.request.post(`${API_BASE}/auth/login`, {
        data: params.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: REQUEST_TIMEOUT,
      });
      if (!res.ok()) throw new Error(`Login failed: ${res.status()}`);
      const body = await res.json();
      this.token = body.access_token;
      return this.token!;
    });
  }

  /** Register a new user account. */
  async register(username: string, password: string): Promise<{ username: string }> {
    return withRetry(async () => {
      const res = await this.request.post(`${API_BASE}/auth/register`, {
        data: JSON.stringify({ username, password }),
        headers: { 'Content-Type': 'application/json' },
        timeout: REQUEST_TIMEOUT,
      });
      if (!res.ok()) throw new Error(`Register failed: ${res.status()} — ${await res.text()}`);
      return res.json();
    });
  }

  /** Create a project via API. Returns full project response. */
  async createProject(data: {
    name: string;
    git_url: string;
    branch?: string;
    sonar_key: string;
    credentials_id?: string;
    target_ip?: string;
    target_url?: string;
  }): Promise<Record<string, unknown>> {
    return withRetry(async () => {
      const payload = {
        branch: 'main',
        credentials_id: 'github-credentials',
        ...data,
      };
      const res = await this.request.post(`${API_BASE}/projects`, {
        data: JSON.stringify(payload),
        headers: this.headers(),
        timeout: REQUEST_TIMEOUT,
      });
      if (!res.ok()) throw new Error(`Create project failed: ${res.status()} — ${await res.text()}`);
      return res.json();
    });
  }

  /** Delete a project by ID. */
  async deleteProject(projectId: string): Promise<void> {
    const res = await this.request.delete(`${API_BASE}/projects/${projectId}`, {
      headers: this.headers(),
      timeout: REQUEST_TIMEOUT,
    });
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`Delete project failed: ${res.status()}`);
    }
  }

  /** Trigger a scan on a project. */
  async triggerScan(
    projectId: string,
    mode: 'automated' | 'manual' = 'automated',
    stages?: string[],
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = { project_id: projectId, scan_mode: mode };
    if (stages) payload.selected_stages = stages;
    const res = await this.request.post(`${API_BASE}/scans`, {
      data: JSON.stringify(payload),
      headers: this.headers(),
      timeout: REQUEST_TIMEOUT,
    });
    if (!res.ok()) throw new Error(`Trigger scan failed: ${res.status()} — ${await res.text()}`);
    return res.json();
  }

  /** Cancel a running scan. */
  async cancelScan(scanId: string): Promise<Record<string, unknown>> {
    const res = await this.request.post(`${API_BASE}/scans/${scanId}/cancel`, {
      headers: this.headers(),
      timeout: REQUEST_TIMEOUT,
    });
    if (!res.ok()) throw new Error(`Cancel scan failed: ${res.status()} — ${await res.text()}`);
    return res.json();
  }

  /** Get scan details. */
  async getScan(scanId: string): Promise<Record<string, unknown>> {
    const res = await this.request.get(`${API_BASE}/scans/${scanId}`, {
      headers: this.headers(),
      timeout: REQUEST_TIMEOUT,
    });
    if (!res.ok()) throw new Error(`Get scan failed: ${res.status()}`);
    return res.json();
  }

  /** List projects. */
  async listProjects(): Promise<Record<string, unknown>[]> {
    const res = await this.request.get(`${API_BASE}/projects`, {
      headers: this.headers(),
      timeout: REQUEST_TIMEOUT,
    });
    if (!res.ok()) throw new Error(`List projects failed: ${res.status()}`);
    return res.json();
  }

  /** Get report summary for a project. */
  async getReportSummary(projectId: string, scanId?: string): Promise<Record<string, unknown>> {
    const url = scanId
      ? `${API_BASE}/reports/projects/${projectId}/reports/summary?scan_id=${scanId}`
      : `${API_BASE}/reports/projects/${projectId}/reports/summary`;
    const res = await this.request.get(url, { headers: this.headers(), timeout: REQUEST_TIMEOUT });
    if (!res.ok()) throw new Error(`Get report summary failed: ${res.status()}`);
    return res.json();
  }

  /** Get all reports for a project. */
  async getReports(projectId: string): Promise<Record<string, unknown>[]> {
    const url = `${API_BASE}/reports/projects/${projectId}/reports`;
    const res = await this.request.get(url, { headers: this.headers(), timeout: REQUEST_TIMEOUT });
    if (!res.ok()) throw new Error(`Get reports failed: ${res.status()}`);
    return res.json();
  }

  /** Get a single report by ID. */
  async getReport(reportId: number): Promise<Record<string, unknown>> {
    const res = await this.request.get(`${API_BASE}/reports/${reportId}`, {
      headers: this.headers(),
      timeout: REQUEST_TIMEOUT,
    });
    if (!res.ok()) throw new Error(`Get report failed: ${res.status()}`);
    return res.json();
  }

  /** Create an issue via API. */
  async createIssue(data: {
    issue_id: string;
    project_id: string;
    tool_name: string;
    severity: string;
    title: string;
    description?: string;
    finding_type?: string;
    recommendation?: string;
    location?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const res = await this.request.post(`${API_BASE}/issues`, {
      data: JSON.stringify(data),
      headers: this.headers(),
    });
    if (!res.ok()) throw new Error(`Create issue failed: ${res.status()} — ${await res.text()}`);
    return res.json();
  }

  /** Assign an issue. */
  async assignIssue(
    issueId: number,
    assigneeId: string,
    priority?: string,
  ): Promise<Record<string, unknown>> {
    return withRetry(async () => {
      const payload: Record<string, unknown> = { assignee_id: assigneeId };
      if (priority) payload.priority = priority;
      const res = await this.request.post(`${API_BASE}/issues/${issueId}/assign`, {
        data: JSON.stringify(payload),
        headers: this.headers(),
        timeout: REQUEST_TIMEOUT,
      });
      if (!res.ok()) throw new Error(`Assign issue failed: ${res.status()} — ${await res.text()}`);
      return res.json();
    });
  }

  /** Transition issue status. */
  async transitionIssue(
    issueId: number,
    status: string,
    comment?: string,
  ): Promise<Record<string, unknown>> {
    return withRetry(async () => {
      const payload: Record<string, unknown> = { status };
      if (comment) payload.comment = comment;
      const res = await this.request.post(`${API_BASE}/issues/${issueId}/transition`, {
        data: JSON.stringify(payload),
        headers: this.headers(),
        timeout: REQUEST_TIMEOUT,
      });
      if (!res.ok()) throw new Error(`Transition issue failed: ${res.status()} — ${await res.text()}`);
      return res.json();
    });
  }

  /** Get current user info. */
  async getMe(): Promise<Record<string, unknown>> {
    const res = await this.request.get(`${API_BASE}/auth/me`, {
      headers: this.headers(),
      timeout: REQUEST_TIMEOUT,
    });
    if (!res.ok()) throw new Error(`Get me failed: ${res.status()}`);
    return res.json();
  }

  /** List all users (admin only). */
  async listUsers(): Promise<Record<string, unknown>[]> {
    const res = await this.request.get(`${API_BASE}/users`, {
      headers: this.headers(),
      timeout: REQUEST_TIMEOUT,
    });
    if (!res.ok()) throw new Error(`List users failed: ${res.status()}`);
    return res.json();
  }

  /** Update user role (admin only). */
  async updateUserRole(userId: string, role: string): Promise<Record<string, unknown>> {
    const res = await this.request.patch(`${API_BASE}/users/${userId}/role`, {
      data: JSON.stringify({ role }),
      headers: this.headers(),
      timeout: REQUEST_TIMEOUT,
    });
    if (!res.ok()) throw new Error(`Update role failed: ${res.status()} — ${await res.text()}`);
    return res.json();
  }

  /** Delete a user (admin only). */
  async deleteUser(userId: string): Promise<void> {
    const res = await this.request.delete(`${API_BASE}/users/${userId}`, {
      headers: this.headers(),
      timeout: REQUEST_TIMEOUT,
    });
    if (!res.ok() && res.status() !== 404 && res.status() !== 204) {
      throw new Error(`Delete user failed: ${res.status()}`);
    }
  }

  /** Grant project access to a user. */
  async grantProjectAccess(
    userId: string,
    scopeType: string,
    scopeId: string,
  ): Promise<Record<string, unknown>> {
    const res = await this.request.post(`${API_BASE}/users/${userId}/project-access`, {
      data: JSON.stringify({ scope_type: scopeType, scope_id: scopeId }),
      headers: this.headers(),
      timeout: REQUEST_TIMEOUT,
    });
    if (!res.ok()) throw new Error(`Grant access failed: ${res.status()} — ${await res.text()}`);
    return res.json();
  }
}
