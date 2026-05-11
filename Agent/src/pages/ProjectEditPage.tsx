import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, PencilLine } from 'lucide-react';
import { api } from '../services/api';
import type { Project } from '../types';
import { ProjectForm, type ProjectFormValues } from '../components/ProjectForm';
import { ApiError } from '../utils/apiError';
import { PageSkeleton } from '../components/PageSkeleton';

const ACTIVE_STATES = new Set(['CREATED', 'QUEUED', 'RUNNING']);

const ProjectEditPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProject = async () => {
      if (!projectId) {
        setError('Missing project identifier');
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await api.projects.get(projectId);
        if (!data) {
          setError('Project not found');
        } else {
          setProject(data);
        }
      } catch (err: any) {
        setError(ApiError.getErrorMessage(err, 'Failed to load project details'));
      } finally {
        setLoading(false);
      }
    };
    loadProject();
  }, [projectId]);

  const initialValues: ProjectFormValues = useMemo(
    () => ({
      name: project?.name || '',
      git_url: project?.git_url || '',
      branch: project?.branch || 'main',
      credentials_id: project?.credentials_id || '',
      sonar_key: project?.sonar_key || '',
      target_ip: project?.target_ip || '',
      target_url: project?.target_url || '',
    }),
    [project]
  );

  const handleUpdate = async (values: ProjectFormValues) => {
    if (!projectId) return;
    try {
      const updated = await api.projects.update(projectId, values);
      setProject(updated);
      return `Project "${updated.name}" updated successfully!`;
    } catch (err: any) {
      throw new Error(ApiError.getErrorMessage(err, 'Project update failed. Check server logs.'));
    }
  };

  if (loading) return <PageSkeleton type="form" />;

  if (error || !project) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center space-y-6 bg-white border border-slate-200 rounded-[3rem] shadow-xl shadow-slate-100">
        <div className="w-20 h-20 bg-red-50 text-red-600 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-inner">
          <AlertCircle className="w-10 h-10" />
        </div>
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase mb-2 leading-none">Project Not Found</h2>
          <p className="text-slate-500 font-medium leading-relaxed italic">{error || 'The project could not be loaded.'}</p>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-200"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const isLocked = ACTIVE_STATES.has(project.last_scan_state || '');

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="p-3 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 rounded-2xl transition-all active:scale-95 shadow-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none mb-1 uppercase">Edit Project</h1>
            <p className="text-slate-500 text-sm font-medium">Update configuration and pipeline metadata for {project.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-600 shadow-sm">
          <PencilLine className="w-4 h-4 text-blue-600" />
          Blueprint Editor
        </div>
      </div>

      <ProjectForm
        initialValues={initialValues}
        onSubmit={handleUpdate}
        submitLabel="Save Changes"
        locked={isLocked}
        lockedMessage="Project edits are disabled while a scan is running. Wait for the scan to finish or cancel it before editing."
      />
    </div>
  );
};

export default ProjectEditPage;
