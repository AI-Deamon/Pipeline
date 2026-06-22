import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, Plus, Trash2, LogOut, Shield, UserCog, History } from 'lucide-react';
import { useToast } from '../components/Toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { Modal } from '../components/ui/Modal';
import { useRbac } from '../hooks/useRbac';
import { api } from '../services/api';
import { ApiError } from '../utils/apiError';
import type { CurrentUser, UserAccess, AccessChange, ProjectAccessAssignment } from '../types';

function roleDescription(role: string): string {
  if (role === 'admin') return 'Full control';
  if (role === 'team_lead') return 'Scoped project management';
  return 'Assigned work only';
}

const UserManagementPage = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { canManageUsers } = useRbac();
  const [users, setUsers] = useState<CurrentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [userAccess, setUserAccess] = useState<UserAccess | null>(null);
  const [accessChanges, setAccessChanges] = useState<AccessChange[]>([]);
  const [showRoleModal, setShowRoleModal] = useState<{ userId: string; username: string; currentRole: string } | null>(null);
  const [showAccessModal, setShowAccessModal] = useState<{ userId: string; username: string } | null>(null);
  const [newScopeType, setNewScopeType] = useState<'project' | 'project_group'>('project');
  const [newScopeId, setNewScopeId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ assignmentId: number; scopeDesc: string } | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<{ userId: string; username: string } | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  useEffect(() => {
    if (!canManageUsers) {
      navigate('/dashboard');
      return;
    }
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageUsers]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await api.rbac.getUsers();
      setUsers(data);
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load users' });
    } finally {
      setLoading(false);
    }
  };

  const loadUserAccess = async (userId: string) => {
    try {
      const data = await api.rbac.getProjectAccess(userId);
      setUserAccess(data);
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load project access' });
    }
  };

  const loadAccessChanges = async () => {
    try {
      const data = await api.rbac.getAccessChanges();
      setAccessChanges(data);
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load access history' });
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      await api.rbac.updateUserRole(userId, newRole);
      addToast({ type: 'success', title: 'Role Updated', message: `User role changed to ${newRole}` });
      setShowRoleModal(null);
      loadUsers();
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update role' });
    }
  };

  const handleGrantAccess = async () => {
    if (!showAccessModal || !newScopeId.trim()) return;
    try {
      await api.rbac.grantProjectAccess(showAccessModal.userId, newScopeType, newScopeId.trim());
      addToast({ type: 'success', title: 'Access Granted', message: `${newScopeType} access granted` });
      setNewScopeId('');
      loadUserAccess(showAccessModal.userId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to grant access';
      addToast({ type: 'error', title: 'Error', message: msg });
    }
  };

  const handleRevokeAccess = async (assignmentId: number, scopeDesc: string) => {
    if (!userAccess) return;
    setConfirmDelete({ assignmentId, scopeDesc });
  };

  const confirmRevoke = async () => {
    if (!confirmDelete || !userAccess) return;
    try {
      await api.rbac.revokeProjectAccess(userAccess.userId, confirmDelete.assignmentId);
      addToast({ type: 'success', title: 'Access Revoked', message: `Removed ${confirmDelete.scopeDesc}` });
      setConfirmDelete(null);
      loadUserAccess(userAccess.userId);
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to revoke access' });
    }
  };

  const handleDeleteUser = async () => {
    if (!confirmDeleteUser) return;
    setIsDeletingUser(true);
    try {
      await api.rbac.deleteUser(confirmDeleteUser.userId);
      addToast({
        type: 'success',
        title: 'User Deleted',
        message: `User "${confirmDeleteUser.username}" has been removed.`,
      });
      setConfirmDeleteUser(null);
      loadUsers();
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Delete Failed',
        message: ApiError.getErrorMessage(err, 'Failed to delete user.'),
      });
    } finally {
      setIsDeletingUser(false);
    }
  };

  if (!canManageUsers) return null;

  return (
    <div className="max-w-4xl mx-auto p-8">
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
            <p className="text-sm text-slate-500">Manage user roles and project access</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadAccessChanges}
            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
          >
            <History className="w-4 h-4" />
            Audit Log
          </button>
          <Link
            to="/register"
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add User
          </Link>
        </div>
      </header>

      {/* Users list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="font-medium text-slate-900">Users ({users.length})</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {users.map((user) => (
              <div key={user.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                    <Users className="w-4 h-4 text-slate-600" />
                  </div>
                  <div>
                    <span className="font-medium text-slate-900">{user.username}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                      user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                      user.role === 'team_lead' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {user.role}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowRoleModal({ userId: user.id, username: user.username, currentRole: user.role })}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Change Role"
                  >
                    <Shield className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setShowAccessModal({ userId: user.id, username: user.username }); loadUserAccess(user.id); }}
                    className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                    title="Manage Project Access"
                  >
                    <UserCog className="w-4 h-4" />
                  </button>
                  {user.username !== 'admin' && (
                    <button
                      onClick={() => setConfirmDeleteUser({ userId: user.id, username: user.username })}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                      title="Delete User"
                      aria-label={`Delete user ${user.username}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit log */}
      {accessChanges.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="font-medium text-slate-900">Access Change History</h2>
          </div>
          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {accessChanges.map((change) => (
              <div key={change.id} className="px-6 py-3 text-sm">
                <span className="font-medium">{change.actorId}</span>
                {' '}{change.changeType}{' '}
                <span className="font-medium">{change.targetUserId}</span>
                {change.beforeValue && <span className="text-slate-500"> (from: {change.beforeValue})</span>}
                {change.afterValue && <span className="text-slate-500"> (to: {change.afterValue})</span>}
                <span className="text-slate-400 ml-2">{new Date(change.changedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Role change modal */}
      <Modal isOpen={!!showRoleModal} onClose={() => setShowRoleModal(null)} title={`Change Role: ${showRoleModal?.username || ''}`} size="sm">
        <div className="space-y-2">
          {(['admin', 'team_lead', 'developer'] as const).map((role) => (
            <button
              key={role}
              onClick={() => handleUpdateRole(showRoleModal!.userId, role)}
              className={`w-full text-left px-4 py-3 rounded-lg border ${
                showRoleModal?.currentRole === role
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="font-medium">{role}</span>
              <span className="text-sm text-slate-500 ml-2">
                {roleDescription(role)}
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Project access modal */}
      <Modal isOpen={!!showAccessModal} onClose={() => setShowAccessModal(null)} title={`Project Access: ${showAccessModal?.username || ''}`} size="md">
        {userAccess?.assignments && userAccess.assignments.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-slate-700 mb-2">Current Access</h4>
            {userAccess.assignments.map((a: ProjectAccessAssignment) => (
              <div key={a.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg mb-1">
                <span className="text-sm"><span className="font-medium">{a.scopeType}</span>: {a.scopeId}</span>
                <button
                  onClick={() => handleRevokeAccess(a.id, `${a.scopeType}:${a.scopeId}`)}
                  className="p-1 text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-slate-100 pt-4">
          <h4 className="text-sm font-medium text-slate-700 mb-2">Grant Access</h4>
          <div className="flex gap-2 mb-2">
            <select
              value={newScopeType}
              onChange={(e) => setNewScopeType(e.target.value as 'project' | 'project_group')}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
            >
              <option value="project">Project</option>
              <option value="project_group">Project Group</option>
            </select>
            <input
              type="text"
              value={newScopeId}
              onChange={(e) => setNewScopeId(e.target.value)}
              placeholder="Project or Group ID"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <button
            onClick={handleGrantAccess}
            disabled={!newScopeId.trim()}
            className="w-full py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            Grant Access
          </button>
        </div>
      </Modal>

      {/* Confirm revoke modal */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={confirmRevoke}
        title="Revoke access?"
        message={`Remove ${confirmDelete?.scopeDesc || ''} access?`}
        confirmLabel="Revoke"
        variant="danger"
      />

      {/* Confirm user-delete modal — uses the accessible ConfirmModal
          component (focus trap + role="dialog" + aria-modal) instead of
          an inline div, addressing audit finding F-005. */}
      <ConfirmModal
        isOpen={!!confirmDeleteUser}
        onClose={() => setConfirmDeleteUser(null)}
        onConfirm={handleDeleteUser}
        title="Delete User?"
        message={
          confirmDeleteUser
            ? `This will permanently delete user "${confirmDeleteUser.username}" and revoke all their project access. This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete User"
        cancelLabel="Cancel"
        variant="danger"
        icon={<Trash2 />}
        isPending={isDeletingUser}
      />
    </div>
  );
};

export default UserManagementPage;
