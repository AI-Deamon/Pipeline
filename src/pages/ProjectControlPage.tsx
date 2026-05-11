import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ChevronLeft, Play, ExternalLink, Loader2, GitBranch, Copy, Check, AlertCircle } from 'lucide-react';
import { ApiError } from '../utils/apiError';

const ProjectControlPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [project, setProject] = useState<{ 
    project_id: string; 
    name: string; 
    git_url: string; 
    branch: string; 
    sonar_key: string; 
    target_ip?: string; 
    target_url?: string; 
    last_scan_state?: string;
    last_scan_id?: string;
  } | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [hasActiveScan, setHasActiveScan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);

  const handleCopy = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  useEffect(() => {
    if (projectId) {
      api.projects.get(projectId).then(data => {
        if (data) {
          setProject(data);
          const ACTIVE = new Set(['CREATED', 'QUEUED', 'RUNNING']);
          setHasActiveScan(ACTIVE.has(data.last_scan_state ?? ''));
        }
        setLoading(false);
      }).catch(() => {
        setError('Failed to load project');
        setLoading(false);
      });
    }
  }, [projectId]);

  const handleRunAutomated = async () => {
    if (!projectId) return;
    setIsTriggering(true);
    try {
      setError(null);
      const scan = await api.scans.trigger(projectId, 'automated');
      navigate(`/scans/${scan.scan_id}`);
    } catch (error) {
      const message = ApiError.getErrorMessage(error, 'Failed to start scan');
      setError(message);
      setIsTriggering(false);
      setShowConfirm(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) return;
      await api.projects.delete(projectId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/dashboard');
    },
    onError: (err) => {
      setError(ApiError.getErrorMessage(err, 'Failed to delete project'));
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center">
        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Project not found</h2>
        <p className="text-slate-500 mb-6">This project may have been deleted.</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  const getStatusBadge = (state: string | null) => {
    switch (state) {
      case "COMPLETED":
        return { bg: "bg-emerald-50 text-emerald-700", label: "Secured" };
      case "FAILED":
        return { bg: "bg-rose-50 text-rose-700", label: "Issues Found" };
      case "RUNNING":
      case "QUEUED":
      case "CREATED":
        return { bg: "bg-amber-50 text-amber-700", label: "Scanning" };
      default:
        return { bg: "bg-slate-100 text-slate-600", label: "No Scans" };
    }
  };

  const status = getStatusBadge(project.last_scan_state ?? null);

  return (
    <div className="max-w-4xl mx-auto p-8 pb-20">
      <header className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
          <p className="text-sm text-slate-500">{project.project_id}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.bg}`}>
          {status.label}
        </span>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <label className="text-sm font-medium text-slate-500 mb-2 block">Git URL</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-700 truncate flex-1">{project.git_url}</span>
            <button onClick={() => handleCopy(project.git_url, 'git')} className="p-1 text-slate-400 hover:text-slate-600">
              {copiedField === 'git' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <label className="text-sm font-medium text-slate-500 mb-2 block">Branch</label>
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-700 font-mono">{project.branch}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <label className="text-sm font-medium text-slate-500 mb-2 block">SonarQube Key</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-700 font-mono truncate flex-1">{project.sonar_key}</span>
            <button onClick={() => handleCopy(project.sonar_key, 'sonar')} className="p-1 text-slate-400 hover:text-slate-600">
              {copiedField === 'sonar' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <label className="text-sm font-medium text-slate-500 mb-2 block">Target IP</label>
          <span className="text-sm text-slate-700 font-mono">{project.target_ip || 'Not set'}</span>
        </div>

        {project.target_url && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 md:col-span-2">
            <label className="text-sm font-medium text-slate-500 mb-2 block">Target URL</label>
            <span className="text-sm text-slate-700 break-all">{project.target_url}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={hasActiveScan || isTriggering}
            className="w-full py-3 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTriggering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Start Scan
          </button>
        </div>
        <Link
          to={`/projects/${project.project_id}/manual`}
          className="px-4 py-3 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium"
        >
          Custom Scan
        </Link>
        <Link
          to={`/projects/${project.project_id}/edit`}
          className="px-4 py-3 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium"
        >
          Edit
        </Link>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="px-4 py-3 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium"
        >
          Delete
        </button>
      </div>

      {project.last_scan_id && (
        <div className="mt-8 pt-6 border-t border-slate-200">
          <Link
            to={`/scans/${project.last_scan_id}`}
            className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            View latest scan results
          </Link>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowConfirm(false)}></div>
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl relative z-10">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Start Scan?</h3>
            <p className="text-slate-500 text-sm mb-6">This will run a full security scan on this project.</p>
            <div className="flex gap-3">
              <button
                onClick={handleRunAutomated}
                disabled={isTriggering}
                className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {isTriggering ? "Starting..." : "Start Scan"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowDeleteConfirm(false)}></div>
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl relative z-10">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete Project?</h3>
            <p className="text-slate-500 text-sm mb-6">This will permanently delete the project and all its scan results.</p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectControlPage;