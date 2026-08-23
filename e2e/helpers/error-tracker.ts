/**
 * Error Tracker — Logs E2E test failures to CSV and Markdown files.
 *
 * Each failure record includes:
 *   - timestamp (ISO 8601)
 *   - test suite name
 *   - workflow step description
 *   - error message
 *   - page URL at time of failure
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, '..', 'test-results');

interface ErrorRecord {
  timestamp: string;
  suite: string;
  step: string;
  error: string;
  url: string;
}

const records: ErrorRecord[] = [];

export function trackError(suite: string, step: string, error: unknown, url = ''): void {
  const record: ErrorRecord = {
    timestamp: new Date().toISOString(),
    suite,
    step,
    error: error instanceof Error ? error.message : String(error),
    url,
  };
  records.push(record);
  // Write immediately so partial runs still produce output
  flush();
}

function ensureDir(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function flush(): void {
  ensureDir();
  writeCSV();
  writeMarkdown();
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function writeCSV(): void {
  const csvPath = path.join(OUTPUT_DIR, 'e2e-error-log.csv');
  const header = 'Timestamp,Suite,Step,Error,URL';
  const rows = records.map(
    (r) =>
      [r.timestamp, r.suite, r.step, r.error, r.url]
        .map(escapeCSV)
        .join(','),
  );
  fs.writeFileSync(csvPath, [header, ...rows].join('\n'), 'utf-8');
}

function writeMarkdown(): void {
  const mdPath = path.join(OUTPUT_DIR, 'e2e-error-log.md');
  const lines: string[] = [
    '# E2E Test Error Log',
    '',
    `> Generated: ${new Date().toISOString()}`,
    '',
    '| # | Timestamp | Suite | Step | Error | URL |',
    '|---|-----------|-------|------|-------|-----|',
  ];
  records.forEach((r, idx) => {
    const safeError = r.error.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(
      `| ${idx + 1} | ${r.timestamp} | ${r.suite} | ${r.step} | ${safeError} | ${r.url} |`,
    );
  });
  if (records.length === 0) {
    lines.push('| — | — | — | — | All tests passed ✅ | — |');
  }
  lines.push('');
  fs.writeFileSync(mdPath, lines.join('\n'), 'utf-8');
}

/** Call at end of global teardown to ensure final flush. */
export function finalizeErrorLog(): void {
  flush();
}

export function getErrorCount(): number {
  return records.length;
}
