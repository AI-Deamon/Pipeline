import { useState, useMemo, memo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { Project } from '../types';
import { Plus, Search, Activity, X, Trash2, AlertCircle, Shield, Clock, CheckCircle, XCircle, ExternalLink, ChevronRight, Key, Terminal } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';
import { useScanWebSocket } from '../hooks/useScanWebSocket';
import { PageSkeleton } from '../components/PageSkeleton';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';

/**
 * Memoized ProjectRow to prevent re-rendering when the search term changes
 * but the project data remains identical.
 */
const ProjectRow = memo(({ project }: { project: Project }) => {
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const deleteProjectMutation = useMutation({
    mutationFn: () => api.projects.delete(project.project_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowDeleteConfirm(false);
    },
    onError: (error) => {
      console.error('Failed to delete project:', error);
    }
  });

  const getStatusDisplay = (state: string | null) => {
    switch (state) {
      case 'COMPLETED':
        return { color: 'text-primary bg-primary/10 border-primary/20', icon: <CheckCircle className="w-3 h-3" /> };
      case 'FAILED':
        return { color: 'text-red-500 bg-red-900/20 border-red-900/50', icon: <AlertCircle className="w-3 h-3" /> };
      case 'RUNNING':
      case 'QUEUED':
      case 'CREATED':
        return { color: 'text-blue-400 bg-blue-900/20 border-blue-900/50', icon: <Clock className="w-3 h-3 animate-pulse" /> };
      case 'CANCELLED':
        return { color: 'text-gray-500 bg-gray-900/20 border-gray-800', icon: <XCircle className="w-3 h-3" /> };
      default:
        return { color: 'text-gray-500 bg-gray-900/20 border-gray-800', icon: <Activity className="w-3 h-3" /> };
    }
  };

  const status = getStatusDisplay(project.last_scan_state ?? null);

  return (
    <tr className="hover:bg-white/5 transition-colors group border-b border-white/5 last:border-0">
      <td className="px-6 py-5">
        <div className="flex flex-col">
          <span className="font-mono font-bold text-white leading-tight mb-1 group-hover:text-primary transition-colors">{project.name}</span>
          <span className="text-[10px] font-mono text-gray-500 tracking-wider">{project.project_id}</span>
        </div>
      </td>
      <td className="px-6 py-5">
        {project.last_scan_id ? (
          <Link
            to={`/scans/${project.last_scan_id}`}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all border ${status.color} hover:bg-white/10`}
          >
            {status.icon}
            {project.last_scan_state || 'No Scans'}
            <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        ) : (
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider border ${status.color}`}>
            {status.icon}
            No Scans
          </div>
        )}
      </td>
      <td className="px-6 py-5 text-right">
        <div className="flex items-center justify-end gap-3">
          {!showDeleteConfirm ? (
            <>
              {project.last_scan_id && (
                <Link
                  to={`/scans/${project.last_scan_id}`}
                  className="inline-flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg text-[10px] font-mono font-bold transition-all uppercase tracking-wider"
                  title="View latest scan"
                >
                  <ExternalLink className="w-3 h-3" />
                  Latest
                </Link>
              )}
              <Link
                to={`/projects/${project.project_id}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-gray-300 hover:text-primary hover:border-primary/50 hover:bg-primary/5 rounded-lg text-[10px] font-mono font-bold transition-all uppercase tracking-wider"
              >
                <Activity className="w-3 h-3" />
                Manage
              </Link>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-900/20 rounded-lg transition-all"
                title="Delete project"
                aria-label={`Delete project ${project.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 animate-in slide-in-from-right-2 duration-200">
              <span className="text-[10px] font-mono font-bold text-red-500 mr-2 uppercase tracking-wider blink">Confirm?</span>
              <button
                onClick={() => deleteProjectMutation.mutate()}
                disabled={deleteProjectMutation.isPending}
                className="px-3 py-1.5 bg-red-500 text-black rounded-lg text-[10px] font-mono font-bold hover:bg-red-400 disabled:opacity-50"
              >
                DELETE
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 bg-transparent border border-white/20 text-gray-400 rounded-lg text-[10px] font-mono font-bold hover:bg-white/10 hover:text-white"
              >
                CANCEL
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
});

ProjectRow.displayName = 'ProjectRow';

const ACTIVE_STATES = new Set(['CREATED', 'QUEUED', 'RUNNING']);

const DashboardPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // WebSocket for real-time dashboard updates (Phase 3.1)
  useScanWebSocket(undefined, undefined, {
    onMessage: (message) => {
      console.log('Dashboard real-time update received:', message);
      // Invalidate projects query to fetch latest states
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onOpen: () => {
      console.log('Dashboard WebSocket connected');
    },
  });

  const { data: projects = [], isLoading: loading } = useQuery({
    queryKey: ['projects'],
    queryFn: api.projects.list,
    refetchInterval: 10000,
  });

  // Performance: Debounce search input to avoid re-filtering and re-renders on every keystroke
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Performance: Memoize filtered projects to avoid re-calculating on every render.
  const hasActiveScan = useMemo(
    () => projects.some((p) => ACTIVE_STATES.has(p.last_scan_state ?? '')),
    [projects]
  );

  const filteredProjects = useMemo(() => {
    if (!debouncedSearchTerm) return projects;

    const lowerSearch = debouncedSearchTerm.toLowerCase();
    return projects.filter(project =>
      project.name.toLowerCase().includes(lowerSearch)
    );
  }, [projects, debouncedSearchTerm]);

  if (loading) return <PageSkeleton type="dashboard" />;

  return (
    <div className="space-y-8">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-mono font-bold text-white tracking-tighter leading-none mb-2 flex items-center gap-3">
            <Terminal className="w-8 h-8 text-primary" />
            PIPELINE_STATUS
          </h2>
          <p className="text-gray-500 text-xs font-mono uppercase tracking-widest">Active Security Infrastructure Monitoring</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="relative group min-w-[300px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-primary transition-colors" aria-hidden="true" />
            <input
              type="text"
              placeholder="SEARCH_TARGETS..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search projects"
              className="w-full pl-11 pr-11 py-3 bg-white/5 border border-white/10 rounded-lg text-sm font-mono text-white focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all placeholder:text-gray-700"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white p-1 rounded transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <Button
            variant="primary"
            onClick={() => navigate('/projects/create')}
            icon={Plus}
          >
            INIT_OP
          </Button>
        </div>
      </div>

      {hasActiveScan && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500 relative overflow-hidden">
          <div className="absolute inset-0 scanline"></div>
          <div className="flex items-center gap-5 relative z-10">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center animate-pulse border border-primary/20 shadow-[0_0_10px_rgba(0,255,65,0.2)]">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="font-mono font-bold text-primary uppercase tracking-widest text-sm flex items-center gap-2">
                <span className="w-2 h-2 bg-primary rounded-full animate-ping"></span>
                Active Scan Sequence
              </div>
              <div className="text-primary/60 text-xs font-mono mt-1">Telemetry stream active. Processing targets...</div>
            </div>
          </div>
          <div className="text-[10px] font-mono font-bold text-primary uppercase tracking-[0.2em] bg-primary/10 px-4 py-2 rounded border border-primary/20 backdrop-blur-sm self-start md:self-center relative z-10">
            LIVE_FEED
          </div>
        </div>
      )}

      {filteredProjects.length === 0 ? (
        <div className="py-12">
          {debouncedSearchTerm ? (
            <div className="card-container p-20 text-center">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-white/10 bg-white/5">
                <Search className="w-10 h-10 text-gray-600" />
              </div>
              <h3 className="text-xl font-mono font-bold text-white tracking-tight mb-2 uppercase">No Targets Found</h3>
              <p className="text-gray-500 text-sm font-mono mb-8">Query "{debouncedSearchTerm}" returned 0 results.</p>
              <button 
                onClick={() => setSearchTerm('')}
                className="text-primary font-mono font-bold uppercase text-xs tracking-widest hover:text-white transition-colors border-b border-primary hover:border-white pb-0.5"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <EmptyState
              icon={Shield}
              title="System Idle"
              description="No active targets in the registry. Initialize a new operation to begin vulnerability assessment."
              actionLabel="Initialize Op"
              onAction={() => navigate('/projects/create')}
            />
          )}
        </div>
      ) : (
        <div className="card-container">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-mono font-bold text-gray-500 uppercase tracking-[0.2em]">Target ID</th>
                  <th className="px-6 py-4 text-[10px] font-mono font-bold text-gray-500 uppercase tracking-[0.2em]">Status</th>
                  <th className="px-6 py-4 text-[10px] font-mono font-bold text-gray-500 uppercase tracking-[0.2em] text-right">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredProjects.map(project => (
                  <ProjectRow key={project.project_id} project={project} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
