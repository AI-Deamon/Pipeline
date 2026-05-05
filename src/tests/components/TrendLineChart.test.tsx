/** @jsxImportSource react */
import { render, screen } from '@testing-library/react';
import TrendLineChart from '../../components/TrendLineChart';

describe('TrendLineChart', () => {
  test('renders without crashing', () => {
    const data = [
      { date: '2026-05-01', critical: 3, high: 12, medium: 45, low: 89 },
      { date: '2026-05-02', critical: 2, high: 10, medium: 40, low: 85 },
    ];
    render(<TrendLineChart data={data} />);
    expect(screen.getByText('Historical Trend')).toBeInTheDocument();
  });
});
