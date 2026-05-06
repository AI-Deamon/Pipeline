import { render, screen } from '@testing-library/react';
import FindingDetailModal from '../../components/FindingDetailModal';
describe('FindingDetailModal', () => {
  test('renders nothing when finding is null', () => {
    render(
      <FindingDetailModal
        finding={null}
        onClose={() => {}}
      />
    );
    expect(screen.queryByText('Finding Details')).not.toBeInTheDocument();
  });
});
