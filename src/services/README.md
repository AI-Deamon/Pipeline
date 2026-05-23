# Services

API clients and external service integrations.

## Services

| Service | Purpose |
|---------|---------|
| `api.ts` | HTTP API client with Axios, typed endpoints |
| `notificationService.ts` | Browser notification management |

## API Client (`api.ts`)
- Axios-based HTTP client
- Typed endpoint methods (scans, projects, auth)
- Automatic API key injection
- Error handling and response transformation
- Base URL configuration from environment

## Notification Service
- Request/permission management
- Show notification with scan info
- Click-to-navigate functionality
- Auto-dismiss after 5 seconds
- Permission state tracking

## Connection to Other Modules
- Used by hooks in `src/hooks/`
- Used by pages for direct API calls
- Configuration from environment variables (`VITE_API_KEY`)
- Types from `src/types.ts`
