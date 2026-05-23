# DevSecOps Platform: System Design & Implementation

## 1. UI Route Map
The application uses `react-router-dom` (v7) for client-side routing.
- `/login`: **LoginPage** - Entry point for user authentication (stub).
- `/dashboard`: **DashboardPage** - Primary workspace showing project list and last scan status.
- `/projects/create`: **CreateProjectPage** - One-time setup for new security projects.
- `/projects/:id`: **ProjectControlPage** - Central hub for a specific project, allowing scan triggering.
- `/projects/:id/manual`: **ManualScanPage** - Advanced selection for specific security stages.
- `/scans/:id`: **ScanStatusPage** - Real-time progress tracker and results viewer.

## 2. Component Hierarchy
The UI follows a structured layout pattern:
- **App**: Root component defining routes.
  - **Layout**: Shared wrapper providing Sidebar navigation and Header.
    - **Sidebar**: Navigation links (Dashboard, Create Project, Logout).
    - **Header**: Contextual title and user profile info.
    - **Outlet**: Content area for child pages.
      - **DashboardPage**: Uses `api.projects.list`.
      - **CreateProjectPage**: Form for project configuration.
      - **ProjectControlPage**: Trigger hub with scan mode cards.
      - **ManualScanPage**: Checkbox-based stage selection.
      - **ScanStatusPage**: Polling-based status tracker.
  - **LoginPage**: Independent page outside the main layout.

## 3. State Management Approach
The application employs a hybrid state management strategy:
- **Persistence Layer**: `localStorage` is used to persist project configurations and scan history across browser sessions. This is managed centrally in `src/services/api.ts`.
- **Global Data Handling**: The `api` service provides a unified interface for data access, abstracting the storage mechanism from the UI components.
- **Local Component State**: React's `useState` and `useEffect` hooks manage UI-specific states such as form inputs, loading indicators, and conditional visibility toggles.
- **Real-time Updates**: Polling is implemented in the `ScanStatusPage` to fetch periodic updates from the mock backend.

## 4. API Integration Points
The frontend communicates via a mock REST-like service (`src/services/api.ts`):
- `GET /projects`: List all configured projects.
- `GET /projects/:id`: Fetch specific project details.
- `POST /projects`: Create a new project (one-time setup).
- `GET /scans/:id`: Retrieve scan status and stage-level results (includes simulated progress logic).
- `POST /scans`: Trigger a new scan (Automated or Manual).

## 5. UX Flow Explanation
- **Entry**: User lands on Login and proceeds to Dashboard.
- **Dashboard**: Lists all projects with their last scan status (Passed/Failed/Running). Provides a "Create Project" button.
- **Create Project**: Required fields (Name, Git URL, Branch, Credentials, Sonar Key) and optional targets (IP, URL). No scan actions allowed here.
- **Project Control**: The central command center. Users see project details and exactly two primary buttons: "Run Automated Scan" and "Manual Scan".
- **Automated Scan**: One-click confirmation trigger. Redirects to status.
- **Manual Scan**: Advanced checkbox selection of the 11 stages. Conditional visibility for Target IP (Nmap) and Target URL (ZAP).
- **Scan Status**: Polling-based progress tracker showing per-stage status (Pending, Running, Passed, Failed, Skipped). Report links are displayed when available.

## 6. Separation of Automated vs Manual Logic
- **Automated Mode**:
  - User selects nothing.
  - System (Backend/Mock) performs discovery (e.g., skips Nmap/ZAP if targets are missing).
  - Designed for ease of use and "autopilot" security.
- **Manual Mode**:
  - User explicitly selects stages.
  - No auto-detection; only selected stages run.
  - Strict validation: The UI prevents execution if a selected stage requires a target not present in project configuration.

## 7. Production-Quality Frontend Structure
- **Vite + React 19**: Modern build pipeline and latest React features.
- **TypeScript**: Full type safety for data models (`Project`, `Scan`, `ScanStage`).
- **Tailwind CSS v4**: Utility-first styling for a clean, professional UI.
- **Lucide-React**: Consistent, lightweight iconography.
- **Clean Architecture**:
  - `src/components/`: Reusable UI elements and layout.
  - `src/pages/`: Page-level components matching routes.
  - `src/services/`: Business logic and data fetching.
  - `src/types.ts`: Centralized type definitions.
