/** @jsxImportSource react */
import { render, screen } from '@testing-library/react';
import ToolBarChart from '../../components/ToolBarChart';

describe('ToolBarChart', () => {
  test('renders without crashing', () => {
    const tools = [
      { tool: 'trivy_fs', findings: 23, critical: 1, high: 5, medium: 10, low: 7 },
      { tool: 'zap', findings: 8, critical: 2, high: 3, medium: 2, low: 1 },
    ];
    render(<ToolBarChart tools={tools} />);
    expect(screen.getByText('Tool Comparison')).toBeInTheDocument();
  });
});
