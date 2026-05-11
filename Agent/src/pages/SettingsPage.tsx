import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, Shield, CheckCircle, AlertCircle, Info, ChevronLeft } from 'lucide-react';
import { useToast } from '../components/Toast';

const SettingsPage = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('API_KEY');
    if (stored) {
      setApiKey(stored);
      setHasExistingKey(true);
    }
  }, []);

  const handleSave = () => {
    if (!apiKey.trim()) {
      addToast({
        type: 'error',
        title: 'Invalid Key',
        message: 'API key cannot be empty',
      });
      return;
    }

    if (apiKey.trim().length < 32) {
      addToast({
        type: 'warning',
        title: 'Short Key',
        message: 'API key should be at least 32 characters for security',
      });
    }

    localStorage.setItem('API_KEY', apiKey.trim());
    setHasExistingKey(true);
    addToast({
      type: 'success',
      title: 'API Key Saved',
      message: 'Your API key has been securely stored in browser storage',
    });
  };

  const handleClear = () => {
    localStorage.removeItem('API_KEY');
    setApiKey('');
    setHasExistingKey(false);
    addToast({
      type: 'info',
      title: 'API Key Cleared',
      message: 'Your API key has been removed from browser storage',
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="p-3 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 rounded-2xl transition-all active:scale-95 shadow-sm flex items-center gap-2 group"
        >
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs font-black uppercase tracking-widest pr-2">Back to Dashboard</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-[3rem] shadow-2xl shadow-slate-200/50 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-50/50 border-b border-slate-100 px-10 py-8">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/20">
              <Key className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase leading-none">API Configuration</h1>
              <p className="text-slate-500 text-xs font-medium mt-1">Manage your API authentication settings</p>
            </div>
          </div>
        </div>

        <div className="p-10 space-y-10">
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 flex items-start gap-4">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="text-sm font-black text-blue-900 uppercase tracking-wider">Why Configure API Key?</h3>
              <p className="text-xs text-blue-800 font-medium leading-relaxed">
                The API key authenticates scan management operations (reset, cancel) with the backend. Without it, you can view scans but cannot control them.
                This key is stored locally in your browser and never transmitted to external servers.
              </p>
            </div>
          </div>

          {/* API Key Form */}
          <div className="space-y-4">
            <label htmlFor="api-key" className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
              Backend API Key
            </label>
            <div className="relative">
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key (min 32 characters)"
                className={`input-field pr-32 ${hasExistingKey ? 'border-green-300 bg-green-50/30' : ''}`}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
                {hasExistingKey && (
                  <div className="flex items-center gap-1.5 text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Saved</span>
                  </div>
                )}
              </div>
            </div>
            <p className="text-[10px] font-medium text-slate-400 ml-1 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 opacity-50" />
              Stored locally in browser localStorage • Not shared with external services
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4 pt-6 border-t border-slate-100">
            <button
              onClick={handleSave}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-xl shadow-blue-200 flex items-center justify-center gap-3"
            >
              <CheckCircle className="w-5 h-5" />
              {hasExistingKey ? 'Update Key' : 'Save Key'}
            </button>
            {hasExistingKey && (
              <button
                onClick={handleClear}
                className="px-8 py-4 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-sm"
              >
                Clear
              </button>
            )}
          </div>

          {/* Status */}
          {hasExistingKey ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-6 flex items-center gap-4">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h4 className="text-sm font-black text-green-900 uppercase tracking-wider">API Key Configured</h4>
                <p className="text-xs text-green-700 font-medium mt-1">
                  Scan management features are fully enabled. You can reset and cancel scans.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h4 className="text-sm font-black text-amber-900 uppercase tracking-wider">API Key Not Configured</h4>
                <p className="text-xs text-amber-700 font-medium mt-1">
                  Scan viewing works, but reset/cancel operations will fail without authentication.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
