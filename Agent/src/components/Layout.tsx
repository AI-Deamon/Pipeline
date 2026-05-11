import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Shield, LayoutDashboard, PlusCircle, LogOut, Menu, X, Activity, History, Settings, Key, Terminal } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Breadcrumbs } from './Breadcrumbs';
import { api } from '../services/api';

const NavLink = ({ to, icon: Icon, children, isActive }: { to: string; icon: any; children: React.ReactNode, isActive: boolean }) => (
  <Link
    to={to}
    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group border border-transparent ${
      isActive 
        ? 'bg-primary/10 text-primary border-primary/20 shadow-[0_0_15px_rgba(0,255,65,0.1)]' 
        : 'text-gray-500 hover:text-white hover:bg-white/5'
    }`}
  >
    <Icon className={`w-4 h-4 font-mono ${isActive ? 'text-primary' : 'group-hover:text-white transition-colors'}`} />
    <span className="font-mono font-bold text-xs uppercase tracking-wider">{children}</span>
    {isActive && (
      <span className="ml-auto w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_5px_#00FF41]"></span>
    )}
  </Link>
);

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId, scanId } = useParams();
  const { logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentProject, setCurrentProject] = useState<{ id: string; name: string } | undefined>();
  const [showApikeyBanner, setShowApikeyBanner] = useState(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem('apikey_banner_dismissed') === 'true';
    const apiKey = localStorage.getItem('api_key');
    if (!apiKey && !isDismissed) {
      setShowApikeyBanner(true);
    } else {
      setShowApikeyBanner(false);
    }
  }, [location.pathname]);

  const handleDismissBanner = () => {
    localStorage.setItem('apikey_banner_dismissed', 'true');
    setShowApikeyBanner(false);
  };

  useEffect(() => {
    const fetchProjectContext = async () => {
      let activeProjectId = projectId;

      if (!activeProjectId && scanId) {
        try {
          const scan = await api.scans.get(scanId);
          activeProjectId = scan?.project_id;
        } catch (err) {
          console.error('Failed to fetch scan context:', err);
        }
      }

      if (activeProjectId) {
        try {
          const data = await api.projects.get(activeProjectId);
          if (data) {
            setCurrentProject({ id: data.project_id, name: data.name });
          }
        } catch (err) {
          console.error('Failed to fetch project context:', err);
          setCurrentProject(undefined);
        }
      } else {
        setCurrentProject(undefined);
      }
    };

    fetchProjectContext();
  }, [projectId, scanId]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const checkActive = (path: string) => location.pathname === path;
  const showProjectContext = currentProject !== undefined;

  return (
    <div className="min-h-screen bg-background text-text flex flex-col md:flex-row font-sans selection:bg-primary selection:text-black overflow-hidden">
      {/* Background Matrix Effect (Subtle) */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.02] bg-[url('https://upload.wikimedia.org/wikipedia/commons/1/17/Matrix_code.gif')] bg-cover mix-blend-screen"></div>

      {/* Mobile Header */}
      <header className="md:hidden h-16 bg-black border-b border-white/10 flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-primary" />
          <span className="font-mono font-bold tracking-tighter text-white">KALI<span className="text-primary">.AGENT</span></span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 md:relative md:translate-x-0 transition-transform duration-500 ease-in-out
        w-[280px] md:w-72 bg-black border-r border-white/10 flex flex-col shadow-2xl md:shadow-none
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-8 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center border border-primary/20 shadow-[0_0_15px_rgba(0,255,65,0.1)]">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-lg font-bold tracking-tighter text-white leading-none">KALI<span className="text-primary">.AGENT</span></span>
              <span className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest mt-1">v2.0.0-alpha</span>
            </div>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden p-2 text-gray-500 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-6 py-6 space-y-8 overflow-y-auto">
          {/* Main Navigation */}
          <div>
            <h3 className="px-4 text-[10px] font-mono font-bold text-gray-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Terminal className="w-3 h-3" />
              Core Systems
            </h3>
            <div className="space-y-1">
              <NavLink to="/dashboard" icon={LayoutDashboard} isActive={checkActive('/dashboard')}>Mission Control</NavLink>
              <NavLink to="/projects/create" icon={PlusCircle} isActive={checkActive('/projects/create')}>New Operation</NavLink>
              <NavLink to="/users" icon={Shield} isActive={checkActive('/users')}>Personnel</NavLink>
              <NavLink to="/settings" icon={Key} isActive={checkActive('/settings')}>Credentials</NavLink>
            </div>
          </div>

          {/* Contextual Project Navigation */}
          {showProjectContext && (
            <div className="animate-in fade-in slide-in-from-left-4 duration-500">
              <h3 className="px-4 text-[10px] font-mono font-bold text-gray-600 uppercase tracking-widest mb-4 flex items-center justify-between">
                <span>Active Target</span>
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse shadow-[0_0_5px_#00FF41]"></span>
              </h3>
              <div className="bg-white/5 rounded-xl p-1 border border-white/10">
                <div className="px-4 py-3 border-b border-white/5 mb-2">
                  <div className="font-mono font-bold text-xs truncate text-white uppercase tracking-wider">{currentProject?.name || 'Loading...'}</div>
                  <div className="text-[10px] font-mono text-gray-500 mt-0.5 truncate opacity-50">{currentProject?.id}</div>
                </div>
                <div className="space-y-1">
                  <NavLink to={`/projects/${currentProject?.id}`} icon={Activity} isActive={checkActive(`/projects/${currentProject?.id}`)}>Controls</NavLink>
                  <NavLink to={`/projects/${currentProject?.id}/history`} icon={History} isActive={checkActive(`/projects/${currentProject?.id}/history`)}>Logs</NavLink>
                  <NavLink to={`/projects/${currentProject?.id}/manual`} icon={Settings} isActive={checkActive(`/projects/${currentProject?.id}/manual`)}>Config</NavLink>
                </div>
              </div>
            </div>
          )}
        </nav>

        <div className="p-6 mt-auto border-t border-white/5">
          <div className="bg-white/5 rounded-xl p-3 mb-4 flex items-center gap-3 border border-white/5 hover:border-white/10 transition-colors cursor-pointer group">
            <div className="w-8 h-8 bg-gradient-to-br from-gray-800 to-black rounded-lg flex items-center justify-center font-mono font-bold text-xs text-gray-300 border border-white/10 group-hover:border-primary/50 transition-colors">
              OP
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono font-bold truncate text-white group-hover:text-primary transition-colors">Operator</div>
              <div className="text-[10px] font-mono font-medium text-gray-600 uppercase tracking-wider">Level 5 Access</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-gray-500 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 border border-transparent transition-all duration-200 group"
          >
            <LogOut className="w-4 h-4 font-mono group-hover:translate-x-1 transition-transform" />
            <span className="font-mono font-bold text-xs uppercase tracking-wider">Disconnect</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative z-10">
        <header className="h-16 bg-black/50 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-8 flex-shrink-0 relative z-30">
          <div className="flex flex-col justify-center">
            <h1 className="text-white font-mono font-bold text-lg tracking-tight leading-none uppercase">
              {location.pathname === '/dashboard' ? 'Mission Control' :
               location.pathname === '/projects/create' ? 'Initialize Operation' :
               location.pathname.includes('/projects/') && location.pathname.includes('/edit') ? 'Edit Parameters' :
               location.pathname.includes('/projects/') && location.pathname.includes('/manual') ? 'Scan Configuration' :
               location.pathname.includes('/projects/') && location.pathname.includes('/history') ? 'Audit Logs' :
               location.pathname.includes('/projects/') ? 'Target Control' :
               location.pathname.includes('/scans/') ? 'Scan Telemetry' :
               location.pathname.includes('/history') ? 'Archive' :
               location.pathname.includes('/login') || location.pathname.includes('/register') ? '' : 'System Status'}
            </h1>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-[10px] font-mono font-bold text-gray-600 uppercase tracking-widest">Server Time</span>
              <span className="text-xs font-mono font-bold text-primary tracking-wider">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} UTC
              </span>
            </div>
            <div className="w-px h-6 bg-white/10"></div>
            <button className="relative p-2 text-gray-500 hover:text-primary transition-colors group">
              <Activity className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_5px_#00FF41] group-hover:animate-ping"></span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto relative scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
          <div className="max-w-[1800px] mx-auto p-8">
            <div className="mb-6">
              <Breadcrumbs projectName={currentProject?.name} />
            </div>

            {/* Global API Key Setup Banner */}
            {showApikeyBanner && (
              <div className="mb-10 bg-amber-900/10 border border-amber-500/20 rounded-3xl px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500 relative overflow-hidden">
                <div className="absolute inset-0 bg-amber-500/5 scanline"></div>
                <div className="flex items-start gap-5 flex-1 relative z-10">
                  <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center flex-shrink-0 border border-amber-500/20">
                    <Key className="w-6 h-6 text-amber-500" />
                  </div>
                  <div className="space-y-1">
                    <div className="font-mono font-black text-amber-500 uppercase tracking-widest text-sm">Credentials Missing</div>
                    <div className="text-amber-500/80 text-xs font-mono font-bold leading-relaxed max-w-2xl">
                      API key configuration required for write access. Operational control plane is currently in read-only mode.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 self-stretch md:self-auto relative z-10">
                  <button
                    onClick={() => navigate('/settings')}
                    className="px-6 py-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 border border-amber-500/50 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                  >
                    Configure
                  </button>
                  <button
                    onClick={handleDismissBanner}
                    className="p-3 text-amber-500/50 hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-colors"
                    aria-label="Dismiss banner"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            <div className="animate-in fade-in duration-500 slide-in-from-bottom-2">
              <Outlet />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;
