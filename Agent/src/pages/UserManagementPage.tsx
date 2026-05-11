import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, Plus, Trash2, CheckCircle, Key, Shield, LogOut } from 'lucide-react';
import { useToast } from '../components/Toast';

interface User {
  id: string;
  username: string;
}

const UserManagementPage = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [users, setUsers] = useState<User[]>([
    { id: '1', username: 'admin' },
    { id: '2', username: 'john' }
  ]);

  const handleDeleteUser = (userId: string, username: string) => {
    if (username === 'admin') {
      addToast({
        type: 'error',
        title: 'Cannot Delete',
        message: 'The admin account cannot be deleted',
      });
      return;
    }

    if (window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      setUsers(users.filter(u => u.id !== userId));
      addToast({
        type: 'success',
        title: 'User Deleted',
        message: `User "${username}" has been removed`,
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-3 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 rounded-2xl transition-all active:scale-95 shadow-sm"
              >
                <LogOut className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">User Management</h1>
                <p className="text-slate-500 text-sm font-medium mt-1">Manage operator accounts and access</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/register')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-blue-200 flex items-center gap-3"
            >
              <Plus className="w-5 h-5" />
              Add User
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 mb-8 flex items-start gap-4">
          <Shield className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h3 className="text-sm font-black text-blue-900 uppercase tracking-wider">Multi-User Authentication</h3>
            <p className="text-xs text-blue-800 font-medium leading-relaxed">
              Each operator can have their own account. All users have equal access to projects and scans.
              The admin account cannot be deleted.
            </p>
          </div>
        </div>

        {/* Users List */}
        <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-xl shadow-slate-100/50 overflow-hidden">
          <div className="px-10 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Registered Operators</h2>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">{users.length} {users.length === 1 ? 'User' : 'Users'}</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-50">
            {users.length === 0 ? (
              <div className="p-20 text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border-2 border-dashed border-slate-200">
                  <Users className="w-10 h-10 text-slate-300" />
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-2">No Users Found</h3>
                <p className="text-slate-500 text-sm font-medium mb-6">Create your first operator account to get started</p>
                <button
                  onClick={() => navigate('/register')}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create User
                </button>
              </div>
            ) : (
              users.map((user) => (
                <div
                  key={user.id}
                  className="px-10 py-6 flex items-center justify-between hover:bg-slate-50/80 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${
                      user.username === 'admin' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {user.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{user.username}</span>
                        {user.username === 'admin' && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-black uppercase tracking-wider rounded-full border border-blue-200">
                            Admin
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-medium text-slate-400 font-mono mt-0.5">
                        ID: {user.id}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Active</span>
                    </div>
                    {user.username !== 'admin' && (
                      <button
                        onClick={() => handleDeleteUser(user.id, user.username)}
                        className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                        title="Delete user"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            to="/register"
            className="p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-blue-300 hover:shadow-xl hover:shadow-blue-900/5 transition-all group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Add New Operator</h3>
            </div>
            <p className="text-sm text-slate-500 font-medium">
              Create a new user account with username and password credentials
            </p>
          </Link>

          <button
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            className="p-6 bg-white border border-slate-200 rounded-[2rem] hover:border-red-300 hover:shadow-xl hover:shadow-red-900/5 transition-all group text-left"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Key className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Reset Session</h3>
            </div>
            <p className="text-sm text-slate-500 font-medium">
              Clear all local data and logout (useful for testing authentication)
            </p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserManagementPage;
