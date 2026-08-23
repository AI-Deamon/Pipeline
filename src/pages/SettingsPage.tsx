import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Bell, ChevronLeft } from 'lucide-react';
import { useToast } from '../components/Toast';
import { notificationService } from '../services/notifications';

const SettingsPage = () => {
  const { addToast } = useToast();
  
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if ('Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

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