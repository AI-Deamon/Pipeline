/** @jsxImportSource react */
import { render, screen } from '@testing-library/react';
import SeverityPieChart from '../../components/SeverityPieChart';

describe('SeverityPieChart', () => {
  test('renders without crashing', () => {
    render(
      <SeverityPieChart
        critical={3}
        high={12}
        medium={45}
        low={89}
      />
    );
    expect(screen.getByText('Severity Distribution')).toBeInTheDocument();
  });
});
