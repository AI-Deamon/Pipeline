import { ExternalLink, Clock, Shield, Package, Zap } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { ApiError } from '../../utils/apiError';
import type { DeveloperIssue } from '../../types';
import CodeSnippet from '../CodeSnippet';

const severityColors: Record<string, { text: string; bg: string; border: string }> = {
  Critical: { text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-500' },
  High: { text: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-500' },
  Medium: { text: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-500' },
  Low: { text: 'text-green-600', bg: 'bg-green-50', border: 'border-green-500' },
  Info: { text: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-500' },
};

const typeLabels: Record<string, string> = {
  VULNERABILITY: 'Security Vulnerability',
  BUG: 'Reliability Issue',
  CODE_SMELL: 'Maintainability Issue',
  SECURITY_HOTSPOT: 'Security Hotspot',
};

interface IssueDetailPanelProps {
  issue: DeveloperIssue;
  projectId: string;
  sonarUrl?: string;
}

export const IssueDetailPanel = ({ issue, projectId, sonarUrl }: IssueDetailPanelProps) => {
  const colors = severityColors[issue.severity] || severityColors.Info;
  const typeLabel = typeLabels[issue.type || ''] || issue.type || 'Unknown';

  // Same gap as IssueDetailModal previously had (see its comment above its
  // own useQuery): the finding's own `code_snippet` field is populated by
  // ~none of the tool parsers, so fetch real surrounding source from the
  // project's repo instead. This panel never fetched a snippet at all.
  const {
    data: fetchedSnippet,
    isLoading: isSnippetLoading,
    error: snippetError,
  } = useQuery({
    queryKey: ['issue', issue.id, 'code-snippet', projectId, issue.file_path, issue.line],
    queryFn: () =>
      api.issues.getCodeSnippet(projectId, {
        file: issue.file_path!,
        line: issue.line!,
      }),
    enabled: !!projectId && !!issue.file_path && !!issue.line,
    staleTime: 5 * 60_000,
    retry: false,
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className={`p-4 border-l-4 ${colors.border}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 text-xs font-semibold rounded ${colors.bg} ${colors.text}`}>
                {issue.severity}
              </span>
              <span className="text-xs text-slate-500">{typeLabel}</span>
              {issue.cvss_score && issue.cvss_score > 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-50 text-purple-600">
                  CVSS: {issue.cvss_score}
                </span>
              )}
            </div>
            <h3 className="font-medium text-slate-900">{issue.message}</h3>
          </div>
          {sonarUrl && (
            <a
              href={sonarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <ExternalLink className="w-3 h-3" />
              SonarQube
            </a>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex flex-wrap gap-4 text-sm">
          {issue.rule && (
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Rule:</span>
              <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{issue.rule}</span>
            </div>
          )}
          {issue.line && (
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Line:</span>
              <span className="font-semibold text-slate-900">{issue.line}</span>
            </div>
          )}
          {issue.effort && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span className="text-slate-500">Effort:</span>
              <span className="text-slate-900">{issue.effort}</span>
            </div>
          )}
        </div>
      </div>

      {/* Code Snippet */}
      {issue.file_path && issue.line && (
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Code</h4>
          <CodeSnippet
            snippet={fetchedSnippet?.content ?? null}
            language={fetchedSnippet?.language}
            highlightLine={issue.line}
            startLine={fetchedSnippet?.start_line ?? Math.max(1, issue.line - 10)}
            file={issue.file_path}
            gitUrl={fetchedSnippet?.git_url}
            isLoading={isSnippetLoading}
            error={
              snippetError instanceof ApiError && snippetError.status !== 404
                ? snippetError.message
                : null
            }
          />
        </div>
      )}

      {/* Package Info (for Trivy/SCA findings) */}
      {issue.package_version && (
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1">
            <Package className="w-3 h-3" />
            Package Information
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-slate-500">Installed:</span>
              <span className="ml-1 font-mono text-slate-900">{issue.package_version}</span>
            </div>
            {issue.fixed_version && (
              <div>
                <span className="text-slate-500">Fixed in:</span>
                <span className="ml-1 font-mono text-green-600 font-semibold">{issue.fixed_version}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fix Command */}
      {issue.fix_command && (
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Fix Command
          </h4>
          <div className="bg-slate-900 text-green-400 font-mono text-sm p-3 rounded-lg">
            {issue.fix_command}
          </div>
        </div>
      )}

      {/* Description */}
      {issue.description && (
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-1">Description</h4>
          <p className="text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(issue.description) }} />
        </div>
      )}

      {/* Recommendation */}
      {issue.recommendation && (
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-1">How to Fix</h4>
          <p className="text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(issue.recommendation) }} />
        </div>
      )}

      {/* CWE IDs */}
      {issue.cwe_ids && issue.cwe_ids.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            CWE IDs
          </h4>
          <div className="flex flex-wrap gap-1">
            {issue.cwe_ids.map((cwe) => (
              <span
                key={cwe}
                className="px-2 py-0.5 text-xs font-mono bg-slate-100 text-slate-700 rounded"
              >
                {cwe}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* References */}
      {issue.references && issue.references.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">References</h4>
          <div className="space-y-1">
            {issue.references.slice(0, 5).map((ref, idx) => (
              <a
                key={idx}
                href={ref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 truncate"
              >
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{ref}</span>
              </a>
            ))}
            {issue.references.length > 5 && (
              <span className="text-xs text-slate-500">+{issue.references.length - 5} more references</span>
            )}
          </div>
        </div>
      )}

      {/* Rule name */}
      {issue.rule_name && (
        <div className="px-4 py-3">
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-1">Rule</h4>
          <p className="text-sm text-slate-700">{issue.rule_name}</p>
        </div>
      )}
    </div>
  );
};
