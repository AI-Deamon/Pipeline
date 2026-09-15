import { Link } from 'react-router-dom';

type Variant = 'scan' | 'unified' | 'executive' | 'developer';

interface ReportVariantNavProps {
  projectId: string;
  active: Variant;
  scanId?: string;
}

const VARIANTS: { key: Variant; label: string; href: (projectId: string, scanId?: string) => string }[] = [
  { key: 'scan', label: 'Scan report', href: (p, s) => `/projects/${p}/reports${s ? `?scanId=${s}` : ''}` },
  { key: 'unified', label: 'Unified report', href: (p, s) => `/projects/${p}/reports/unified${s ? `?scanId=${s}` : ''}` },
  { key: 'executive', label: 'Executive summary', href: () => `/dashboard/executive` },
  { key: 'developer', label: 'Developer view', href: (p, s) => `/projects/${p}/reports/${s}/developer` },
];

export const ReportVariantNav = ({ projectId, active, scanId }: ReportVariantNavProps) => (
  <nav className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-4" aria-label="Report variant">
    {VARIANTS.map((v) => {
      // The developer view requires a scanId in its path — without one the
      // link would be a dead route (`/reports//developer` or a literal
      // "undefined" segment). Render it disabled rather than produce a
      // broken href.
      if (v.key === 'developer' && !scanId) {
        return (
          <span
            key={v.key}
            aria-disabled="true"
            title="Select a scan to view the developer report"
            className="px-3 py-1.5 text-xs font-medium rounded-md text-slate-300 cursor-not-allowed"
          >
            {v.label}
          </span>
        );
      }
      return (
        <Link
          key={v.key}
          to={v.href(projectId, scanId)}
          aria-current={active === v.key ? 'page' : undefined}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            active === v.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {v.label}
        </Link>
      );
    })}
  </nav>
);
