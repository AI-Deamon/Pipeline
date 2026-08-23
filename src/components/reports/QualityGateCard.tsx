import { CheckCircle, XCircle } from 'lucide-react';
import type { QualityGateStatus } from '../../types';

interface QualityGateCardProps {
  gate: QualityGateStatus;
}

export const QualityGateCard = ({ gate }: QualityGateCardProps) => {
  const isPassed = gate.status === 'OK';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        {isPassed ? (
          <CheckCircle className="w-5 h-5 text-green-600" />
        ) : (
          <XCircle className="w-5 h-5 text-red-600" />
        )}
        <span className="font-semibold text-slate-900">
          Quality Gate: {isPassed ? 'PASSED' : 'FAILED'}
        </span>
      </div>

      {gate.conditions.length > 0 && (
        <div className="space-y-2">
          {gate.conditions.map((cond) => (
            <div
              key={cond.metric}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-slate-600">{formatMetricName(cond.metric)}</span>
              <div className="flex items-center gap-2">
                <span
                  className={`font-medium ${
                    cond.status === 'OK' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {cond.actual || '-'}
                </span>
                {cond.status === 'OK' ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {gate.conditions.length === 0 && (
        <p className="text-sm text-slate-500">No conditions configured</p>
      )}
    </div>
  );
};

function formatMetricName(metric: string): string {
  const names: Record<string, string> = {
    coverage: 'Coverage',
    duplicated_lines_density: 'Duplications',
    duplicated_lines: 'Duplicated Lines',
    reliability_rating: 'Reliability Rating',
    security_rating: 'Security Rating',
    maintainability_rating: 'Maintainability Rating',
    new_coverage: 'New Code Coverage',
    new_duplicated_lines_density: 'New Code Duplications',
  };
  return names[metric] || metric.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}
