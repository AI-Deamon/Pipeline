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
