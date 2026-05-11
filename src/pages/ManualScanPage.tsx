import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Play, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { FIXED_STAGES, STAGE_DISPLAY_NAMES, type StageId } from '../types';
import { PageSkeleton } from '../components/PageSkeleton';

const ManualScanPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<{ name: string; git_url: string; branch: string; target_ip?: string; target_url?: string; project_id: string } | null>(null);
  const [selectedStages, setSelectedStages] = useState<StageId[]>([]);
  const [error, setError] = useState<string | null>(null);
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
        setError('Failed to load project.');
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

    if (selectedStages.length === 0) {
      setError('Please select at least one scan stage.');
      return;
    }

    setIsLoading(true);
    try {
      const scan = await api.scans.trigger(projectId!, 'manual', selectedStages);
      setTimeout(() => {
        navigate(`/scans/${scan.scan_id}`);
      }, 1000);
    } catch (err: unknown) {
      const errorMessage = err && typeof err === 'object' && 'response' in err
        ? (err.response as { data?: { detail?: string } })?.data?.detail
        : 'Failed to start scan.';
      setError(errorMessage || 'Failed to start scan.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isProjectLoading) return <PageSkeleton type="scan" />;

  if (!project) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Project not found</h2>
        <p className="text-slate-500 mb-6">This project may have been deleted.</p>
        <button onClick={() => navigate('/dashboard')} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium">
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-8 pb-20">
      <header className="flex items-center gap-4 mb-8">
        <Link
          to={`/projects/${projectId}`}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">Custom Scan</h1>
          <p className="text-sm text-slate-500">Project: {project.name}</p>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-slate-900">Select Stages</h2>
            <button
              type="button"
              onClick={handleToggleAll}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              {selectedStages.length === FIXED_STAGES.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FIXED_STAGES.map((stage) => {
              const isSelected = selectedStages.includes(stage);
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => handleStageToggle(stage)}
                  className={`p-4 rounded-lg border text-left flex items-center gap-3 transition-colors ${
                    isSelected
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {isSelected ? (
                    <CheckCircle className="w-5 h-5 text-slate-900" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-300" />
                  )}
                  <div>
                    <div className="font-medium text-slate-900">{STAGE_DISPLAY_NAMES[stage]}</div>
                    <div className="text-sm text-slate-500">{stage}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isLoading || selectedStages.length === 0}
            className="flex-1 py-3 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Start Scan ({selectedStages.length} stages)
          </button>
          <Link
            to={`/projects/${projectId}`}
            className="px-4 py-3 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
};

export default ManualScanPage;