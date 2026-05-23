import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/Toast.tsx'

/**
 * Application Root Entry Point
 *
 * Provider Nesting Order (innermost to outermost):
 * ┌─────────────────────────────────────────────────┐
 * │ StrictMode (React)                              │
 * │ - Enables development checks and warnings       │
 * │ - Wraps entire app for strict behavior          │
 * └─────────────────────────────────────────────────┘
 *   ┌─────────────────────────────────────────────┐
 *   │ ToastProvider (Custom)                      │
 *   │ - Manages toast notification state          │
 *   │ - Provides toast context to all children    │
 *   │ - Must wrap App to catch all notifications  │
 *   └─────────────────────────────────────────────┘
 *     ┌─────────────────────────────────────────┐
 *     │ App (React Router + QueryClient)        │
 *     │ - Contains QueryClientProvider          │
 *     │ - Contains RouterProvider               │
 *     │ - Core application logic                │
 *     └─────────────────────────────────────────┘
 *
 * Note: QueryClientProvider and RouterProvider are
 * defined inside App.tsx. The nesting order ensures:
 * 1. StrictMode catches all React violations
 * 2. ToastProvider can display toasts from any component
 * 3. App has access to both React Query and Router
 */

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
