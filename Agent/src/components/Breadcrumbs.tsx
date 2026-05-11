import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

interface BreadcrumbsProps {
  projectName?: string;
}

export const Breadcrumbs = ({ projectName }: BreadcrumbsProps) => {
  const location = useLocation();
  const { projectId, scanId } = useParams();
  
  const pathnames = location.pathname.split('/').filter((x) => x);

  // If we are on a scan page, we might want to fetch the project context for the breadcrumb
  const { data: scan } = useQuery({
    queryKey: ['scan', scanId],
    queryFn: () => api.scans.get(scanId!),
    enabled: !!scanId && !projectId,
  });

  const activeProjectId = projectId || scan?.project_id;
  const displayProjectName = projectName || (activeProjectId ? 'Project' : '');

  return (
    <nav className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-6 uppercase tracking-widest" aria-label="Breadcrumb">
      <Link to="/dashboard" className="hover:text-blue-600 transition-colors flex items-center gap-2 group">
        <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center group-hover:bg-blue-50 transition-colors">
          <Home className="w-3.5 h-3.5" />
        </div>
        <span className="hidden sm:inline">Dashboard</span>
      </Link>
      
      {pathnames.length > 0 && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          
          {pathnames[0] === 'projects' && pathnames[1] === 'create' ? (
            <span className="text-slate-900">New Project</span>
          ) : activeProjectId ? (
            <>
              <Link to={`/projects/${activeProjectId}`} className="hover:text-blue-600 transition-colors text-slate-900">
                {displayProjectName}
              </Link>
              
              {pathnames.includes('manual') && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-slate-900">Configure Scan</span>
                </>
              )}

              {pathnames.includes('edit') && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-slate-900">Edit Project</span>
                </>
              )}
              
              {pathnames.includes('history') && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-slate-900">Scan Archive</span>
                </>
              )}

              {pathnames[0] === 'scans' && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-slate-900">Execution Trace</span>
                </>
              )}
            </>
          ) : pathnames[0] === 'scans' ? (
            <span className="text-slate-900">Execution Trace</span>
          ) : null}
        </>
      )}
    </nav>
  );
};
