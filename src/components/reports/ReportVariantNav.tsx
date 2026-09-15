import { Link } from 'react-router-dom';

type Variant = 'scan' | 'unified' | 'executive' | 'developer';

interface ReportVariantNavProps {
  projectId: string;
  active: Variant;
  scanId?: string;
}

const VARIANTS: { key: Variant; label: string; href: (projectId: string, scanId?: string) => string }[] = [
  { key: 'scan', label: 'Scan report', href: (p) => `/projects/${p}/reports` },
  { key: 'unified', label: 'Unified report', href: (p) => `/projects/${p}/reports/unified` },
  { key: 'executive', label: 'Executive summary', href: () => `/dashboard/executive` },
  { key: 'developer', label: 'Developer view', href: (p, s) => `/projects/${p}/reports/${s}/developer` },
];

export const ReportVariantNav = ({ projectId, active, scanId }: ReportVariantNavProps) => (
  <nav className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-4" aria-label="Report variant">
    {VARIANTS.map((v) => (
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
    ))}
  </nav>
);
