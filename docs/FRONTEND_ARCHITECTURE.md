# Frontend Architecture Documentation

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
1. **Entry**: User lands on Login and proceeds to Dashboard.
2. **Setup**: User creates a project with Git URL, Credentials, and Sonar Key.
3. **Control**: On the Project Control page, the user chooses between a simple **Automated Scan** or an advanced **Manual Scan**.
4. **Execution**: After triggering, the user is redirected to the Scan Status page to watch progress.
5. **Results**: Upon completion, the user can view individual stage reports and a final summary.

## 6. Separation of Automated vs Manual Logic
- **Automated Mode**: Designed for simplicity. It triggers all 11 security stages automatically. The UI provides a simple confirmation modal before starting.
- **Manual Mode**: Designed for granular control.
  - Users select specific stages via checkboxes.
  - Conditional validation: Target IP and Target URL fields are highlighted/warned only if Nmap or ZAP stages are selected.
  - **Strict Validation**: The UI prevents starting a scan if a selected stage requires a target (IP/URL) that is not configured in the project.
  - Only the selected subset of stages is executed and displayed on the status page.

## 7. Production-Quality Frontend Structure
- **Vite + React 19**: Modern build pipeline and latest React features.
- **TypeScript**: Full type safety for data models (`Project`, `Scan`, `ScanStage`).
- **Tailwind CSS v4**: Utility-first styling for a clean, professional UI without bloated CSS.
- **Lucide-React**: Consistent, lightweight iconography.
- **Project Organization**:
  - `src/components/`: Reusable UI elements and layout.
  - `src/pages/`: Page-level components matching routes.
  - `src/services/`: Business logic and data fetching.
  - `src/types.ts`: Centralized type definitions.
