import type { ReactNode } from 'react';
import { diffFindings } from '../../utils/scanDiff';
import { getSeverityColor } from '../../utils/risk';
import type { Finding } from '../../types';
import { CheckCircle2, AlertTriangle, Plus } from 'lucide-react';

interface ScanComparisonViewProps {
  previous: Finding[];
  current: Finding[];
}

const Section = ({
  title,
  icon,
  items,
  tone,
  testId,
}: {
  title: string;
  icon: ReactNode;
  items: Finding[];
  tone: string;
  testId: string;
}) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-6" data-testid={testId}>
    <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${tone}`}>
      {icon} {title} <span className="tabular-nums">({items.length})</span>
    </h3>
    {items.length === 0 ? (
      <p className="text-sm text-slate-500">None.</p>
    ) : (
      <ul className="space-y-2">
        {items.map((f) => (
          <li key={f.id} className="flex items-center gap-2 text-sm">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(f.severity)}`}>{f.severity}</span>
            <span className="text-slate-900 truncate">{f.title}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export const ScanComparisonView = ({ previous, current }: ScanComparisonViewProps) => {
  const { resolved, persisting, introduced } = diffFindings(previous, current);
  return (
    <div>
      {/* Prominent counts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Resolved', value: resolved.length, text: 'text-emerald-600' },
          { label: 'Still open', value: persisting.length, text: 'text-amber-600' },
          { label: 'New', value: introduced.length, text: 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`tabular-nums text-3xl font-semibold ${s.text}`}>{s.value}</div>
            <div className="text-sm text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Section title="Resolved since last scan" icon={<CheckCircle2 className="w-4 h-4" />} items={resolved} tone="text-emerald-700" testId="scan-comparison-resolved" />
        <Section title="Still open" icon={<AlertTriangle className="w-4 h-4" />} items={persisting} tone="text-amber-700" testId="scan-comparison-persisting" />
        <Section title="New this scan" icon={<Plus className="w-4 h-4" />} items={introduced} tone="text-red-700" testId="scan-comparison-introduced" />
      </div>
    </div>
  );
};
