import { render, screen } from '@testing-library/react';
import FilterBar from '../../components/FilterBar';
describe('FilterBar', () => {
  test('renders without crashing', () => {
    render(
      <FilterBar
        search=""
        onSearchChange={() => {}}
        selectedSeverities={[]}
        onSeverityChange={() => {}}
        selectedTools={[]}
        onToolChange={() => {}}
        availableTools={['trivy_fs', 'trivy_image', 'zap']}
      />
    );
    expect(screen.getByPlaceholderText('Search findings...')).toBeInTheDocument();
  });
});
