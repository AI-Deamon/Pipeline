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

  test('shows warning icon for WARN status', () => {
    render(
      <ToolsTable
        tools={[baseTool]}
        stages={makeStages({ zap_scan: 'WARN' })}
      />
    );
    // Check for the warning icon (!)
    expect(screen.getByText('!')).toBeInTheDocument();
  });

  test('shows warning icon for UNSTABLE status', () => {
    render(
      <ToolsTable
        tools={[baseTool]}
        stages={makeStages({ zap_scan: 'UNSTABLE' })}
      />
    );
    expect(screen.getByText('!')).toBeInTheDocument();
  });

  test('shows pass icon for PASS status', () => {
    render(
      <ToolsTable
        tools={[baseTool]}
        stages={makeStages({ zap_scan: 'PASS' })}
      />
    );
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  test('shows fail icon for FAIL status', () => {
    render(
      <ToolsTable
        tools={[baseTool]}
        stages={makeStages({ zap_scan: 'FAIL' })}
      />
    );
    expect(screen.getByText('✗')).toBeInTheDocument();
  });

  test('shows skipped icon when stage not present', () => {
    render(
      <ToolsTable
        tools={[baseTool]}
        stages={makeStages({ other_stage: 'PASS' })}
      />
    );
    expect(screen.getByText('–')).toBeInTheDocument();
  });
});
