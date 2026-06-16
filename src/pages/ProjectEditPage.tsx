import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { AlertCircle, ChevronLeft } from 'lucide-react';
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
        setError('Missing project ID');
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
      } catch (err: unknown) {
        setError(ApiError.getErrorMessage(err, 'Failed to load project'));
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
    } catch (err: unknown) {
      throw new Error(ApiError.getErrorMessage(err, 'Update failed'));
    }
  };

  if (loading) return <PageSkeleton type="form" />;

  if (error || !project) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Project not found</h2>
        <p className="text-slate-500 mb-6">{error || 'Could not load project'}</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  const isLocked = ACTIVE_STATES.has(project.last_scan_state || '');

  return (
    <div className="max-w-2xl mx-auto p-8 pb-20">
      <header className="flex items-center gap-4 mb-8">
        <Link
          to={`/projects/${projectId}`}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">Edit Project</h1>
          <p className="text-sm text-slate-500">{project.name}</p>
        </div>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <ProjectForm
          initialValues={initialValues}
          onSubmit={handleUpdate}
          submitLabel="Save Changes"
          locked={isLocked}
          lockedMessage="Cannot edit while a scan is running."
        />
      </div>
    </div>
  );
};

export default ProjectEditPage;