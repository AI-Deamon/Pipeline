import { render, screen } from '@testing-library/react';
import TableOfContents from '../../components/TableOfContents';
describe('TableOfContents', () => {
  test('renders without crashing', () => {
    render(
      <TableOfContents
        sections={['Summary', 'Findings', 'Trends']}
        currentSection="Summary"
        onSectionClick={() => {}}
      />
    );
    expect(screen.getByText('Table of Contents')).toBeInTheDocument();
  });
});
