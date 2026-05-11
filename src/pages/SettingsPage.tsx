import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, AlertCircle, Bell, ChevronLeft } from 'lucide-react';
import { useToast } from '../components/Toast';
import { notificationService } from '../services/notifications';

const SettingsPage = () => {
  const { addToast } = useToast();
  
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('API_KEY') || '');
  const [showKey, setShowKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(() => !!sessionStorage.getItem('API_KEY'));
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if ('Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const handleSave = () => {
    if (!apiKey.trim()) {
      addToast({ type: 'error', title: 'Invalid Key', message: 'API key cannot be empty' });
      return;
    }

    sessionStorage.setItem('API_KEY', apiKey.trim());
    setHasExistingKey(true);
    addToast({ type: 'success', title: 'Saved', message: 'API key has been saved' });
  };

  const handleClear = () => {
    sessionStorage.removeItem('API_KEY');
    setApiKey('');
    setHasExistingKey(false);
    addToast({ type: 'info', title: 'Cleared', message: 'API key has been removed' });
  };

  const handleNotificationPermission = async () => {
    const granted = await notificationService.requestPermission();
    if (granted) {
      setNotificationPermission('granted');
      addToast({ type: 'success', title: 'Enabled', message: 'Notifications enabled' });
    } else {
      addToast({ type: 'error', title: 'Denied', message: 'Permission denied' });
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-6"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="text-sm">Back</span>
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500">Manage your account settings</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              The API key is used for scan management (reset, cancel). Without it, you can view scans but cannot control them.
            </p>
          </div>

          <div>
            <label htmlFor="api-key" className="block text-sm font-medium text-slate-700 mb-2">
              API Key
            </label>
            <div className="relative">
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
                className="w-full px-3 py-2 pr-24 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/5"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
                {hasExistingKey && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Saved
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
            >
              {hasExistingKey ? 'Update' : 'Save'}
            </button>
            {hasExistingKey && (
              <button
                onClick={handleClear}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>

          {hasExistingKey ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">API Key Configured</p>
                <p className="text-xs text-green-700">Scan management features are enabled</p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-800">API Key Not Configured</p>
                <p className="text-xs text-amber-700">Reset/cancel operations will fail</p>
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 pt-6">
            <div className="flex items-center gap-3 mb-4">
              <Bell className="w-5 h-5 text-slate-600" />
              <div>
                <p className="text-sm font-medium text-slate-900">Desktop Notifications</p>
                <p className="text-xs text-slate-500">Get notified when scans complete</p>
              </div>
            </div>

            <button
              onClick={handleNotificationPermission}
              disabled={notificationPermission === 'granted'}
              className={`w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${
                notificationPermission === 'granted'
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {notificationPermission === 'granted' ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Enabled
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4" />
                  Enable Notifications
                </>
              )}
            </button>

            {notificationPermission === 'denied' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
                <p className="text-xs text-amber-800">
                  Notifications blocked. Enable in browser settings.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;