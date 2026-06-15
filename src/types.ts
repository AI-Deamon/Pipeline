export type ScanStatus = 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'SKIPPED' | 'PASS' | 'WARN';
export type ScanMode = 'automated' | 'manual';

export type ScanStage = {
  stage: string;
  status: string; // Using string to be more flexible with backend statuses
  summary?: string;
  artifact_url?: string;
  artifact_size_bytes?: number;
  artifact_sha256?: string;
  timestamp?: string;
};

export type Project = {
  project_id: string;
  name: string;
  git_url: string;
  branch: string;
  credentials_id: string;
  sonar_key: string;
  target_ip?: string;
  target_url?: string;
  last_scan_state?: string;
  last_scan_id?: string;
  last_scan_time?: string;
};

export type Scan = {
  scan_id: string;
  project_id: string;
  scan_mode?: ScanMode;
  state: 'INITIAL' | 'WAITING' | 'IN PROGRESS' | 'FINISHED' | 'FAILED' | 'CANCELLED' | 'CREATED' | 'QUEUED' | 'RUNNING' | 'COMPLETED';
  selected_stages?: string[];
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  results?: ScanStage[];
  retry_count?: number | string;
  jenkins_build_number?: number | string;
  jenkins_queue_id?: string;
};

// Report Summary Types
export type SeveritySummary = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
};

export type ToolSummary = {
  tool: string;
  findings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  link?: string;
};

export type ReportSummary = {
  project_id: string;
  total_findings: number;
  severity: SeveritySummary;
  tools: ToolSummary[];
};

export type UnifiedReport = {
  project_id: string;
  scan_id?: string;
  total_findings: number;
  severity: SeveritySummary;
  findings: Finding[];
  generated_at: string;
  risk_score?: {
    score: number;
    trend: string;
    level: string;
    previous_score?: number;
  };
};

export type TrendData = {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
};

// Backend stage IDs (snake_case) - used in API calls
export const FIXED_STAGES = [
  'git_checkout',
  'sonar_scanner',
  'dependency_check',
  'trivy_fs_scan',
  'docker_build',
  'docker_push',
  'trivy_image_scan',
  'nmap_scan',
  'zap_scan'
] as const;

// Frontend display names (Title Case) - used in UI
export const STAGE_DISPLAY_NAMES: Record<StageId, string> = {
  'git_checkout': 'Git Checkout',
  'sonar_scanner': 'Sonar Scanner',
  'dependency_check': 'Dependency Check',
  'trivy_fs_scan': 'Trivy FS Scan',
  'docker_build': 'Docker Build',
  'docker_push': 'Docker Push',
  'trivy_image_scan': 'Trivy Image Scan',
  'nmap_scan': 'Nmap Scan',
  'zap_scan': 'ZAP Scan'
};

export type StageId = typeof FIXED_STAGES[number];

// Stages that require git_checkout (and other dependencies)
export const STAGE_DEPENDENCIES: Record<string, StageId[]> = {
  'sonar_scanner': ['git_checkout'],
  'dependency_check': ['git_checkout'],
  'trivy_fs_scan': ['git_checkout'],
  'docker_build': ['git_checkout'],
  'docker_push': ['git_checkout', 'docker_build'],
  'trivy_image_scan': ['git_checkout', 'docker_build'],
};

// Helper to convert stage ID to display name
export const getStageDisplayName = (stageId: StageId): string => {
  return STAGE_DISPLAY_NAMES[stageId] || stageId;
};

// Finding type for unified reports
export type Finding = {
  id: string;
  severity: string;
  title: string;
  description?: string;
  cve?: string;
  host?: string;
  port?: number;
  service?: string;
  uri?: string;
  package?: string;
  recommendation?: string;
  tool?: string;
  raw_evidence?: string;
  rule?: string;
  finding_type?: string;
};

// Compliance Mapping Types
export type OWASPComplianceItem = {
  id: string;
  name: string;
  count: number;
};

export type CWEComplianceItem = {
  id: string;
  count: number;
};

export type ComplianceData = {
  owasp_top_10: OWASPComplianceItem[];
  cwe_top_25: CWEComplianceItem[];
};

export type ComplianceReport = {
  project_id: string;
  scan_id?: string;
  compliance: ComplianceData;
  generated_at: string;
};

// Project Group Types (Unified Project View)
export type ScanAssignment = {
  scan_id: string;
  project_id: string;
  match_confidence: number;
  is_auto_assigned: boolean;
  assigned_at: string;
};

export type ProjectGroup = {
  group_id: string;
  name: string;
  description?: string;
  naming_pattern: string;
  created_at: string;
  updated_at?: string;
};

export type ProjectGroupDetail = ProjectGroup & {
  assigned_scans: ScanAssignment[];
  total_findings: number;
  severity_summary: SeveritySummary;
};

export type ProjectGroupCreate = {
  name: string;
  description?: string;
  naming_pattern: string;
};

export type GroupAggregatedReport = {
  total_findings: number;
  severity_summary: SeveritySummary;
  findings: Finding[];
  assigned_scans_count: number;
};

// Issue Tracker Types
export type IssueStatus = 'open' | 'assigned' | 'in_progress' | 'fixed' | 'verified' | 'rejected';

export type IssueCreatePayload = {
  issue_id: string;
  project_id: string;
  tool_name: string;
  severity: string;
  title: string;
  scan_id?: string;
  first_seen_scan_id?: string;
  description?: string;
  issue_type?: string;
  location?: Record<string, unknown>;
  severity_v2?: string;
  effort?: string;
  rule?: string;
  recommendation?: string;
  finding_type?: string;
  raw_evidence?: string;
};

export type IssueResponse = {
  id: number;
  issue_id: string;
  project_id: string;
  tool_name: string;
  scan_id?: string;
  first_seen_scan_id?: string;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at?: string;
  severity: string;
  issue_type?: string;
  title: string;
  description?: string;
  location?: Record<string, unknown>;
  severity_v2?: string;
  effort?: string;
  rule?: string;
  recommendation?: string;
  finding_type?: string;
  raw_evidence?: string;
  code_snippet?: string;
  is_new: boolean;
  status: IssueStatus;
  assignee_id?: string;
  assigned_by?: string;
  priority?: string;
  extra_metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  file_path?: string;
  line_number?: number;
  tags?: string[];
  code_snippet_language?: string;
  git_url?: string | null;
};

export type IssueAssignPayload = {
  assignee_id: string;
  priority?: string;
  comment?: string;
};

export type IssueStatusPayload = {
  status: string;
  comment?: string;
};

export type RescanRequestResponse = {
  id: number;
  issue_id: number;
  requested_by: string;
  fix_note: string | null;
  commit_sha?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  scan_id: string | null;
  verdict: 'verified' | 'rejected' | null;
  reviewer_id: string | null;
  reviewer_note: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type RescanRequestCreate = {
  fix_note: string;
  commit_sha?: string;
};

export type RescanRequestedEvent = {
  issue_id: number;
  rescan_request_id: number;
  requested_by: string;
  project_id: string;
};

export type RescanApprovedEvent = {
  issue_id: number;
  rescan_request_id: number;
  approved_by: string;
  scan_id: string;
};

export type RescanVerificationCompleteEvent = {
  issue_id: number;
  rescan_request_id: number;
  verdict: 'verified' | 'rejected';
  scan_id: string;
  issue_still_present: boolean;
};

export type PendingVerificationItem = {
  rescan_request_id: number;
  issue_id: number;
  issue_title: string;
  issue_severity: string;
  tool: string;
  requested_by: string;
  requested_by_name: string;
  fix_note: string | null;
  commit_sha?: string | null;
  status: string;
  created_at: string;
  fix_elapsed_minutes: number;
};

export type PendingVerificationGroup = {
  project_id: string;
  project_name: string;
  items: PendingVerificationItem[];
};

export type PendingVerificationResponse = {
  total: number;
  page: number;
  page_size: number;
  groups: PendingVerificationGroup[];
};

export type CodeSnippetResponse = {
  file: string;
  language: string;
  branch: string;
  start_line: number;
  end_line: number;
  highlight_line: number;
  content: string;
  git_url: string | null;
  source: string;
};

export type ToolOverview = {
  tool: string;
  total: number;
  severity: Record<string, number>;
  by_type?: Record<string, number>;
};

export type OverviewResponse = {
  project_id: string;
  tools: ToolOverview[];
};

export type ToolIssuesResponse = {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  issues: IssueResponse[];
};

export type MyIssuesResponse = {
  total: number;
  page: number;
  page_size: number;
  projects: Array<{ project_id: string; total: number }>;
  issues: IssueResponse[];
};

export type CommentResponse = {
  id: number;
  issue_id: number;
  change_type: string;
  message: string;
  actor_id: string;
  created_at: string;
};

export type IssueHistoryEntry = {
  id: number;
  issue_id: number;
  change_type: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  comment?: string;
  actor_id?: string;
  created_at?: string;
};

export type IssueHistoryResponse = {
  issue_id: number;
  history: IssueHistoryEntry[];
};

export type Role = 'admin' | 'team_lead' | 'developer';

export type Permissions = {
  canManageUsers: boolean;
  canManageProjectAccess: boolean;
  canViewAllProjects: boolean;
  canAssignIssues: boolean;
  canVerifyIssues: boolean;
  canUpdateAssignedIssues: boolean;
};

export type ProjectAccessAssignment = {
  id: number;
  userId: string;
  scopeType: 'project' | 'project_group';
  scopeId: string;
  scopeName?: string;
  assignedBy?: string;
  createdAt: string;
};

export type UserAccess = {
  userId: string;
  assignments: ProjectAccessAssignment[];
};

export type AccessChange = {
  id: number;
  actorId: string;
  targetUserId: string;
  changeType: 'role_changed' | 'scope_granted' | 'scope_revoked';
  beforeValue?: string;
  afterValue?: string;
  changedAt: string;
};

export type CurrentUser = {
  id: string;
  username: string;
  role: Role;
  permissions: Permissions;
};
