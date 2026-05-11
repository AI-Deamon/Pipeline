import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, Plus, Trash2, LogOut } from 'lucide-react';
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
  const [confirmDelete, setConfirmDelete] = useState<{isOpen: boolean, userId: string, username: string} | null>(null);

  const handleDeleteUser = (userId: string, username: string) => {
    if (username === 'admin') {
      addToast({ type: 'error', title: 'Cannot Delete', message: 'Admin account cannot be deleted' });
      return;
    }
    setConfirmDelete({ isOpen: true, userId, username });
  };

  const handleConfirmDelete = () => {
    if (confirmDelete) {
      setUsers(users.filter(u => u.id !== confirmDelete.userId));
      addToast({ type: 'success', title: 'User Deleted', message: `User "${confirmDelete.username}" removed` });
      setConfirmDelete(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <LogOut className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">User Management</h1>
            <p className="text-sm text-slate-500">Manage user accounts</p>
          </div>
        </div>
        <Link
          to="/register"
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add User
        </Link>
      </header>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800">Each user has equal access to projects. Admin account cannot be deleted.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="font-medium text-slate-900">Users ({users.length})</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {users.map((user) => (
            <div
              key={user.id}
              className="px-6 py-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                  <Users className="w-4 h-4 text-slate-600" />
                </div>
                <span className="font-medium text-slate-900">{user.username}</span>
                {user.username === 'admin' && (
                  <span className="text-xs text-slate-500">(admin)</span>
                )}
              </div>
              {user.username !== 'admin' && (
                <button
                  onClick={() => handleDeleteUser(user.id, user.username)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setConfirmDelete(null)}></div>
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl relative z-10">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete User?</h3>
            <p className="text-slate-500 text-sm mb-6">Remove user "{confirmDelete.username}"?</p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmDelete}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementPage;