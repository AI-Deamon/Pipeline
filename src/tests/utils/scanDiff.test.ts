import { test, expect } from 'vitest';
import { diffFindings, findingKey } from '../../utils/scanDiff';
import type { Finding } from '../../types';

const f = (id: string, tool: string, title = id): Finding & { tool: string } => ({ id, tool, title, severity: 'High' });

test('findingKey combines tool and id', () => {
  expect(findingKey(f('A1', 'zap'))).toBe('zap:A1');
});

test('findingKey falls back to "unknown" when tool is missing', () => {
  expect(findingKey({ id: 'A1', title: 'x', severity: 'High' })).toBe('unknown:A1');
});

test('diffFindings buckets resolved/persisting/introduced correctly', () => {
  const previous = [f('A1', 'zap'), f('B1', 'sonar')];
  const current = [f('B1', 'sonar'), f('C1', 'trivy')];
  const result = diffFindings(previous, current);
  expect(result.resolved.map((x) => x.id)).toEqual(['A1']);
  expect(result.persisting.map((x) => x.id)).toEqual(['B1']);
  expect(result.introduced.map((x) => x.id)).toEqual(['C1']);
});

test('diffFindings returns empty buckets for two empty scans', () => {
  const result = diffFindings([], []);
  expect(result.resolved).toEqual([]);
  expect(result.persisting).toEqual([]);
  expect(result.introduced).toEqual([]);
});

test('diffFindings treats same id under different tools as distinct findings', () => {
  const previous = [f('A1', 'zap')];
  const current = [f('A1', 'sonar')];
  const result = diffFindings(previous, current);
  expect(result.resolved.map((x) => x.id)).toEqual(['A1']);
  expect(result.introduced.map((x) => x.id)).toEqual(['A1']);
  expect(result.persisting).toEqual([]);
});
