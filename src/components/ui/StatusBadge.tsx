import { CheckCircle, AlertCircle, Loader2, Ban, SkipForward } from 'lucide-react';
import { Badge } from './Badge';

type ScanState = string | null;

interface StatusBadgeProps {
  state: ScanState;
  size?: 'sm' | 'md';
}

const stateConfig: Record<string, { variant: 'success' | 'danger' | 'warning' | 'info' | 'default'; label: string; icon: typeof CheckCircle }> = {
  COMPLETED: { variant: 'success', label: 'Secured', icon: CheckCircle },
  FAILED: { variant: 'danger', label: 'Issues Found', icon: AlertCircle },
  RUNNING: { variant: 'warning', label: 'Scanning', icon: Loader2 },
  CREATED: { variant: 'info', label: 'Pending', icon: Loader2 },
  QUEUED: { variant: 'info', label: 'Queued', icon: Loader2 },
  CANCELLED: { variant: 'default', label: 'Cancelled', icon: Ban },
  SKIPPED: { variant: 'default', label: 'Skipped', icon: SkipForward },
};

export function StatusBadge({ state, size = 'sm' }: StatusBadgeProps) {
  const config = stateConfig[state || ''] || stateConfig.CREATED;
  const isAnimated = state === 'RUNNING' || state === 'CREATED' || state === 'QUEUED';

  return (
    <Badge variant={config.variant} size={size}>
      <config.icon className={`w-3.5 h-3.5 shrink-0 ${isAnimated ? 'animate-spin' : ''}`} />
      {config.label}
    </Badge>
  );
}
