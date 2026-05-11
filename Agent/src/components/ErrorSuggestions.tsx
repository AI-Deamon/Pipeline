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
  // Jenkins-related errors
  PIPELINE_ERROR: [
    {
      title: 'Pipeline Syntax Error',
      description: 'The Jenkinsfile has syntax errors. Check line numbers in the error message.',
      action: {
        label: 'View Jenkins Syntax Guide',
        url: 'https://www.jenkins.io/doc/book/pipeline/syntax/',
      },
    },
  ],
  GIT_ERROR: [
    {
      title: 'Git Repository Access Issue',
      description: 'Unable to clone the repository. Verify credentials and repository URL.',
      action: {
        label: 'Check Git Credentials',
        url: '/settings/credentials',
      },
    },
    {
      title: 'Invalid Branch',
      description: 'The specified branch may not exist. Verify the branch name.',
    },
  ],
  SONAR_ERROR: [
    {
      title: 'SonarQube Connection Failed',
      description: 'Unable to connect to SonarQube server. Check server configuration.',
      action: {
        label: 'SonarQube Documentation',
        url: 'https://docs.sonarqube.org/',
      },
    },
    {
      title: 'Quality Gate Failed',
      description: 'Code quality metrics did not meet the required thresholds.',
      action: {
        label: 'View Quality Gate Rules',
        url: '/settings/quality-gates',
      },
    },
  ],
  TRIVY_ERROR: [
    {
      title: 'Trivy Scan Failed',
      description: 'Vulnerability scan encountered an error. Check filesystem or image accessibility.',
      action: {
        label: 'Trivy Documentation',
        url: 'https://aquasecurity.github.io/trivy/',
      },
    },
  ],
  DOCKER_ERROR: [
    {
      title: 'Docker Build Failed',
      description: 'Image build failed. Check Dockerfile syntax and base image availability.',
      action: {
        label: 'Docker Best Practices',
        url: 'https://docs.docker.com/develop/develop-images/dockerfile_best-practices/',
      },
    },
  ],
  NMAP_ERROR: [
    {
      title: 'Nmap Scan Failed',
      description: 'Network scan failed. Verify target IP/URL is accessible.',
    },
  ],
  ZAP_ERROR: [
    {
      title: 'ZAP Scan Failed',
      description: 'OWASP ZAP scan encountered an error. Check target URL accessibility.',
      action: {
        label: 'OWASP ZAP Documentation',
        url: 'https://www.zaproxy.org/docs/',
      },
    },
  ],
  TIMEOUT: [
    {
      title: 'Scan Timeout',
      description: 'The scan exceeded the maximum allowed time. Consider increasing timeout or optimizing stages.',
      action: {
        label: 'Configure Timeout',
        onClick: () => console.log('Open timeout settings'),
      },
    },
  ],
  SECURITY_ISSUE: [
    {
      title: 'Security Vulnerabilities Found',
      description: 'Critical or high vulnerabilities detected. Review the scan results and remediate.',
      action: {
        label: 'Security Best Practices',
        url: '/docs/security-best-practices',
      },
    },
  ],
  USER_CANCELLED: [
    {
      title: 'Scan Cancelled by User',
      description: 'The scan was manually cancelled. You can restart the scan at any time.',
    },
  ],
  NETWORK_ERROR: [
    {
      title: 'Network Connectivity Issue',
      description: 'Unable to reach external services. Check network configuration and firewall rules.',
    },
  ],
  PERMISSION_DENIED: [
    {
      title: 'Permission Denied',
      description: 'Insufficient permissions to perform this operation. Contact your administrator.',
    },
  ],
};

const GENERIC_SUGGESTIONS: ErrorSuggestion[] = [
  {
    title: 'Check Jenkins Console Output',
    description: 'View detailed logs in Jenkins to identify the root cause.',
    action: {
      label: 'Open Jenkins Console',
      onClick: () => console.log('Open Jenkins'),
    },
  },
  {
    title: 'Review Configuration',
    description: 'Verify project settings including Git URL, credentials, and target configuration.',
    action: {
      label: 'View Documentation',
      url: '/docs/troubleshooting',
    },
  },
  {
    title: 'Retry the Scan',
    description: 'Some errors are transient. Try running the scan again.',
  },
];

function getErrorSuggestions(errorType?: string, errorMessage?: string, stage?: string): ErrorSuggestion[] {
  if (!errorType) {
    return GENERIC_SUGGESTIONS;
  }

  // Try to find specific suggestions
  const suggestions = ERROR_SUGGESTIONS[errorType.toUpperCase()];
  
  if (suggestions) {
    return suggestions;
  }

  // Try to match by keywords in error message
  if (errorMessage) {
    const lowerMessage = errorMessage.toLowerCase();
    
    if (lowerMessage.includes('timeout')) {
      return ERROR_SUGGESTIONS.TIMEOUT;
    }
    if (lowerMessage.includes('permission') || lowerMessage.includes('unauthorized')) {
      return ERROR_SUGGESTIONS.PERMISSION_DENIED;
    }
    if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
      return ERROR_SUGGESTIONS.NETWORK_ERROR;
    }
    if (lowerMessage.includes('vulnerability') || lowerMessage.includes('security')) {
      return ERROR_SUGGESTIONS.SECURITY_ISSUE;
    }
  }

  // Try to match by stage
  if (stage) {
    const stageKey = `${stage.toUpperCase()}_ERROR`;
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
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-5 h-5 text-blue-600" />
        <h3 className="text-sm font-semibold text-blue-900">Suggested Actions</h3>
      </div>
      
      <div className="space-y-3">
        {suggestions.map((suggestion, index) => (
          <div key={index} className="bg-white rounded-lg p-3 border border-blue-100">
            <div className="flex items-start gap-2">
              <Wrench className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-900 mb-1">
                  {suggestion.title}
                </div>
                <div className="text-sm text-slate-600 mb-2">
                  {suggestion.description}
                </div>
                {suggestion.action && (
                  <button
                    onClick={() => {
                      if (suggestion.action?.url) {
                        window.open(suggestion.action.url, '_blank');
                      } else if (suggestion.action?.onClick) {
                        suggestion.action.onClick();
                      }
                    }}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
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

      <div className="mt-4 pt-4 border-t border-blue-200">
        <a
          href="/docs/troubleshooting"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700"
        >
          <BookOpen className="w-3 h-3" />
          View Complete Troubleshooting Guide
        </a>
      </div>
    </div>
  );
}
