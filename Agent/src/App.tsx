import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy } from 'react';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// Code splitting: Lazy load page components
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CreateProjectPage = lazy(() => import('./pages/CreateProjectPage'));
const ProjectControlPage = lazy(() => import('./pages/ProjectControlPage'));
const ProjectEditPage = lazy(() => import('./pages/ProjectEditPage'));
const ManualScanPage = lazy(() => import('./pages/ManualScanPage'));
const ScanStatusPage = lazy(() => import('./pages/ScanStatusPage'));
const ScanHistoryPage = lazy(() => import('./pages/ScanHistoryPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));

// Loading component for lazy-loaded routes
const PageLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh]">
    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4 shadow-lg shadow-blue-100"></div>
    <div className="flex flex-col items-center gap-1">
      <span className="text-slate-900 font-black tracking-tight text-lg">Synchronizing</span>
      <span className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em] animate-pulse">Establishing secure link</span>
    </div>
  </div>
);

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/dashboard"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <DashboardPage />
                  </Suspense>
                }
              />
              <Route
                path="/projects/create"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <CreateProjectPage />
                  </Suspense>
                }
              />
              <Route
                path="/projects/:projectId"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <ProjectControlPage />
                  </Suspense>
                }
              />
              <Route
                path="/projects/:projectId/edit"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <ProjectEditPage />
                  </Suspense>
                }
              />
              <Route
                path="/projects/:projectId/manual"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <ManualScanPage />
                  </Suspense>
                }
              />
              <Route
                path="/scans/:scanId"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <ScanStatusPage />
                  </Suspense>
                }
              />
              <Route
                path="/projects/:projectId/history"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <ScanHistoryPage />
                  </Suspense>
                }
              />
              <Route
                path="/settings"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <SettingsPage />
                  </Suspense>
                }
              />
              <Route
                path="/users"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <UserManagementPage />
                  </Suspense>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
