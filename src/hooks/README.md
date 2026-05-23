# Custom Hooks

Reusable React hooks for shared logic.

## Hooks

| Hook | Purpose | Dependencies |
|------|---------|--------------|
| `useAuth.tsx` | Authentication state and login/logout | API client |
| `useDebounce.ts` | Debounce values for search inputs | - |
| `useScanWebSocket.ts` | WebSocket connection management | WebSocket API |
| `useScanReset.ts` | Reset failed scan mutation | API client, TanStack Query |
| `useScanCancel.ts` | Cancel running scan mutation | API client, TanStack Query |
| `useScanStatus.ts` | Scan state management (composite hook) | useScanWebSocket, useScanReset, useScanCancel |

## Hook Design
- **One concern per hook** - Each hook does one thing well
- **camelCase naming** - `useXxx` convention
- **Named exports** - `export function useXxx()`
- **Type-safe** - Proper TypeScript generics/return types

## Composite Hooks
`useScanStatus.ts` is a composite hook that combines:
- Scan data fetching (useQuery)
- WebSocket real-time updates (useScanWebSocket)
- Reset mutation (useScanReset)
- Cancel mutation (useScanCancel)
- UI state management (expanded stages, modals)

## Connection to Other Modules
- Call services from `src/services/api.ts`
- Use types from `src/types.ts`
- Consumed by pages in `src/pages/`
- May use other hooks as building blocks
