import React from 'react';
import { X } from 'lucide-react';
import type { Finding } from '../types';
interface FindingDetailModalProps {
  finding: Finding | null;
  onClose: () => void;
}
const FindingDetailModal: React.FC<FindingDetailModalProps> = ({ finding, onClose }) => {
  if (!finding) return null;
  const severityColors: Record<string, string> = {
    Critical: 'bg-red-100 text-red-700',
    High: 'bg-orange-100 text-orange-700',
    Medium: 'bg-yellow-100 text-yellow-700',
    Low: 'bg-blue-100 text-blue-700',
    Info: 'bg-slate-100 text-slate-700',
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Finding Details</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        {/* Severity Badge */}
        <div className="mb-4">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${severityColors[finding.severity] || severityColors.Info}`}>
            {finding.severity}
          </span>
        </div>
        {/* Title */}
        <h3 className="text-lg font-medium text-slate-900 mb-2">{finding.title}</h3>
        {/* Details */}
        <dl className="space-y-3">
          <div>
            <dt className="text-sm font-medium text-slate-500">ID</dt>
            <dd className="text-sm text-slate-900">{finding.id}</dd>
          </div>

          {finding.description && (
            <div>
              <dt className="text-sm font-medium text-slate-500">Description</dt>
              <dd className="text-sm text-slate-900">{finding.description}</dd>
            </div>
          )}

          {finding.cve && (
            <div>
              <dt className="text-sm font-medium text-slate-500">CVE</dt>
              <dd className="text-sm text-slate-900">{finding.cve}</dd>
            </div>
          )}

          {finding.host && (
            <div>
              <dt className="text-sm font-medium text-slate-500">Host</dt>
              <dd className="text-sm text-slate-900">{finding.host}</dd>
            </div>
          )}

          {finding.port && (
            <div>
              <dt className="text-sm font-medium text-slate-500">Port</dt>
              <dd className="text-sm text-slate-900">{finding.port}</dd>
            </div>
          )}

          {finding.package && (
            <div>
              <dt className="text-sm font-medium text-slate-500">Package</dt>
              <dd className="text-sm text-slate-900">{finding.package}</dd>
            </div>
          )}

          {finding.tool && (
            <div>
              <dt className="text-sm font-medium text-slate-500">Tool</dt>
              <dd className="text-sm text-slate-900">{finding.tool}</dd>
            </div>
          )}

          {finding.recommendation && (
            <div>
              <dt className="text-sm font-medium text-slate-500">Recommendation</dt>
              <dd className="text-sm text-slate-900">{finding.recommendation}</dd>
            </div>
          )}
        </dl>
        {/* Raw Evidence */}
        {finding.raw_evidence && (
          <div className="mt-4">
            <dt className="text-sm font-medium text-slate-500 mb-2">Raw Evidence</dt>
            <pre className="text-xs bg-slate-50 p-3 rounded-lg overflow-x-auto">
              {finding.raw_evidence}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
export default FindingDetailModal;
