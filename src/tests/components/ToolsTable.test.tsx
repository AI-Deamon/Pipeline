import { render, screen } from '@testing-library/react';
import { ToolsTable } from '../../components/reports/ToolsTable';
import type { ToolSummary, ScanStage } from '../../types';

describe('ToolsTable getToolStatus', () => {
  const makeStages = (statuses: Record<string, string>): ScanStage[] =>
    Object.entries(statuses).map(([stage, status]) => ({ stage, status }));

  const baseTool: ToolSummary = {
    tool: 'zap_scan',
    findings: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  test('shows Warning badge for WARN status', () => {
    render(
      <ToolsTable
        tools={[baseTool]}
        reports={[]}
        stages={makeStages({ zap_scan: 'WARN' })}
      />
    );
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  test('shows Warning badge for UNSTABLE status', () => {
    render(
      <ToolsTable
        tools={[baseTool]}
        reports={[]}
        stages={makeStages({ zap_scan: 'UNSTABLE' })}
      />
    );
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  test('shows Pass badge for PASS status', () => {
    render(
      <ToolsTable
        tools={[baseTool]}
        reports={[]}
        stages={makeStages({ zap_scan: 'PASS' })}
      />
    );
    expect(screen.getByText('Pass')).toBeInTheDocument();
  });

  test('shows Fail badge for FAIL status', () => {
    render(
      <ToolsTable
        tools={[baseTool]}
        reports={[]}
        stages={makeStages({ zap_scan: 'FAIL' })}
      />
    );
    expect(screen.getByText('Fail')).toBeInTheDocument();
  });

  test('shows Skipped badge when stage not present', () => {
    render(
      <ToolsTable
        tools={[baseTool]}
        reports={[]}
        stages={makeStages({ other_stage: 'PASS' })}
      />
    );
    expect(screen.getByText('Skipped')).toBeInTheDocument();
  });
});
