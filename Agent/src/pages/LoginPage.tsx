import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle, CheckCircle, Terminal, Command } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/Button';
import { FormInput } from '../components/FormInput';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const from = (location.state as { from?: Location })?.from?.pathname || '/dashboard';

  useEffect(() => {
    const state = location.state as { message?: string } | null;
    if (state?.message) {
      const timer = setTimeout(() => {
        window.history.replaceState({}, document.title);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.auth.login(formData.username, formData.password);
      login(result.access_token);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      console.error('Login failed', err);
      const errorMessage = err && typeof err === 'object' && 'response' in err 
        ? (err.response as { data?: { detail?: string } })?.data?.detail 
        : 'Invalid credentials. Please verify your identity and try again.';
      setError(errorMessage || 'Invalid credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 relative overflow-hidden font-mono selection:bg-primary selection:text-black">
      {/* Background Matrix Effect */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[url('https://upload.wikimedia.org/wikipedia/commons/1/17/Matrix_code.gif')] bg-cover mix-blend-screen"></div>
      
      {/* Decorative Glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 blur-[150px] rounded-full -translate-y-1/2 translate-x-1/2"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-900/10 blur-[150px] rounded-full translate-y-1/2 -translate-x-1/2"></div>

      <div className="max-w-md w-full bg-surface border border-white/10 rounded-3xl p-10 relative z-10 animate-in zoom-in-95 duration-500 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
        
        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,255,65,0.1)] relative border border-primary/20 group">
            <div className="absolute inset-0 bg-primary/20 rounded-2xl animate-pulse opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <Shield className="w-12 h-12 text-primary relative z-10" strokeWidth={1.5} />
            <div className="absolute -bottom-3 px-3 py-1 bg-black border border-primary/50 text-[9px] font-bold text-primary uppercase tracking-widest rounded-full">
              SECURE_ACCESS
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tighter uppercase leading-none mb-2 flex items-center gap-3">
            <Terminal className="w-6 h-6 text-primary" />
            Command Center
          </h1>
          <p className="text-gray-500 font-medium text-xs tracking-widest uppercase">DevSecOps Pipeline Control</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {(location.state as any)?.message && (
            <div className="bg-primary/10 border border-primary/20 text-primary p-4 rounded-xl text-xs font-bold flex items-start gap-3">
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {(location.state as any).message}
            </div>
          )}
          {error && (
            <div className="bg-red-900/20 border border-red-500/20 text-red-400 p-4 rounded-xl text-xs font-bold flex items-start gap-3 animate-shake">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          
          <div className="space-y-5">
            <FormInput
              id="username"
              name="username"
              label="Operator Identity"
              value={formData.username}
              onChange={handleChange}
              placeholder="e.g. admin_alpha"
              required
              autoFocus
              disabled={isLoading}
              icon={Command}
            />

            <div className="relative group">
              <FormInput
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                label="Access Token"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                required
                disabled={isLoading}
                icon={Shield}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[26px] text-gray-500 hover:text-white transition-colors p-1"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            variant="primary"
            fullWidth
            isLoading={isLoading}
            className="h-14 mt-6 text-xs"
          >
            {isLoading ? "Synchronizing..." : "Authorize Entry"}
          </Button>
        </form>

        <div className="mt-8 flex items-center gap-4">
          <div className="h-px flex-1 bg-white/10"></div>
          <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">System</span>
          <div className="h-px flex-1 bg-white/10"></div>
        </div>

        <Link
          to="/register"
          className="mt-6 flex items-center justify-center w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-gray-400 hover:text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all active:scale-95 group"
        >
          Initialize New Operator Account
          <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
        </Link>

        <div className="mt-10 pt-6 border-t border-white/5 text-center">
          <div className="text-[9px] font-bold text-gray-600 uppercase tracking-[0.3em]">
            Authorized Personnel Only
          </div>
          <div className="text-[9px] text-gray-700 font-mono mt-1">
            v2.0.0-alpha • Kali Linux Envrionment
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
