# CONTEXT.md — src/tests/

**Last updated**: 2026-06-10
**Location**: `src/tests/` at repo root
**Layer**: 2 (Distributed)

## 1. Room Definition

**Persona**: Vitest / React Testing Library Engineer
**Objective**: Cover frontend behavior with unit and integration tests. Mock API calls. Verify component rendering, user interactions, and hook logic.

## 2. Token Budget

| Task | Load | Skip |
|------|------|------|
| Write a component test | `src/tests/components/`, target component in `src/components/`, `src/test/setup.ts` | `backend/`, `docker/`, `src/pages/` |
| Write a page test | `src/tests/pages/`, target page in `src/pages/`, `src/test/setup.ts` | `backend/`, `docker/`, `src/components/` |
| Write a hook test | `src/tests/hooks/`, target hook in `src/hooks/`, `src/test/setup.ts` | `backend/`, `docker/`, `src/pages/` |
| Debug a failing test | `src/tests/`, target component/page/hook, `src/test/setup.ts` | `backend/`, `docker/` |
| Add test utilities | `src/test/setup.ts`, `src/tests/` | `backend/`, `docker/`, `src/services/` |

## 3. Local Map

```
src/tests/
├── components/              # Component unit tests
│   ├── FilterBar.test.tsx
│   ├── FindingDetailModal.test.tsx
│   ├── IssueCard.test.tsx
│   ├── IssueDetailModal.test.tsx
│   ├── IssueFilterBar.test.tsx
│   ├── IssueTypeToggle.test.tsx
│   ├── ProtectedRoute.test.tsx
│   ├── SeverityPieChart.test.tsx
│   ├── TableOfContents.test.tsx
│   ├── ToolBarChart.test.tsx
│   ├── ToolCard.test.tsx
│   ├── ToolsTable.test.tsx
│   └── TrendLineChart.test.tsx
├── hooks/                   # Hook unit tests
│   └── useIssues.test.tsx
├── pages/                   # Page integration tests
│   ├── MyIssuesPage.test.tsx
│   ├── ProjectOverviewPage.test.tsx
│   ├── ToolDetailViewPage.test.tsx
│   ├── UnifiedReportPage.test.tsx
│   └── UserManagementPage.test.tsx
└── setup.ts (via src/test/) # Vitest + jsdom setup
```

**Convention**: Test file mirrors the component/page/hook name with `.test.tsx` suffix.

## 4. The Process

1. **Source** — read the component/page/hook under test + `src/test/setup.ts` for available utilities
2. **Plan** — list mocks (API calls, router, auth context), list user interactions to verify
3. **Execute** — write `<Name>.test.tsx`, use `@testing-library/react` for rendering, `vi.mock()` for API calls
4. **Refine** — `npx vitest run src/tests/<area>/<Name>.test.tsx`; full suite `npx vitest run`; verify no console errors

## 5. What Good Looks Like

- Every component has at least one render test + one interaction test. All API calls mocked via `vi.mock()`.
- Tests use `screen.getByRole()` / `getByTestId()` for queries. No `document.querySelector()`.
- Async operations use `waitFor()` or `findBy*()` queries. No `setTimeout()` hacks.
- Hook tests use `renderHook()` from `@testing-library/react`. State changes verified via `act()`.

## 6. Constraints

- **jsdom environment**: Vitest runs in jsdom, not a real browser. No CSS, no real layout. Test behavior, not pixels.
- **API mocking**: All `src/services/api.ts` calls must be mocked. Never let tests hit the real backend.
- **Auth context**: Pages requiring auth must wrap in `<AuthProvider>` mock or use `vi.mock('./useAuth')`.
- **Router**: Pages with routing must wrap in `<MemoryRouter>` or mock `react-router-dom`.
- **TanStack Query**: Components using `useQuery` must wrap in `<QueryClientProvider>` with a test client.

## 7. Hard Rules

- **Thou shalt NOT let a test hit the real API.** Mock `src/services/api.ts` at the module level. Tests run in CI with no backend.

- **Thou shalt NOT use `document.querySelector()` for queries.** Use Testing Library queries (`getByRole`, `getByText`, `getByTestId`). QuerySelector bypasses accessibility checks.

- **Thou shalt NOT skip `waitFor()` for async operations.** React state updates are async. Without `waitFor()`, tests fail intermittently.

- **Thou shalt NOT leave console errors in passing tests.** Console errors indicate unhandled exceptions or missing mocks. Fix the root cause, don't suppress the error.
