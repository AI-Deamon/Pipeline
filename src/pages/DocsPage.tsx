import { useState } from 'react';
import { 
  BookOpen, 
  Shield, 
  Globe, 
  Database, 
  Server, 
  Code, 
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitBranch,
  Container,
  Search,
  Activity,
  Layers,
  Zap,
  Cpu
} from 'lucide-react';

type TabId = 'overview' | 'api' | 'techstack' | 'limitations' | 'architecture';

const tabs = [
  { id: 'overview' as const, label: 'Overview', icon: BookOpen },
  { id: 'api' as const, label: 'API Reference', icon: Zap },
  { id: 'techstack' as const, label: 'Tech Stack', icon: Cpu },
  { id: 'limitations' as const, label: 'Limitations', icon: AlertTriangle },
  { id: 'architecture' as const, label: 'Architecture', icon: Layers },
];

const features = [
  {
    icon: GitBranch,
    title: 'Git Repository Scanning',
    description: 'Automatic security scanning of GitHub repositories with branch selection',
    color: 'blue'
  },
  {
    icon: Shield,
    title: 'Multi-Tool Security Analysis',
    description: 'SonarQube, OWASP Dependency Check, Trivy, Nmap, and ZAP integration',
    color: 'green'
  },
  {
    icon: Container,
    title: 'Docker Security',
    description: 'Build Docker images and scan for vulnerabilities in containers',
    color: 'amber'
  },
  {
    icon: Activity,
    title: 'Real-time Monitoring',
    description: 'WebSocket-based live progress tracking during scans',
    color: 'purple'
  },
  {
    icon: Database,
    title: 'Project Management',
    description: 'Create, manage, and track security scans across multiple projects',
    color: 'indigo'
  },
  {
    icon: Search,
    title: 'Detailed Reports',
    description: 'Comprehensive vulnerability reports with fix recommendations',
    color: 'red'
  }
];

const limitations = [
  'Single active scan per project (must cancel/reset to start new)',
  '2-hour default scan timeout (configurable via SCAN_TIMEOUT)',
  'Callback token required for Jenkins to Backend communication',
  'External repos: Docker build context must be repository root',
  'One active scan per project - database constraint ix_scans_project_state',
  'ZAP active scan requires target URL to be registered first'
];

const apiEndpoints = [
  {
    category: 'Authentication',
    endpoints: [
      { method: 'POST', path: '/api/v1/auth/login', description: 'Login with username/password' },
      { method: 'POST', path: '/api/v1/auth/register', description: 'Register new user' }
    ]
  },
  {
    category: 'Projects',
    endpoints: [
      { method: 'GET', path: '/api/v1/projects', description: 'List all projects' },
      { method: 'POST', path: '/api/v1/projects', description: 'Create new project' },
      { method: 'GET', path: '/api/v1/projects/{project_id}', description: 'Get project details' },
      { method: 'PUT', path: '/api/v1/projects/{project_id}', description: 'Update project' },
      { method: 'DELETE', path: '/api/v1/projects/{project_id}', description: 'Delete project' }
    ]
  },
  {
    category: 'Scans',
    endpoints: [
      { method: 'GET', path: '/api/v1/scans', description: 'List all scans' },
      { method: 'POST', path: '/api/v1/scans', description: 'Trigger new scan' },
      { method: 'GET', path: '/api/v1/scans/{scan_id}', description: 'Get scan details' },
      { method: 'GET', path: '/api/v1/scans/{scan_id}/results', description: 'Get scan results' },
      { method: 'POST', path: '/api/v1/scans/{scan_id}/reset', description: 'Reset failed scan' },
      { method: 'POST', path: '/api/v1/scans/{scan_id}/cancel', description: 'Cancel running scan' },
      { method: 'POST', path: '/api/v1/scans/{scan_id}/force-unlock', description: 'Force unlock stuck scan' },
      { method: 'POST', path: '/api/v1/scans/{scan_id}/callback', description: 'Jenkins callback endpoint' }
    ]
  },
  {
    category: 'WebSocket',
    endpoints: [
      { method: 'WS', path: '/api/v1/ws/scans?scan_id={id}', description: 'Real-time scan progress' }
    ]
  }
];

const techStack = [
  { name: 'React', description: 'Frontend', icon: Code },
  { name: 'TypeScript', description: 'Type safety', icon: Code },
  { name: 'FastAPI', description: 'Backend API', icon: Server },
  { name: 'PostgreSQL', description: 'Database', icon: Database },
  { name: 'Jenkins', description: 'CI/CD Pipeline', icon: Server },
  { name: 'SonarQube', description: 'Code quality', icon: Shield },
  { name: 'OWASP DC', description: 'Dependency check', icon: Shield },
  { name: 'Trivy', description: 'Container scan', icon: Container },
  { name: 'ZAP', description: 'Web scanning', icon: Globe },
  { name: 'Nmap', description: 'Network scan', icon: Search }
];

const quickStart = [
  { step: 1, title: 'Create Project', description: 'Add a new project with GitHub repository URL and target details' },
  { step: 2, title: 'Configure Scan', description: 'Choose automated (all stages) or custom scan with selected tools' },
  { step: 3, title: 'Run Scan', description: 'Start the security scan and monitor real-time progress' },
  { step: 4, title: 'View Results', description: 'Review vulnerability reports and take action on findings' }
];

function ApiSection({ category, endpoints }: { category: string; endpoints: { method: string; path: string; description: string }[] }) {
  const [isOpen, setIsOpen] = useState(true);

  const methodColors: Record<string, string> = {
    GET: 'bg-emerald-100 text-emerald-700',
    POST: 'bg-blue-100 text-blue-700',
    PUT: 'bg-amber-100 text-amber-700',
    DELETE: 'bg-rose-100 text-rose-700',
    WS: 'bg-purple-100 text-purple-700'
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors"
      >
        <span className="font-semibold text-slate-700 text-sm">{category}</span>
        {isOpen ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
      </button>
      {isOpen && (
        <div className="divide-y divide-slate-100">
          {endpoints.map((ep, idx) => (
            <div key={idx} className="px-6 py-3 flex items-center gap-4 hover:bg-slate-50">
              <span className={`text-[10px] font-bold px-2 py-1 rounded ${methodColors[ep.method] || 'bg-slate-100'}`}>
                {ep.method}
              </span>
              <code className="flex-1 text-xs font-mono text-slate-600">{ep.path}</code>
              <span className="text-xs text-slate-400 hidden md:inline">{ep.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DocsPage = () => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const tabContent = {
    overview: (
      <div className="space-y-12">
        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-8">Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:border-slate-300 transition-all group">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform ${
                  feature.color === 'blue' ? 'bg-blue-50 text-blue-600' :
                  feature.color === 'green' ? 'bg-emerald-50 text-emerald-600' :
                  feature.color === 'amber' ? 'bg-amber-50 text-amber-600' :
                  feature.color === 'purple' ? 'bg-purple-50 text-purple-600' :
                  feature.color === 'indigo' ? 'bg-indigo-50 text-indigo-600' :
                  'bg-rose-50 text-rose-600'
                }`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-8">Quick Start</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {quickStart.map((item) => (
              <div key={item.step} className="relative">
                <div className="absolute -top-2 -left-2 w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  {item.step}
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-6 pt-10 hover:shadow-md transition-all">
                  <h3 className="text-base font-semibold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    ),
    api: (
      <section>
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">API Reference</h2>
          <p className="text-slate-500">Interact with the security pipeline using our RESTful API.</p>
        </div>
        <div className="space-y-4">
          {apiEndpoints.map((section) => (
            <ApiSection key={section.category} category={section.category} endpoints={section.endpoints} />
          ))}
        </div>
      </section>
    ),
    techstack: (
      <section>
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Tech Stack</h2>
          <p className="text-slate-500">Technologies powering our security scanning pipeline.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {techStack.map((tech) => (
            <div key={tech.name} className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col items-center text-center hover:shadow-md hover:border-slate-300 transition-all">
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-3">
                <tech.icon className="w-7 h-7 text-slate-600" />
              </div>
              <span className="text-sm font-semibold text-slate-900">{tech.name}</span>
              <span className="text-xs text-slate-400 mt-1">{tech.description}</span>
            </div>
          ))}
        </div>
      </section>
    ),
    limitations: (
      <section>
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Limitations & Notes</h2>
          <p className="text-slate-500">Important constraints to be aware of.</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <ul className="space-y-3">
              {limitations.map((limitation, idx) => (
                <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                  <span className="text-amber-500 mt-1">•</span>
                  {limitation}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    ),
    architecture: (
      <section>
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Architecture</h2>
          <p className="text-slate-500">Interactive knowledge graph of the system.</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-slate-50 border-b border-slate-100 px-6 py-4">
            <h3 className="text-sm font-semibold text-slate-700">Interactive Knowledge Graph</h3>
            <p className="text-xs text-slate-400 mt-1">Click and drag to pan, scroll to zoom, click nodes for details</p>
          </div>
          <iframe 
            src="/graph.html" 
            className="w-full h-[600px]"
            title="Architecture Graph"
            sandbox="allow-scripts"
          />
        </div>
      </section>
    ),
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center space-y-6 mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-900 rounded-2xl shadow-lg shadow-slate-900/20 mb-4">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-semibold text-slate-900 tracking-tight">Developer Docs</h1>
          <p className="text-slate-500 font-medium max-w-2xl mx-auto leading-relaxed">
            Security scanning pipeline for GitHub repositories. Automate vulnerability detection with SonarQube, OWASP Dependency Check, Trivy, Nmap, and ZAP.
          </p>
          <div className="flex items-center justify-center gap-6">
            <a 
              href="https://github.com/Bhaskar-ITM/Pipeline" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-900 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Main Repo
            </a>
            <a 
              href="https://github.com/Bhaskar-ITM/Agent" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-900 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Jenkins Agent
            </a>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-2 mb-8 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-lg'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          {tabContent[activeTab]}
        </div>

        <div className="text-center pt-8 border-t border-slate-200">
          <p className="text-sm text-slate-400">
            DevSecOps Security Scanning Pipeline
          </p>
        </div>
      </div>
    </div>
  );
};

export default DocsPage;