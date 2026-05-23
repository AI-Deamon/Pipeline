# Frontend Application

React + TypeScript single-page application for managing DevSecOps security scans.

## Tech Stack
- **React 19** with TypeScript
- **Vite 7** for building
- **TailwindCSS 4** for styling
- **React Router 7** for routing
- **TanStack Query 5** for server state management
- **Axios** for HTTP requests
- **Lucide React** for icons

## Entry Point
- **`main.tsx`** - React DOM rendering, app mounting
- **`App.tsx`** - Router configuration, route definitions

## Structure
```
src/
├── components/    # Reusable UI components
├── pages/         # Page-level (route) components
├── services/      # API client, notification service
├── hooks/         # Custom React hooks
├── utils/         # Utility functions
├── test/          # Frontend test files
├── assets/        # Static assets (images, icons)
└── types.ts       # TypeScript type definitions
```

## Routes
| Path | Page | Description |
|------|------|-------------|
| `/` | Dashboard | Project overview |
| `/projects/:id` | Project Details | Project info and actions |
| `/projects/:id/manual` | Manual Scan | Select and run scan stages |
| `/projects/:id/history` | Scan History | Project's scan history |
| `/scans/:id` | Scan Status | Real-time scan progress |
| `/settings` | Settings | User and API key settings |
| `/login` | Login | Authentication |
| `/register` | Register | User registration |

## How It Connects
- Makes REST calls to backend at `/api/v1/*`
- WebSocket connection for real-time scan updates
- Browser notifications for scan completion
- Stores API key in localStorage for service operations
