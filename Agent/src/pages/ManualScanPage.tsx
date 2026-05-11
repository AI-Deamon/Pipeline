import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, AlertCircle, CheckCircle, Loader2, Zap, Settings2, Shield, Info, Cpu, Globe, MapPin } from 'lucide-react';
import { api } from '../services/api';
import { FIXED_STAGES, STAGE_DISPLAY_NAMES, type StageId } from '../types';
import { PageSkeleton } from '../components/PageSkeleton';

const ManualScanPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<{ name: string; git_url: string; branch: string; target_ip?: string; target_url?: string; project_id: string } | null>(null);
  const [scanMode, setScanMode] = useState<'automated' | 'manual'>('manual');
  const [selectedStages, setSelectedStages] = useState<StageId[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProjectLoading, setIsProjectLoading] = useState(true);

  useEffect(() => {
    const fetchProject = async () => {
      if (!projectId) return;
      setIsProjectLoading(true);
      try {
        const projectData = await api.projects.get(projectId);
        if (projectData) {
          setProject(projectData);
        }
      } catch (err) {
        console.error('Failed to fetch project:', err);
        setError('Connection interrupted. Failed to load project blueprint.');
      } finally {
        setIsProjectLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  const handleStageToggle = (stage: StageId) => {
    setSelectedStages(prev =>
      prev.includes(stage)
        ? prev.filter(s => s !== stage)
        : [...prev, stage]
    );
  };

  const handleToggleAll = () => {
    if (selectedStages.length === FIXED_STAGES.length) {
      setSelectedStages([]);
    } else {
      setSelectedStages([...FIXED_STAGES]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (scanMode === 'manual' && selectedStages.length === 0) {
      setError('Operational requirement: Select at least one stage for manual execution.');
      return;
    }

    setIsLoading(true);
    try {
      const scan = await api.scans.trigger(
        projectId!,
        scanMode,
        scanMode === 'manual' ? selectedStages : undefined
      );
      setSuccessMessage(`Scan initialized. Execution ID: ${scan.scan_id}`);
      setTimeout(() => {
        navigate(`/scans/${scan.scan_id}`);
      }, 1500);
    } catch (err: unknown) {
      console.error('Scan trigger failed', err);
      const errorMessage = err && typeof err === 'object' && 'response' in err
        ? (err.response as { data?: { detail?: string } })?.data?.detail
        : 'Engine trigger failed. Verify cluster connectivity.';
      setError(errorMessage || 'Trigger failed.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isProjectLoading) return <PageSkeleton type="scan" />;

  if (!project) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center space-y-6">
        <div className="w-20 h-20 bg-red-50 text-red-600 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-inner border border-red-100">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Blueprint Not Found</h2>
        <p className="text-slate-500 font-medium italic">The requested project perimeter is unavailable.</p>
        <button onClick={() => navigate('/dashboard')} className="btn-primary">Return to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-32 px-4">
      {/* Page Header */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="p-4 bg-white border border-slate-200 text-slate-400 hover:text-slate-900 rounded-2xl transition-all active:scale-90 shadow-sm group"
            aria-label="Back to project overview"
          >
            <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
          </button>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em]">Execution Configuration</span>
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter leading-none uppercase">Modular Scan Portal</h1>
            <div className="flex items-center gap-3 text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-widest font-mono bg-slate-100 px-2 py-0.5 rounded">Project: {project.name}</span>
              <div className="w-1 h-1 bg-slate-200 rounded-full"></div>
              <span className="text-[10px] font-bold uppercase tracking-widest italic opacity-70">Manual Stage Allocation</span>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-[2.5rem] flex items-start gap-5 animate-shake shadow-2xl shadow-red-100">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg border border-red-100">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <div className="font-black uppercase tracking-widest text-[10px] mb-1.5 opacity-80">Configuration Blocked</div>
            <div className="text-sm font-bold leading-relaxed">{error}</div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-6 rounded-[2.5rem] flex items-start gap-5 animate-in fade-in duration-500 shadow-2xl shadow-green-100">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg border border-green-100">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <div className="font-black uppercase tracking-widest text-[10px] mb-1.5 opacity-80">Command Authorized</div>
            <div className="text-sm font-bold leading-relaxed">{successMessage}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        {/* Main Selection Area */}
        <div className="lg:col-span-8 space-y-12">
          <section className="card-container">
            <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-black text-slate-900 tracking-tight uppercase text-xs flex items-center gap-4">
                <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                  <Cpu className="w-4 h-4 text-white" />
                </div>
                Modular Stage Allocation
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedStages.length} Stages Armed</span>
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
              </div>
            </div>

            <div className="p-10 space-y-10">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-slate-900 uppercase">Available Security Toolsets</h4>
                  <p className="text-xs text-slate-400 font-medium">Select specific stages to execute in this modular cycle.</p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleAll}
                  className="px-6 py-2.5 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-200"
                >
                  {selectedStages.length === FIXED_STAGES.length ? 'Deselect All' : 'Arm All Stages'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FIXED_STAGES.map((stageId) => {
                  const isSelected = selectedStages.includes(stageId);
                  return (
                    <label
                      key={stageId}
                      className={`group flex items-center gap-5 p-5 rounded-3xl border-2 transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-blue-50/50 border-blue-600 shadow-xl shadow-blue-900/5 ring-4 ring-blue-500/5' 
                          : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all ${
                        isSelected ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 group-hover:text-blue-500'
                      }`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleStageToggle(stageId)}
                          className="sr-only"
                        />
                        {isSelected ? <CheckCircle className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[11px] font-black uppercase tracking-tight transition-colors ${isSelected ? 'text-blue-950' : 'text-slate-700'}`}>
                          {STAGE_DISPLAY_NAMES[stageId]}
                        </div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 opacity-70">Security Stage ID: {stageId}</div>
                      </div>
                      <div className={`w-2 h-2 rounded-full transition-all duration-500 ${isSelected ? 'bg-blue-500 scale-125 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-slate-200 scale-100'}`}></div>
                    </label>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Infrastructure Context Section */}
          <section className="bg-slate-900 rounded-[3rem] p-12 text-white shadow-2xl shadow-blue-900/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[100px] rounded-full translate-x-32 -translate-y-32 group-hover:bg-blue-600/20 transition-all duration-1000"></div>
            <div className="flex flex-col md:flex-row items-center gap-12 relative z-10">
              <div className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center flex-shrink-0 border border-white/10 shadow-inner group-hover:rotate-12 transition-transform duration-500">
                <Globe className="w-10 h-10 text-blue-400" />
              </div>
              <div className="flex-1 space-y-6">
                <div>
                  <h3 className="text-2xl font-black tracking-tight uppercase leading-none mb-3">Cluster Intelligence</h3>
                  <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-lg">Current blueprint connectivity verified. Modular scan will inherit these perimeter parameters for execution.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      <MapPin className="w-3 h-3" /> Network Target
                    </div>
                    <div className="text-xs font-bold font-mono tracking-wider">{project.target_ip || 'DE-CONFIGURED'}</div>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      <Globe className="w-3 h-3" /> Live Endpoint
                    </div>
                    <div className="text-xs font-bold truncate max-w-[150px]">{project.target_url || 'UNAVAILABLE'}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar Controls */}
        <aside className="lg:col-span-4 space-y-10">
          <section className="bg-white border border-slate-200 rounded-[3rem] p-10 shadow-2xl shadow-slate-200/50 space-y-10 group">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-4">
              <div className="w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Shield className="w-4 h-4 text-blue-400" />
              </div>
              Authorization Hub
            </h3>

            <div className="space-y-8">
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Operational Mode</label>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { id: 'automated', label: 'Tactical Sync', desc: 'All stages automatically armed', icon: Zap },
                    { id: 'manual', label: 'Modular Flow', desc: 'Granular operator control', icon: Settings2 }
                  ].map((mode) => {
                    const isSelected = scanMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setScanMode(mode.id as any)}
                        className={`flex items-center gap-4 p-5 rounded-3xl border-2 transition-all text-left ${
                          isSelected 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-200' 
                            : 'bg-white border-slate-100 text-slate-600 hover:border-slate-200'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-white/20 border border-white/30 backdrop-blur-md' : 'bg-slate-50 text-slate-400'
                        }`}>
                          <mode.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className={`text-xs font-black uppercase tracking-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>{mode.label}</div>
                          <div className={`text-[10px] font-bold ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>{mode.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-8 border-t border-slate-50 space-y-4">
                <button
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className="w-full btn-primary h-20 uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-4 shadow-2xl shadow-blue-900/20"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin h-5 w-5" />
                      Engaging Cluster...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current" />
                      Initialize Engine
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${projectId}`)}
                  className="w-full btn-secondary h-16 uppercase tracking-[0.2em] text-[10px]"
                >
                  Abort Operation
                </button>
              </div>
            </div>
          </section>

          <div className="p-8 bg-slate-50/50 rounded-[2.5rem] border border-slate-200 border-dashed relative">
            <div className="flex items-start gap-5">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm border border-slate-100">
                <Info className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-loose">
                Operational Note: Manual stage allocation allows for troubleshooting specific perimeter nodes. Cluster resources are prioritized based on operator intent.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ManualScanPage;
