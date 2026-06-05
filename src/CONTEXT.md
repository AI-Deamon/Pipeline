# CONTEXT.md — src/

**Last updated**: 2026-06-05
**Location**: `src/` at repo root
**Layer**: 2 (Distributed)
**Authoritative**: This file. No other context file.

## 1. ROOM DEFINITION

**Persona**: React 19 / TypeScript Engineer.
**Objective**: Ship pages, components, hooks, and the API client. Touch only this folder unless contracts cross the boundary.

## 2. LOCAL TOKEN BUDGET

| Task | Load | Skip |
|------|------|------|
| Add a page | `src/pages/`, `src/components/`, `src/types.ts`, `src/main.tsx` | `backend/app/api/`, `docker/jenkins/` |
| Build a reusable component | `src/components/`, `src/hooks/`, `src/utils/` | `src/pages/`, `backend/` |
| Add a service / API client | `src/services/`, `src/types.ts`, `vite.config.ts` | `src/pages/`, `backend/app/core/` |
| Write a Vitest case | `src/tests/`, `src/test/setup.ts` | `backend/`, `docker/` |
| Fix a UI bug | `src/pages/`, `src/components/`, `src/hooks/` | `backend/app/api/auth.py` |
| Shared types | `src/types.ts` | — |

## 3. LOCAL MAP

```
src/
├── App.tsx                # Root component, route table
├── main.tsx               # Vite entrypoint
├── types.ts               # Shared TypeScript types (centralized)
├── pages/                 # Route components (PascalCase.tsx)
├── components/            # Reusable (camelCase.tsx)
├── hooks/                 # Custom React hooks
├── services/              # API client modules
├── utils/                 # Helpers
├── tests/                 # Vitest + jsdom
└── test/setup.ts          # Vitest setup
```

## 4. THE PROCESS

1. **Source** — read `src/types.ts`, the target page, and the relevant component
2. **Plan** — draft prop types, hook signatures, route registration
3. **Execute** — write the page/component, update `src/services/` if API surface changes
4. **Refine** — `npm run lint && npm run build` (typechecks via `tsc -b`); `npx vitest run`

## 5. WHAT GOOD LOOKS LIKE

- ≤300 lines per component. No `any` type. Passes `tsc -b` with zero errors.
- All visual states present: loading, empty, error, success. TanStack Query for every API call.
- Pages lazy-loaded via React Router. Types centralized in `src/types.ts` (never inlined in pages).

## 6. CONSTRAINTS

- **Imports**: Don't import from `backend/`. Use HTTP via Vite proxy — cross-silo imports break encapsulation.
- **Config**: Don't touch `vite.config.ts` casually. `/api` → `http://localhost:8000` with WebSocket passthrough is a contract.
- **Auth**: Don't call `auth/login` from scan pages. Auth is a stable surface; scan pages use the API client.
- **Typecheck**: Don't run `npm run typecheck`. Typechecking happens via `npm run build` (`tsc -b`). Use `npx tsc -b` for standalone.

## 7. MANDATORY SKILL TRIGGERS

- A page or component exceeds 300 lines → trigger `superdesign` to plan a refactor
- A Vitest case fails → trigger `systematic-debugging` (state hypothesis before editing)
- A UI flow needs browser verification → trigger `webapp-testing` (Playwright)
- A page adds a new API call → trigger `verification-before-completion` (lint + build + vitest)
- Two pages share the same component logic → trigger `dispatching-parallel-agents` to extract

## 8. HARD RULES

- **Thou shalt NOT bypass the API key lookup order.** `localStorage.getItem('API_KEY')` first, then `import.meta.env.VITE_API_KEY`.
- **Thou shalt NOT inline types in pages.** Shared types live in `src/types.ts`.
- **Thou shalt NOT skip `tsc -b` errors.** The build runs typecheck; treat red as broken.
