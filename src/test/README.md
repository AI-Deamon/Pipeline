# Frontend Tests

Vitest test suite for the React frontend.

## Test Structure
- Co-located with source files (`src/test/` or alongside components)
- Uses Vitest + React Testing Library
- Mocks API client and external services

## Running Tests
```bash
npx vitest run           # Run all tests
npx vitest run src/pages/LoginPage.test.tsx  # Run single file
npx vitest watch         # Watch mode
```

## Test Patterns
- Mock the API client: `vi.mock('../services/api')`
- Use `render()` from Testing Library
- Query elements with `screen.getBy*` methods
- Wrap components with QueryClientProvider for tests using hooks

## Coverage
- Pages: Critical user flows tested
- Components: Rendering and interaction tests
- Hooks: Logic and state management tests
- Services: API client mock tests
