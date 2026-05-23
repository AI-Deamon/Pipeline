import { Lightbulb, ExternalLink, BookOpen, Wrench } from 'lucide-react';

interface ErrorSuggestion {
  title: string;
  description: string;
  action?: {
    label: string;
    url?: string;
    onClick?: () => void;
  };
}

interface ErrorSuggestionsProps {
  errorType?: string;
  errorMessage?: string;
  stage?: string;
}

const ERROR_SUGGESTIONS: Record<string, ErrorSuggestion[]> = {
  PIPELINE_ERROR: [
    {
      title: 'Pipeline Syntax Error',
      description: 'The Jenkinsfile has syntax errors. Common causes: unescaped dollar signs ($), invalid Groovy syntax, or missing quotes.',
      action: {
        label: 'View Jenkinsfile Guide',
        url: 'https://www.jenkins.io/doc/book/pipeline/syntax/',
      },
    },
    {
      title: 'Check Agent Repository',
      description: 'The Jenkinsfile is fetched from the Agent repo. Make sure it has proper syntax and is committed.',
    },
  ],
  GIT_ERROR: [
    {
      title: 'Git Repository Access Issue',
      description: 'Unable to clone the repository. Verify credentials and repository URL are correct.',
      action: {
        label: 'Check Git Credentials',
        url: '/settings',
      },
    },
    {
      title: 'Invalid Branch',
      description: 'The specified branch may not exist in the repository. Verify the branch name in project settings.',
    },
  ],
  SONAR_ERROR: [
    {
      title: 'SonarQube Connection Failed',
      description: 'Unable to connect to SonarQube server. Check that SonarQube is running and accessible.',
    },
    {
      title: 'Invalid Sonar Project Key',
      description: 'The Sonar project key may be incorrect. Verify it in SonarQube dashboard.',
    },
  ],
  TRIVY_ERROR: [
    {
      title: 'Trivy Scan Failed',
      description: 'Vulnerability scanner encountered an error. May be due to missing tools or permissions.',
      action: {
        label: 'Trivy Documentation',
        url: 'https://aquasecurity.github.io/trivy/',
      },
    },
  ],
  DOCKER_ERROR: [
    {
      title: 'Docker Build Failed',
      description: 'Image build failed. Check Dockerfile syntax, base image availability, and Docker daemon is running.',
    },
  ],
  NMAP_ERROR: [
    {
      title: 'Nmap Scan Failed',
      description: 'Network scan failed. Verify target IP is accessible and reachable.',
    },
  ],
  ZAP_ERROR: [
    {
      title: 'ZAP Scan Failed',
      description: 'OWASP ZAP scan failed. Check that target URL is accessible and running.',
    },
  ],
  DEPENDENCY_CHECK_ERROR: [
    {
      title: 'Dependency Check Failed',
      description: 'OWASP Dependency-Check could not run. Verify dependencies are present in the project.',
    },
  ],
  TIMEOUT: [
    {
      title: 'Scan Timeout',
      description: 'The scan took too long and was terminated. Consider reducing selected stages or increasing timeout.',
    },
  ],
  SECURITY_ISSUE: [
    {
      title: 'Security Vulnerabilities Found',
      description: 'Critical or high vulnerabilities were detected. Review results and fix the issues.',
    },
  ],
  USER_CANCELLED: [
    {
      title: 'Scan Cancelled by User',
      description: 'The scan was manually stopped. You can start a new scan from the project page.',
    },
  ],
  NETWORK_ERROR: [
    {
      title: 'Network Connectivity Issue',
      description: 'Unable to reach external services. Check firewall rules and network configuration.',
    },
  ],
  PERMISSION_DENIED: [
    {
      title: 'Permission Denied',
      description: 'Insufficient permissions. Verify Jenkins credentials have required access.',
    },
  ],
};

const GENERIC_SUGGESTIONS: ErrorSuggestion[] = [
  {
    title: 'Check Jenkins Console Logs',
    description: 'The detailed error reason is in Jenkins. Click "View Logs" to see the full error.',
  },
  {
    title: 'Review Project Configuration',
    description: 'Verify Git URL, branch name, and target settings are correct in project edit page.',
    action: {
      label: 'Edit Project',
      url: '/projects',
    },
  },
  {
    title: 'Retry the Scan',
    description: 'Some errors are transient. Try resetting and running the scan again.',
  },
];

function analyzeErrorMessage(message?: string): string[] {
  if (!message) return [];
  const lower = message.toLowerCase();
  const matches: string[] = [];
  
  if (lower.includes('dollar') || lower.includes('$') || lower.includes('groovy')) {
    matches.push('PIPELINE_ERROR');
  }
  if (lower.includes('git') || lower.includes('clone') || lower.includes('repository')) {
    matches.push('GIT_ERROR');
  }
  if (lower.includes('sonarqube') || lower.includes('sonar')) {
    matches.push('SONAR_ERROR');
  }
  if (lower.includes('trivy')) {
    matches.push('TRIVY_ERROR');
  }
  if (lower.includes('docker') || lower.includes('build')) {
    matches.push('DOCKER_ERROR');
  }
  if (lower.includes('nmap')) {
    matches.push('NMAP_ERROR');
  }
  if (lower.includes('zap')) {
    matches.push('ZAP_ERROR');
  }
  if (lower.includes('dependency') || lower.includes('owasp')) {
    matches.push('DEPENDENCY_CHECK_ERROR');
  }
  if (lower.includes('timeout')) {
    matches.push('TIMEOUT');
  }
  if (lower.includes('permission') || lower.includes('denied') || lower.includes('unauthorized')) {
    matches.push('PERMISSION_DENIED');
  }
  if (lower.includes('network') || lower.includes('connection') || lower.includes('connection refused')) {
    matches.push('NETWORK_ERROR');
  }
  
  return matches;
}

function getErrorSuggestions(errorType?: string, errorMessage?: string, stage?: string): ErrorSuggestion[] {
  // First try direct error type match
  if (errorType) {
    const suggestions = ERROR_SUGGESTIONS[errorType.toUpperCase()];
    if (suggestions) {
      return suggestions;
    }
  }
  
  // Try to match by keywords in error message
  if (errorMessage) {
    const matchedTypes = analyzeErrorMessage(errorMessage);
    for (const type of matchedTypes) {
      const suggestions = ERROR_SUGGESTIONS[type];
      if (suggestions) {
        return suggestions;
      }
    }
  }
  
  // Try to match by stage
  if (stage) {
    const stageKey = stage.toUpperCase().replace(/-/g, '_') + '_ERROR';
    const stageSuggestions = ERROR_SUGGESTIONS[stageKey];
    if (stageSuggestions) {
      return stageSuggestions;
    }
  }
  
  return GENERIC_SUGGESTIONS;
}

export function ErrorSuggestions({ errorType, errorMessage, stage }: ErrorSuggestionsProps) {
  const suggestions = getErrorSuggestions(errorType, errorMessage, stage);

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mt-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
          <Lightbulb className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-amber-900">What Happened & How to Fix</h3>
          <p className="text-xs text-amber-700">Suggested actions based on the error</p>
        </div>
      </div>
      
      <div className="space-y-3">
        {suggestions.map((suggestion, index) => (
          <div key={index} className="bg-white rounded-lg p-4 border border-amber-100">
            <div className="flex items-start gap-3">
              <Wrench className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-900 mb-1">
                  {suggestion.title}
                </div>
                <div className="text-sm text-slate-600 mb-3">
                  {suggestion.description}
                </div>
                {suggestion.action && (
                  <button
                    onClick={() => {
                      if (suggestion.action?.url) {
                        if (suggestion.action.url.startsWith('/')) {
                          window.location.href = suggestion.action.url;
                        } else {
                          window.open(suggestion.action.url, '_blank');
                        }
                      } else if (suggestion.action?.onClick) {
                        suggestion.action.onClick();
                      }
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 font-medium"
                  >
                    {suggestion.action.label}
                    {suggestion.action.url && <ExternalLink className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-amber-200">
        <a
          href="/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs text-amber-600 hover:text-amber-700"
        >
          <BookOpen className="w-3 h-3" />
          View Documentation for More Help
        </a>
      </div>
    </div>
  );
}