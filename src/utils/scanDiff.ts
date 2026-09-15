import type { Finding } from '../types';

export interface ScanDiffResult {
  resolved: Finding[]; // in previous, not in current
  persisting: Finding[]; // in both
  introduced: Finding[]; // in current, not in previous
}

export function findingKey(f: Finding): string {
  return `${f.tool ?? 'unknown'}:${f.id}`;
}

export function diffFindings(previous: Finding[], current: Finding[]): ScanDiffResult {
  const previousKeys = new Set(previous.map(findingKey));
  const currentKeys = new Set(current.map(findingKey));

  return {
    resolved: previous.filter((f) => !currentKeys.has(findingKey(f))),
    persisting: current.filter((f) => previousKeys.has(findingKey(f))),
    introduced: current.filter((f) => !previousKeys.has(findingKey(f))),
  };
}
