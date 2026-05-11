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

// Backend stage IDs (snake_case) - used in API calls
export const FIXED_STAGES = [
  'git_checkout',
  'sonar_scanner',
  'sonar_quality_gate',
  'npm_pip_install',
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
  'sonar_quality_gate': 'Sonar Quality Gate',
  'npm_pip_install': 'NPM / PIP Install',
  'dependency_check': 'Dependency Check',
  'trivy_fs_scan': 'Trivy FS Scan',
  'docker_build': 'Docker Build',
  'docker_push': 'Docker Push',
  'trivy_image_scan': 'Trivy Image Scan',
  'nmap_scan': 'Nmap Scan',
  'zap_scan': 'ZAP Scan'
};

export type StageId = typeof FIXED_STAGES[number];

// Helper to convert stage ID to display name
export const getStageDisplayName = (stageId: StageId): string => {
  return STAGE_DISPLAY_NAMES[stageId] || stageId;
};
