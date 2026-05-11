import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  GitBranch, 
  Globe, 
  Shield, 
  ChevronLeft, 
  ArrowRight, 
  Hash,
  Key,
  MapPin,
  CheckCircle2
} from 'lucide-react';
import { api } from '../services/api';
import { ApiError } from '../utils/apiError';
import { useToast } from '../components/Toast';

type Step = 1 | 2 | 3;

interface FormData {
  name: string;
  git_url: string;
  branch: string;
  credentials_id: string;
  sonar_key: string;
  target_ip: string;
  target_url: string;
}

const initialFormData: FormData = {
  name: '',
  git_url: '',
  branch: 'main',
  credentials_id: 'github-credentials',
  sonar_key: '',
  target_ip: '',
  target_url: '',
};

const CreateProjectPage = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isLoading, setIsLoading] = useState(false);

  const steps = [
    { num: 1, label: 'Project', icon: Shield },
    { num: 2, label: 'Repository', icon: GitBranch },
    { num: 3, label: 'Analysis', icon: Globe },
  ];

  const validateStep = (currentStep: Step): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    
    if (currentStep === 1) {
      if (!formData.name.trim()) newErrors.name = 'Project name is required';
      if (!formData.sonar_key.trim()) newErrors.sonar_key = 'Sonar project key is required';
    } else if (currentStep === 2) {
      if (!formData.git_url.trim()) {
        newErrors.git_url = 'Git URL is required';
      } else {
        try {
          new URL(formData.git_url);
        } catch {
          newErrors.git_url = 'Invalid URL format';
        }
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((prev) => Math.min(prev + 1, 3) as Step);
    }
  };

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 1) as Step);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleCreate = async () => {
    if (!validateStep(3)) return;
    
    setIsLoading(true);
    try {
      const project = await api.projects.create(formData);
      addToast({
        type: 'success',
        title: 'Project Created',
        message: `"${project.name}" has been initialized successfully!`,
      });
      setTimeout(() => {
        navigate(`/projects/${project.project_id}`);
      }, 1500);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Creation Failed',
        message: ApiError.getErrorMessage(err, 'Project initialization failed. Check server logs.'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    {
      icon: GitBranch,
      title: 'Native Git Integration',
      description: 'Seamlessly connect GitHub, GitLab, or Bitbucket with OAuth2 security.',
    },
    {
      icon: Shield,
      title: 'SAST Analysis',
      description: 'Static analysis scans your code for vulnerabilities before every deployment.',
    },
    {
      icon: Globe,
      title: 'Dynamic DAST Scans',
      description: 'Simulate real-world attacks against your live environment in real-time.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#fafafa] flex overflow-hidden">
      {/* Left Sidebar */}
      <aside className="hidden lg:flex lg:w-[400px] flex-col p-8 border-r border-slate-200 bg-white sticky top-0 h-screen justify-between">
        <div className="space-y-8">
          <div>
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors mb-6"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm">Back to Dashboard</span>
            </button>
            <h1 className="text-2xl font-semibold text-slate-900 leading-tight mb-3">
              Create your next secure project.
            </h1>
            <p className="text-slate-500 text-sm leading-relaxed">
              Configure your security pipeline in minutes. Connect your source, define rules, and start scanning.
            </p>
          </div>

          <div className="space-y-4">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex gap-4 hover:border-slate-300 hover:bg-white transition-all cursor-default"
              >
                <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-900 mb-1">{feature.title}</h3>
                  <p className="text-xs text-slate-500">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-6 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-400">Compatible with 24+ runtimes</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto py-12 px-8 lg:px-16 flex flex-col items-center">
        <div className="w-full max-w-xl">
          {/* Stepper */}
          <nav className="mb-10 flex justify-between items-center">
            <div className="flex items-center gap-6 w-full">
              {steps.map((s, idx) => (
                <div key={s.num} className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      step === s.num
                        ? 'bg-slate-900 text-white'
                        : step > s.num
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                  </div>
                  <span
                    className={`text-sm transition-colors ${
                      step === s.num ? 'text-slate-900 font-medium' : step > s.num ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    {s.label}
                  </span>
                  {idx < steps.length - 1 && (
                    <div className={`w-8 h-0.5 ml-2 transition-all ${step > s.num ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                  )}
                </div>
              ))}
            </div>
          </nav>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              {step === 1 && 'Project Details'}
              {step === 2 && 'Repository Configuration'}
              {step === 3 && 'Analysis Setup'}
            </h2>
            <p className="text-slate-500 text-sm">
              {step === 1 && "Start by defining the identity of your new security workspace."}
              {step === 2 && "Connect your source code repository for scanning."}
              {step === 3 && "Configure your scanning targets and parameters."}
            </p>
          </div>

          {/* Form */}
          <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
            {step === 1 && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="name">
                    Project Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g. Apollo Microservice"
                    className={`w-full bg-white border ${errors.name ? 'border-rose-500' : 'border-slate-200'} rounded-lg px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all`}
                  />
                  {errors.name && <p className="text-rose-500 text-xs">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="sonar_key">
                    Sonar Project Key
                  </label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      id="sonar_key"
                      name="sonar_key"
                      value={formData.sonar_key}
                      onChange={handleInputChange}
                      placeholder="e.g. fintech-app-core"
                      className={`w-full bg-white border ${errors.sonar_key ? 'border-rose-500' : 'border-slate-200'} rounded-lg pl-11 pr-4 py-3 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all`}
                    />
                  </div>
                  {errors.sonar_key && <p className="text-rose-500 text-xs">{errors.sonar_key}</p>}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="git_url">
                    Git Repository URL
                  </label>
                  <div className="relative">
                    <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      id="git_url"
                      name="git_url"
                      value={formData.git_url}
                      onChange={handleInputChange}
                      placeholder="https://github.com/org/repo.git"
                      className={`w-full bg-white border ${errors.git_url ? 'border-rose-500' : 'border-slate-200'} rounded-lg pl-11 pr-4 py-3 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all`}
                    />
                  </div>
                  {errors.git_url && <p className="text-rose-500 text-xs">{errors.git_url}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="branch">
                      Branch
                    </label>
                    <input
                      type="text"
                      id="branch"
                      name="branch"
                      value={formData.branch}
                      onChange={handleInputChange}
                      placeholder="main"
                      className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="credentials_id">
                      Credentials ID
                    </label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        id="credentials_id"
                        name="credentials_id"
                        value={formData.credentials_id}
                        onChange={handleInputChange}
                        placeholder="github-credentials"
                        className="w-full bg-white border border-slate-200 rounded-lg pl-11 pr-4 py-3 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="target_ip">
                    Target IP <span className="text-slate-400">(Optional)</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      id="target_ip"
                      name="target_ip"
                      value={formData.target_ip}
                      onChange={handleInputChange}
                      placeholder="192.168.1.1"
                      className="w-full bg-white border border-slate-200 rounded-lg pl-11 pr-4 py-3 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="target_url">
                    Target URL <span className="text-slate-400">(Optional)</span>
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      id="target_url"
                      name="target_url"
                      value={formData.target_url}
                      onChange={handleInputChange}
                      placeholder="https://example.com"
                      className="w-full bg-white border border-slate-200 rounded-lg pl-11 pr-4 py-3 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Pro Tip */}
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 flex gap-3 items-start">
              <Shield className="text-emerald-600 w-5 h-5 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-emerald-700 font-medium text-sm mb-1">Pro Tip</h4>
                <p className="text-emerald-600 text-sm leading-relaxed">
                  Use descriptive names to help your team identify projects quickly. You can change these settings later in the workspace dashboard.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 flex justify-between items-center">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-slate-500 hover:text-slate-700 font-medium transition-colors"
                >
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="text-slate-500 hover:text-slate-700 font-medium transition-colors"
                >
                  Cancel
                </button>
              )}

              {step < 3 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-medium px-6 py-3 rounded-lg transition-all flex items-center gap-2"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isLoading}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-medium px-6 py-3 rounded-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Create Project <CheckCircle2 className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateProjectPage;