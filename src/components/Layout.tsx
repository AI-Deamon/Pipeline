import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Outlet, Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Shield, LayoutDashboard, PlusCircle, Bug, LogOut, Menu, X, Activity, History, Settings, Key, BookOpen, FileText, ListChecks, FolderTree, Edit3, type LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useRbac } from '../hooks/useRbac';
import { Breadcrumbs } from './Breadcrumbs';
import { api } from '../services/api';
import { useHealthStatus } from '../hooks/useHealthStatus';
import { SkipLink } from './ui/SkipLink';

interface NavLinkProps {
  to: string;
  icon: LucideIcon;
  isActive: boolean;
  onNavigate: () => void;
  children: ReactNode;
}

const NavLink = ({ to, icon: Icon, isActive, onNavigate, children }: NavLinkProps) => (
  <Link
    to={to}
    onClick={onNavigate}
    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
      isActive
        ? 'bg-slate-900 text-white shadow-md'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
    <span className="font-medium text-sm">{children}</span>
  </Link>
);

function getPageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'Dashboard';
  if (pathname === '/projects/create') return 'Create Project';
  if (pathname.includes('/projects/') && pathname.includes('/edit')) return 'Edit Project';
  if (pathname.includes('/projects/') && pathname.includes('/manual')) return 'Scan Configuration';
  if (pathname.includes('/projects/') && pathname.includes('/history')) return 'Scan History';
  if (pathname.includes('/projects/')) return 'Project Controls';
  if (pathname.includes('/scans/')) return 'Scan Details';
  if (pathname.includes('/history')) return 'Scan Archive';
  if (pathname.includes('/login') || pathname.includes('/register')) return '';
  return 'Project Control';
}

type CoreNavLinksProps = {
  isActive: (path: string) => boolean;
  onNavigate: () => void;
  canAssignIssues: boolean;
  isAdmin: boolean;
  canViewProjectGroups: boolean;
};

function CoreNavLinks({ isActive, onNavigate, canAssignIssues, isAdmin, canViewProjectGroups }: CoreNavLinksProps) {
  return (
    <div>
      <h3 className="px-4 text-xs font-medium text-slate-400 mb-3">Core</h3>
      <div className="space-y-1">
        <NavLink to="/dashboard" icon={LayoutDashboard} isActive={isActive('/dashboard')} onNavigate={onNavigate}>Dashboard</NavLink>
        <NavLink to="/my-issues" icon={Bug} isActive={isActive('/my-issues')} onNavigate={onNavigate}>My Issues</NavLink>
        {(canAssignIssues || isAdmin) && (
          <NavLink to="/issues" icon={ListChecks} isActive={isActive('/issues')} onNavigate={onNavigate}>Issues</NavLink>
        )}
        <NavLink to="/pending-verification" icon={Shield} isActive={isActive('/pending-verification')} onNavigate={onNavigate}>Rescan Approvals</NavLink>
        {canViewProjectGroups && (
          <NavLink to="/project-groups" icon={FolderTree} isActive={isActive('/project-groups')} onNavigate={onNavigate}>Groups</NavLink>
        )}
        <NavLink to="/projects/create" icon={PlusCircle} isActive={isActive('/projects/create')} onNavigate={onNavigate}>New Project</NavLink>
        <NavLink to="/users" icon={Shield} isActive={isActive('/users')} onNavigate={onNavigate}>Users</NavLink>
        <NavLink to="/settings" icon={Key} isActive={isActive('/settings')} onNavigate={onNavigate}>API Settings</NavLink>
        <NavLink to="/docs" icon={BookOpen} isActive={isActive('/docs')} onNavigate={onNavigate}>Docs</NavLink>
      </div>
    </div>
  );
}

type ActiveProjectPanelProps = {
  currentProject?: { id: string; name: string };
  canUpdateProject: boolean;
  onNavigate: () => void;
  isActive: (path: string) => boolean;
};

function ActiveProjectPanel({ currentProject, canUpdateProject, onNavigate, isActive }: ActiveProjectPanelProps) {
  return (
    <div>
      <h3 className="px-4 text-xs font-medium text-slate-400 mb-3 flex items-center justify-between">
        <span>Active Project</span>
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
      </h3>
      <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
        <div className="px-3 py-2 border-b border-slate-200 mb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium text-sm truncate text-slate-900">{currentProject?.name || 'Loading...'}</div>
            {canUpdateProject && currentProject?.id && (
              <Link
                to={`/projects/${currentProject.id}/edit`}
                onClick={onNavigate}
                aria-label={`Edit ${currentProject.name}`}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-white rounded transition-colors shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{currentProject?.id}</div>
        </div>
        <div className="space-y-1 pt-1">
          <NavLink to={`/projects/${currentProject?.id}`} icon={Activity} isActive={isActive(`/projects/${currentProject?.id}`)} onNavigate={onNavigate}>Controls</NavLink>
          <NavLink to={`/projects/${currentProject?.id}/history`} icon={History} isActive={isActive(`/projects/${currentProject?.id}/history`)} onNavigate={onNavigate}>Scan History</NavLink>
          <NavLink to={`/projects/${currentProject?.id}/manual`} icon={Settings} isActive={isActive(`/projects/${currentProject?.id}/manual`)} onNavigate={onNavigate}>Configure</NavLink>
          <NavLink to={`/projects/${currentProject?.id}/reports`} icon={FileText} isActive={isActive(`/projects/${currentProject?.id}/reports`)} onNavigate={onNavigate}>Reports</NavLink>
        </div>
      </div>
    </div>
  );
}

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId, scanId } = useParams();
  const { logout, currentUser } = useAuth();
  const { isAdmin, canAssignIssues, canViewProjectGroups, canUpdateProject } = useRbac();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [serverTime, setServerTime] = useState(new Date());
  const { data: healthData } = useHealthStatus();

  const healthStatus = healthData?.status || 'operational';

  const healthColor = (() => {
    if (healthStatus === 'operational') return 'bg-emerald-500';
    if (healthStatus === 'degraded') return 'bg-amber-500';
    return 'bg-rose-500';
  })();

  const healthLabel = (() => {
    if (healthStatus === 'operational') return 'System Operational';
    if (healthStatus === 'degraded') return 'Some Services Degraded';
    return 'Platform Unavailable';
  })();

  const { data: scanData } = useQuery({
    queryKey: ['scan', scanId],
    queryFn: () => scanId ? api.scans.get(scanId) : null,
    enabled: !!scanId,
    retry: false,
  });

  const activeProjectId = projectId || scanData?.project_id;

  const { data: projectData } = useQuery({
    queryKey: ['project', activeProjectId],
    queryFn: () => activeProjectId ? api.projects.get(activeProjectId) : null,
    enabled: !!activeProjectId,
    retry: false,
  });

  const currentProject = projectData ? { id: projectData.project_id, name: projectData.name } : undefined;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const timer = setInterval(() => setServerTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;
  const showProjectContext = currentProject !== undefined;
  const handleNavClick = () => setIsMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col md:flex-row">
      <SkipLink />
      {/* Mobile Header */}
      <header className="md:hidden h-16 bg-white border-b border-slate-200 text-slate-900 flex items-center justify-between px-6 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <Shield className="w-7 h-7 text-slate-900" />
          <span className="font-semibold">Sentinel</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 md:relative md:translate-x-0 transition-transform duration-300 ease-in-out
        w-[280px] md:w-72 bg-white border-r border-slate-200 flex flex-col shadow-sm
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold tracking-tight leading-none">Sentinel</span>
              <span className="text-[10px] font-medium text-slate-500 mt-1">Security Dashboard</span>
            </div>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden p-2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
          <CoreNavLinks
            isActive={isActive}
            onNavigate={handleNavClick}
            canAssignIssues={canAssignIssues}
            isAdmin={isAdmin}
            canViewProjectGroups={canViewProjectGroups}
          />

          {showProjectContext && (
            <ActiveProjectPanel
              currentProject={currentProject}
              canUpdateProject={canUpdateProject}
              onNavigate={handleNavClick}
              isActive={isActive}
            />
          )}
        </nav>

        <div className="p-4 mt-auto border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-3 mb-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-200 rounded-lg flex items-center justify-center font-medium text-slate-600">
              {currentUser?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900">{currentUser?.username || 'Unknown User'}</div>
              <div className="text-[10px] text-slate-400 capitalize">{currentUser?.role || 'No Role'}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-all duration-200"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main id="main-content" className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold text-slate-900 leading-none">
              {getPageTitle(location.pathname)}
            </h1>
            {!(location.pathname.includes('/login') || location.pathname.includes('/register')) && (
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 ${healthColor} rounded-full`}></div>
                <span className="text-xs text-slate-500">{healthLabel}</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-xs text-slate-400">Server Time</span>
              <span className="text-xs font-medium text-slate-700 font-mono">
                {serverTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })} IST
              </span>
            </div>
            <div className="w-px h-6 bg-slate-200"></div>
            <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <Activity className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-[#fafafa]">
          <div className="max-w-7xl mx-auto p-6">
            <Breadcrumbs projectName={currentProject?.name} />
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;