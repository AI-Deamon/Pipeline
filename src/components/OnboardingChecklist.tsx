import { useState } from 'react';
import { X, Shield, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const ONBOARDED_KEY = 'sentinel_onboarded';

const steps = [
  { id: 'create', label: 'Create your first project', path: '/projects/create', done: false },
  { id: 'scan', label: 'Trigger a security scan', path: '', done: false },
  { id: 'review', label: 'Review findings in the Issues tab', path: '/issues', done: false },
  { id: 'assign', label: 'Assign an issue to yourself', path: '/my-issues', done: false },
];

export function OnboardingChecklist() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(ONBOARDED_KEY) === 'true';
  });

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(ONBOARDED_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 mb-8 relative">
      <button
        onClick={dismiss}
        className="absolute top-4 right-4 p-1 text-blue-400 hover:text-blue-600 transition-colors"
        aria-label="Dismiss onboarding"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
          <Shield className="w-6 h-6 text-blue-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Welcome to Sentinel</h2>
          <p className="text-sm text-slate-600 mb-4">
            Your security command center. Here is how to get started:
          </p>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={step.id} className="flex items-center gap-3 text-sm">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                {step.path ? (
                  <Link to={step.path} className="text-blue-700 hover:text-blue-900 hover:underline font-medium">
                    {step.label}
                  </Link>
                ) : (
                  <span className="text-slate-700 font-medium">{step.label}</span>
                )}
                {i < steps.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />}
              </li>
            ))}
          </ol>
          <button
            onClick={dismiss}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
