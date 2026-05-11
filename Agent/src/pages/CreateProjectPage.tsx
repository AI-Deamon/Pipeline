import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, Globe, Shield, ChevronLeft } from 'lucide-react';
import { api } from '../services/api';
import { ProjectForm, type ProjectFormValues } from '../components/ProjectForm';
import { ApiError } from '../utils/apiError';
import { useToast } from '../components/Toast';

const CreateProjectPage = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const initialValues: ProjectFormValues = useMemo(
    () => ({
      name: '',
      git_url: '',
      branch: 'main',
      credentials_id: 'github-credentials',
      sonar_key: '',
      target_ip: '',
      target_url: '',
    }),
    []
  );

  const handleCreate = async (values: ProjectFormValues) => {
    try {
      const project = await api.projects.create(values);
      addToast({
        type: 'success',
        title: 'Project Created',
        message: `"${project.name}" has been initialized successfully!`,
      });
      setTimeout(() => {
        navigate(`/projects/${project.project_id}`);
      }, 1500);
      return `Project "${project.name}" initialized successfully!`;
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Creation Failed',
        message: ApiError.getErrorMessage(err, 'Project initialization failed. Check server logs.'),
      });
      throw new Error(ApiError.getErrorMessage(err, 'Project initialization failed. Check server logs.'));
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex flex-col lg:flex-row gap-12">
        <div className="lg:w-1/3 space-y-10">
          <div className="animate-in fade-in slide-in-from-left-4 duration-700">
            <button
              onClick={() => navigate('/dashboard')}
              className="mb-8 p-3 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 rounded-2xl transition-all active:scale-95 shadow-sm flex items-center gap-2 group"
            >
              <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              <span className="text-xs font-black uppercase tracking-widest pr-2">Back to Fleet</span>
            </button>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-4 leading-none uppercase">Initialize<br/>Blueprint</h1>
            <p className="text-slate-500 font-medium leading-relaxed text-sm">
              Register a new repository into the automated defense perimeter. Our engine will map dependencies and establish a persistent scan profile.
            </p>
          </div>

          <div className="space-y-4 animate-in fade-in slide-in-from-left-6 duration-700 delay-150">
            <div className="group p-6 bg-white border border-slate-200 rounded-[2rem] shadow-sm hover:shadow-xl hover:shadow-blue-900/5 transition-all">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <GitBranch className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Git Perimeter</h4>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">Continuous monitoring of branch delta and security posture.</p>
            </div>
            
            <div className="group p-6 bg-white border border-slate-200 rounded-[2rem] shadow-sm hover:shadow-xl hover:shadow-green-900/5 transition-all">
              <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Shield className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Static Analysis</h4>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">SonarQube integration for deep-code vulnerability discovery.</p>
            </div>

            <div className="group p-6 bg-white border border-slate-200 rounded-[2rem] shadow-sm hover:shadow-xl hover:shadow-amber-900/5 transition-all">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Globe className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">DAST Integration</h4>
              <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">Dynamic testing against live infrastructure and endpoints.</p>
            </div>
          </div>
        </div>

        <div className="flex-1 animate-in fade-in zoom-in-95 duration-700">
          <ProjectForm
            initialValues={initialValues}
            onSubmit={handleCreate}
            submitLabel="Initialize Project"
          />
        </div>
      </div>
    </div>
  );
};

export default CreateProjectPage;
