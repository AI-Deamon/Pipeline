import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, GitBranch, Hash, Key, Loader2, MapPin, Globe } from 'lucide-react';
import { FormInput } from './FormInput';

export type ProjectFormValues = {
  name: string;
  git_url: string;
  branch: string;
  credentials_id: string;
  sonar_key: string;
  target_ip?: string;
  target_url?: string;
};

type ProjectFormProps = {
  initialValues: ProjectFormValues;
  onSubmit: (values: ProjectFormValues) => Promise<string | void>;
  submitLabel: string;
  locked?: boolean;
  lockedMessage?: string;
};

export const ProjectForm = ({
  initialValues,
  onSubmit,
  submitLabel,
  locked = false,
  lockedMessage,
}: ProjectFormProps) => {
  const [formData, setFormData] = useState<ProjectFormValues>(initialValues);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setFormData(initialValues);
  }, [initialValues]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!formData.name.trim()) e.name = 'Project name is required';

    if (!formData.git_url.trim()) {
      e.git_url = 'Git URL is required';
    } else {
      try {
        new URL(formData.git_url);
      } catch {
        e.git_url = 'Invalid URL format (e.g., https://github.com/org/repo.git)';
      }
    }

    if (!formData.sonar_key.trim()) e.sonar_key = 'Sonar project key is required';

    if (formData.target_ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(formData.target_ip)) {
      e.target_ip = 'Invalid IPv4 address format';
    }

    if (formData.target_url) {
      try {
        new URL(formData.target_url);
      } catch {
        e.target_url = 'Invalid URL format (e.g., https://example.com)';
      }
    }

    return e;
  }, [formData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTouched((prev) => ({ ...prev, [e.target.name]: true }));
  };

  const isFormValid = Object.keys(errors).length === 0;
  const isBlocked = locked || isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const allTouched = Object.keys(formData).reduce((acc, key) => ({ ...acc, [key]: true }), {});
    setTouched(allTouched);

    if (!isFormValid || locked) return;

    setIsLoading(true);
    try {
      const message = await onSubmit(formData);
      if (message) {
        setSuccessMessage(message);
      }
    } catch (err: any) {
      setError(err?.message || 'Project update failed. Check server logs.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[3rem] shadow-2xl shadow-slate-200/50 overflow-hidden">
      <div className="bg-slate-50/50 border-b border-slate-100 px-10 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">System Configuration Mode</span>
        </div>
        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest">v2.0 Stable</span>
      </div>

      <form onSubmit={handleSubmit} className="p-10 space-y-12">
        {locked && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 p-5 rounded-[1.5rem] flex items-start gap-4">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div className="text-xs font-bold leading-relaxed">
              {lockedMessage || 'Edits are disabled while a scan is active for this project.'}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-5 rounded-[1.5rem] flex items-start gap-4 animate-shake">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div className="text-xs font-bold leading-relaxed">{error}</div>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 border border-green-100 text-green-600 p-5 rounded-[1.5rem] flex items-start gap-4">
            <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div className="text-xs font-bold leading-relaxed">{successMessage}</div>
          </div>
        )}

        <section className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center text-xs font-black italic">01</div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Identity & Branding</h3>
          </div>
          <div className="grid grid-cols-1 gap-8">
            <FormInput
              id="name"
              name="name"
              label="Internal Project Name"
              placeholder="e.g. Phoenix Banking API"
              value={formData.name}
              onChange={handleInputChange}
              onBlur={handleBlur}
              error={touched.name ? errors.name : undefined}
              touched={touched.name}
              required
              disabled={isBlocked}
            />
          </div>
        </section>

        <section className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center text-xs font-black italic">02</div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Source Control Link</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FormInput
              id="git_url"
              name="git_url"
              label="Remote Repository URL"
              icon={GitBranch}
              placeholder="https://github.com/org/repo.git"
              value={formData.git_url}
              onChange={handleInputChange}
              onBlur={handleBlur}
              error={touched.git_url ? errors.git_url : undefined}
              touched={touched.git_url}
              required
              disabled={isBlocked}
            />
            <FormInput
              id="branch"
              name="branch"
              label="Default Scan Branch"
              placeholder="main"
              value={formData.branch}
              onChange={handleInputChange}
              helpText="Target branch for automated pipeline triggers."
              disabled={isBlocked}
            />
          </div>
          <FormInput
            id="credentials_id"
            name="credentials_id"
            label="Handshake Credentials (ID)"
            icon={Key}
            placeholder="e.g. jenkins-git-ssh"
            value={formData.credentials_id}
            onChange={handleInputChange}
            helpText="The unique identifier for the credentials stored in the scan cluster."
            required
            disabled={isBlocked}
          />
        </section>

        <section className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center text-xs font-black italic">03</div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Intelligence Mapping</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FormInput
              id="sonar_key"
              name="sonar_key"
              label="Sonar Project Reference"
              icon={Hash}
              placeholder="e.g. fintech-app-core"
              value={formData.sonar_key}
              onChange={handleInputChange}
              onBlur={handleBlur}
              error={touched.sonar_key ? errors.sonar_key : undefined}
              touched={touched.sonar_key}
              required
              disabled={isBlocked}
            />
            <FormInput
              id="target_ip"
              name="target_ip"
              label="Infrastructure IP"
              icon={MapPin}
              placeholder="Optional"
              value={formData.target_ip || ''}
              onChange={handleInputChange}
              onBlur={handleBlur}
              error={touched.target_ip ? errors.target_ip : undefined}
              touched={touched.target_ip}
              disabled={isBlocked}
            />
          </div>
          <FormInput
            id="target_url"
            name="target_url"
            label="Production Endpoint"
            icon={Globe}
            placeholder="https://example.com"
            value={formData.target_url || ''}
            onChange={handleInputChange}
            onBlur={handleBlur}
            error={touched.target_url ? errors.target_url : undefined}
            touched={touched.target_url}
            disabled={isBlocked}
          />
        </section>

        <div className="pt-4">
          <button
            type="submit"
            disabled={isBlocked || !isFormValid}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-2xl shadow-blue-200 flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
};
