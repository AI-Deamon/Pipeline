import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ChevronLeft, Play, Settings2, Info, GitBranch, ShieldCheck, Globe, MapPin, X, Copy, Check, History, Zap, ExternalLink, Cpu, HardDrive, Trash2, PencilLine, AlertCircle } from 'lucide-react';
import { ApiError } from '../utils/apiError';
import { Button } from '../components/Button';

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
        setError('Failed to load project details');
        setLoading(false);
      });
    }
  }, [projectId]);

  const handleRunAutomated = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      setError(null);
      const scan = await api.scans.trigger(projectId, 'automated');
      navigate(`/scans/${scan.scan_id}`);
    } catch (_: any) {
      const detail = 'Failed to trigger scan';
      setError(detail);
      setLoading(false);
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
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4 shadow-[0_0_20px_rgba(0,255,65,0.2)]"></div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-white font-mono font-bold tracking-tight text-lg uppercase">Synchronizing</span>
          <span className="text-primary text-[10px] font-mono font-bold uppercase tracking-[0.2em] animate-pulse">Establishing secure link</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center space-y-6 bg-surface border border-white/10 rounded-3xl shadow-xl shadow-black/50">
        <div className="w-20 h-20 bg-red-900/20 text-red-500 rounded-2xl flex items-center justify-center mx-auto shadow-inner border border-red-900/50">
          <AlertCircle className="w-10 h-10" />
        </div>
        <div>
          <h2 className="text-3xl font-mono font-bold text-white tracking-tight uppercase mb-2 leading-none">Access Denied</h2>
          <p className="text-gray-400 font-mono text-sm leading-relaxed">The requested project blueprint is unavailable or has been archived.</p>
        </div>
        <Button
          onClick={() => navigate('/dashboard')}
          variant="secondary"
        >
          Return to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-16 pb-32 px-4">
      {/* Enhanced Header Area */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="flex items-center gap-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-4 bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 rounded-2xl transition-all active:scale-90 shadow-sm group"
            aria-label="Return to fleet overview"
          >
            <ChevronLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
          </button>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse shadow-[0_0_5px_#00FF41]"></div>
              <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-[0.3em]">Project Control Plane</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-mono font-bold text-white tracking-tighter leading-none uppercase">{project.name}</h1>
            <div className="flex items-center gap-4 text-gray-400">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest bg-white/5 px-2 py-1 rounded border border-white/10">ID: {project.project_id.split('-')[0]}...</span>
              <div className="w-1 h-1 bg-gray-600 rounded-full"></div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest opacity-70">Stable Infrastructure</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center gap-3 bg-surface border border-white/10 p-1.5 rounded-2xl shadow-xl shadow-black/20">
            <div className={`px-4 py-2 rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest flex items-center gap-3 border ${
              project.last_scan_state === 'COMPLETED' ? 'bg-primary/10 text-primary border-primary/20' :
              project.last_scan_state === 'FAILED' ? 'bg-red-900/20 text-red-500 border-red-900/50' :
              hasActiveScan ? 'bg-blue-900/20 text-blue-400 border-blue-900/50' : 'bg-white/5 text-gray-400 border-white/10'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                project.last_scan_state === 'COMPLETED' ? 'bg-primary shadow-[0_0_5px_#00FF41]' :
                project.last_scan_state === 'FAILED' ? 'bg-red-500 shadow-[0_0_5px_#ef4444]' :
                hasActiveScan ? 'bg-blue-400 animate-pulse' : 'bg-gray-500'
              }`}></div>
              Last State: {project.last_scan_state || 'Offline'}
            </div>
            {project.last_scan_id && (
              <Link 
                to={`/scans/${project.last_scan_id}`}
                className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-xl transition-all group"
                title="Review latest execution"
                aria-label="View latest scan results"
              >
                <ExternalLink className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/projects/${project.project_id}/edit`}
              className="px-4 py-2.5 bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest transition-all flex items-center gap-2 group"
            >
              <PencilLine className="w-3.5 h-3.5 group-hover:text-primary transition-colors" />
              Edit
            </Link>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2.5 bg-red-900/10 border border-red-900/30 text-red-500 hover:bg-red-900/20 rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest transition-all flex items-center gap-2 group"
            >
              <Trash2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              Delete
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-red-900/20 border border-red-500/50 text-red-400 p-6 rounded-3xl flex items-start gap-5 animate-shake shadow-2xl shadow-red-900/20">
          <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg border border-red-500/20">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <div className="font-mono font-bold uppercase tracking-widest text-[10px] mb-1.5 opacity-80">Security Link Interrupted</div>
            <div className="text-sm font-mono leading-relaxed">{error}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Main Configuration Content */}
        <div className="lg:col-span-8 space-y-10">
          <section className="card-container group">
            <div className="px-10 py-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <h3 className="font-mono font-bold text-white tracking-tight uppercase text-xs flex items-center gap-4">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center border border-primary/20 shadow-[0_0_10px_rgba(0,255,65,0.1)]">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                </div>
                Project Blueprint Overview
              </h3>
              <span className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest">Verified Config</span>
            </div>
            
            <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Globe className="w-3 h-3" />
                  Remote Perimeter
                </label>
                <div className="flex items-center justify-between p-3 bg-black/40 rounded-lg border border-white/5 group/item hover:border-primary/30 transition-colors">
                  <div className="text-xs font-mono text-gray-300 truncate mr-4">{project.git_url}</div>
                  <button 
                    onClick={() => handleCopy(project.git_url, 'git')} 
                    className="p-1.5 text-gray-500 hover:text-primary transition-all active:scale-90"
                    aria-label="Copy repository URL"
                  >
                    {copiedField === 'git' ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                  <GitBranch className="w-3 h-3" />
                  Active Branch Delta
                </label>
                <div className="p-3 bg-black/40 rounded-lg border border-white/5 flex items-center">
                  <span className="text-xs font-mono font-bold text-primary uppercase tracking-widest">{project.branch}</span>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Cpu className="w-3 h-3" />
                  SonarQube Reference
                </label>
                <div className="flex items-center justify-between p-3 bg-black/40 rounded-lg border border-white/5 group/item hover:border-primary/30 transition-colors">
                  <div className="text-xs font-mono text-gray-300">{project.sonar_key}</div>
                  <button 
                    onClick={() => handleCopy(project.sonar_key, 'sonar')} 
                    className="p-1.5 text-gray-500 hover:text-primary transition-all active:scale-90"
                    aria-label="Copy sonar project key"
                  >
                    {copiedField === 'sonar' ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                  <MapPin className="w-3 h-3" />
                  Network Infrastructure
                </label>
                <div className="p-3 bg-black/40 rounded-lg border border-white/5 flex items-center justify-between italic">
                  <span className="text-xs font-mono text-gray-500">{project.target_ip || 'DE-CONFIGURED'}</span>
                  {!project.target_ip && <Info className="w-3.5 h-3.5 text-gray-600" />}
                </div>
              </div>

              <div className="space-y-3 md:col-span-2">
                <label className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                  <HardDrive className="w-3 h-3" />
                  Staging/Production Endpoint
                </label>
                <div className="p-4 bg-blue-900/10 rounded-lg border border-blue-900/30 text-xs font-mono text-gray-300 break-all leading-relaxed">
                  {project.target_url || 'Endpoint telemetry unavailable for this blueprint.'}
                </div>
              </div>
            </div>
          </section>

          {/* Historical Intelligence Section */}
          <section className="bg-surface rounded-3xl p-10 border border-white/10 text-white shadow-2xl shadow-black/50 flex flex-col md:flex-row items-center gap-10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 blur-[100px] rounded-full translate-x-32 -translate-y-32 group-hover:bg-primary/10 transition-all duration-1000"></div>
            <div className="w-24 h-24 bg-white/5 rounded-2xl flex items-center justify-center flex-shrink-0 border border-white/10 shadow-2xl group-hover:scale-110 transition-transform duration-500">
              <History className="w-10 h-10 text-primary" />
            </div>
            <div className="flex flex-col md:flex-row items-center gap-8 flex-1 relative z-10">
              <div className="flex-1 text-center md:text-left space-y-2">
                <h3 className="text-2xl font-mono font-bold tracking-tight uppercase">Intelligence Archive</h3>
                <p className="text-gray-500 text-sm font-mono leading-relaxed">Review historical scan data, temporal trends, and compliance reports stored in our secure engine.</p>
              </div>
              <Button 
                variant="outline"
                onClick={() => navigate(`/projects/${project.project_id}/history`)}
                icon={ChevronLeft}
                className="flex-row-reverse"
              >
                Access Archive
              </Button>
            </div>
          </section>
        </div>

        {/* Tactical Engagement Area */}
        <aside className="lg:col-span-4 space-y-8">
          <div className="bg-primary/10 border border-primary/20 rounded-3xl p-8 text-white shadow-[0_0_30px_rgba(0,255,65,0.1)] relative overflow-hidden group">
            <div className="absolute -right-10 -top-10 w-48 h-48 bg-primary/20 rounded-full blur-[60px] group-hover:bg-primary/30 transition-all duration-1000"></div>
            <div className="relative z-10 space-y-6">
              <div>
                <h3 className="text-xl font-mono font-bold mb-2 flex items-center gap-3 uppercase tracking-tighter text-primary">
                  <Zap className="w-5 h-5 fill-current" />
                  Tactical Scan
                </h3>
                <p className="text-primary/80 text-xs font-mono font-medium leading-relaxed opacity-90">Execute the full automated security pipeline across all integrated toolsets immediately.</p>
              </div>
              <Button
                variant="primary"
                onClick={() => setShowConfirm(true)}
                disabled={hasActiveScan}
                fullWidth
                icon={Play}
                className="py-4 text-xs"
              >
                Initialize Engine
              </Button>
            </div>
          </div>

          <div className="bg-surface border border-white/10 rounded-3xl p-8 shadow-xl shadow-black/50 space-y-6 group hover:border-white/20 transition-colors">
            <div>
              <h3 className="text-xl font-mono font-bold mb-2 text-white flex items-center gap-3 uppercase tracking-tighter">
                <Settings2 className="w-5 h-5 text-gray-500 group-hover:text-primary transition-colors" />
                Modular Config
              </h3>
              <p className="text-gray-500 text-xs font-mono font-medium leading-relaxed">Granular control over security stages. Best for troubleshooting specific toolsets.</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => navigate(`/projects/${project.project_id}/manual`)}
              fullWidth
              className="py-4 text-xs"
            >
              Configure Modular
            </Button>
          </div>

          <div className="p-6 bg-white/[0.02] rounded-3xl border border-white/10 border-dashed relative">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm border border-white/5">
                <Info className="w-4 h-4 text-gray-500" />
              </div>
              <p className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest leading-loose">
                Pipeline lock: Only one tactical scan can be active per project. Modular scans are prioritized based on global engine capacity.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* Enhanced Authorization Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-500" onClick={() => setShowConfirm(false)}></div>
          <div className="bg-surface border border-white/10 rounded-3xl max-w-xl w-full p-10 shadow-2xl relative z-10 animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 flex flex-col items-center text-center">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
            <button 
              onClick={() => setShowConfirm(false)} 
              className="absolute top-8 right-8 p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              aria-label="Close authorization prompt"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="w-20 h-20 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-8 shadow-[0_0_20px_rgba(0,255,65,0.1)] relative border border-primary/20">
              <div className="absolute inset-0 bg-primary/20 rounded-2xl animate-ping opacity-20"></div>
              <Zap className="w-10 h-10 fill-current relative z-10" />
            </div>
            
            <h2 className="text-3xl font-mono font-bold text-white tracking-tighter leading-none mb-4 uppercase">Authorize<br/>Tactical Scan?</h2>
            <p className="text-gray-400 font-mono text-sm leading-relaxed mb-10 px-4">
              You are about to trigger a comprehensive security assessment. This will consume pipeline resources and generate fresh telemetry for this perimeter.
            </p>
            
            <div className="flex flex-col w-full gap-4">
              <Button
                variant="primary"
                onClick={handleRunAutomated}
                icon={Play}
                fullWidth
                className="py-4"
              >
                Initialize Scan Cluster
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowConfirm(false)}
                fullWidth
              >
                Abort Operation
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-500" onClick={() => setShowDeleteConfirm(false)}></div>
          <div className="bg-surface border border-white/10 rounded-3xl max-w-xl w-full p-10 shadow-2xl relative z-10 animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 flex flex-col items-center text-center">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50"></div>
            <button 
              onClick={() => setShowDeleteConfirm(false)} 
              className="absolute top-8 right-8 p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              aria-label="Close delete prompt"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="w-20 h-20 bg-red-900/20 text-red-500 rounded-2xl flex items-center justify-center mb-8 shadow-inner relative border border-red-900/50">
              <div className="absolute inset-0 bg-red-900/20 rounded-2xl animate-ping opacity-20"></div>
              <Trash2 className="w-10 h-10 relative z-10" />
            </div>
            
            <h2 className="text-3xl font-mono font-bold text-white tracking-tighter leading-none mb-4 uppercase">Delete<br/>Project?</h2>
            <p className="text-gray-400 font-mono text-sm leading-relaxed mb-10 px-4">
              This will permanently remove the project, its scans, and stored artifacts. This action cannot be undone.
            </p>
            
            <div className="flex flex-col w-full gap-4">
              <Button
                variant="danger"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                icon={Trash2}
                fullWidth
                className="py-4"
              >
                Confirm Delete
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowDeleteConfirm(false)}
                fullWidth
              >
                Abort Operation
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectControlPage;
