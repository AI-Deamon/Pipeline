import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Shield, LayoutDashboard, PlusCircle, Bug, LogOut, Menu, X, Activity, History, Settings, Key, BookOpen, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { Breadcrumbs } from './Breadcrumbs';
import { api } from '../services/api';

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId, scanId } = useParams();
  const { logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;
  const showProjectContext = currentProject !== undefined;

  const NavLink = ({ to, icon: Icon, children }: { to: string; icon: any; children: React.ReactNode }) => (
    <Link
      to={to}
      onClick={() => setIsMobileMenuOpen(false)}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
        isActive(to) 
          ? 'bg-slate-900 text-white shadow-md' 
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <Icon className={`w-5 h-5 ${isActive(to) ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
      <span className="font-medium text-sm">{children}</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col md:flex-row">
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
          <div>
            <h3 className="px-4 text-xs font-medium text-slate-400 mb-3">Core</h3>
            <div className="space-y-1">
              <NavLink to="/dashboard" icon={LayoutDashboard}>Dashboard</NavLink>
              <NavLink to="/my-issues" icon={Bug}>My Issues</NavLink>
              <NavLink to="/pending-verification" icon={Shield}>Pending Verification</NavLink>
              <NavLink to="/projects/create" icon={PlusCircle}>New Project</NavLink>
              <NavLink to="/users" icon={Shield}>Users</NavLink>
              <NavLink to="/settings" icon={Key}>API Settings</NavLink>
              <NavLink to="/docs" icon={BookOpen}>Docs</NavLink>
            </div>
          </div>

          {showProjectContext && (
            <div>
              <h3 className="px-4 text-xs font-medium text-slate-400 mb-3 flex items-center justify-between">
                <span>Active Project</span>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
              </h3>
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                <div className="px-3 py-2 border-b border-slate-200 mb-2">
                  <div className="font-medium text-sm truncate text-slate-900">{currentProject?.name || 'Loading...'}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{currentProject?.id}</div>
                </div>
                <div className="space-y-1 pt-1">
                  <NavLink to={`/projects/${currentProject?.id}`} icon={Activity}>Controls</NavLink>
                  <NavLink to={`/projects/${currentProject?.id}/history`} icon={History}>Scan History</NavLink>
                  <NavLink to={`/projects/${currentProject?.id}/manual`} icon={Settings}>Configure</NavLink>
                  <NavLink to={`/projects/${currentProject?.id}/reports`} icon={FileText}>Reports</NavLink>
                </div>
              </div>
            </div>
          )}
        </nav>

        <div className="p-4 mt-auto border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-3 mb-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-200 rounded-lg flex items-center justify-center font-medium text-slate-600">
              A
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900">Admin User</div>
              <div className="text-[10px] text-slate-400">System Operator</div>
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
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold text-slate-900 leading-none">
              {location.pathname === '/dashboard' ? 'Dashboard' :
               location.pathname === '/projects/create' ? 'Create Project' :
               location.pathname.includes('/projects/') && location.pathname.includes('/edit') ? 'Edit Project' :
               location.pathname.includes('/projects/') && location.pathname.includes('/manual') ? 'Scan Configuration' :
               location.pathname.includes('/projects/') && location.pathname.includes('/history') ? 'Scan History' :
               location.pathname.includes('/projects/') ? 'Project Controls' :
               location.pathname.includes('/scans/') ? 'Scan Details' :
               location.pathname.includes('/history') ? 'Scan Archive' :
               location.pathname.includes('/login') || location.pathname.includes('/register') ? '' : 'Project Control'}
            </h1>
            {!(location.pathname.includes('/login') || location.pathname.includes('/register')) && (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                <span className="text-xs text-slate-500">System Operational</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-xs text-slate-400">Server Time</span>
              <span className="text-xs font-medium text-slate-700 font-mono">
                {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })} IST
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