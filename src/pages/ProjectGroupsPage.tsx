import { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import type { ProjectGroup, ProjectGroupDetail } from '../types';
import { Plus, Folder, Trash2, RefreshCw, Sparkles } from 'lucide-react';

const ProjectGroupsPage = () => {
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ProjectGroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{pattern: string; name_suggestion: string; related_projects: number}>>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPattern, setNewGroupPattern] = useState('');
  const [autoAssigning, setAutoAssigning] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.projectGroups.list();
      setGroups(data);
    } catch (error) {
      console.error('Failed to load project groups:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSuggestions = useCallback(async () => {
    try {
      const data = await api.projectGroups.getSuggestions();
      setSuggestions(data);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !newGroupPattern.trim()) return;

    try {
      const newGroup = await api.projectGroups.create({
        name: newGroupName,
        naming_pattern: newGroupPattern,
      });
      setGroups([...groups, newGroup]);
      setNewGroupName('');
      setNewGroupPattern('');
      setShowCreateForm(false);
    } catch (error) {
      console.error('Failed to create group:', error);
    }
  };

  const handleCreateFromSuggestion = async (suggestion: {pattern: string; name_suggestion: string}) => {
    setNewGroupName(suggestion.name_suggestion);
    setNewGroupPattern(suggestion.pattern);
    setShowSuggestions(false);
    setShowCreateForm(true);
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this project group?')) return;

    try {
      await api.projectGroups.delete(groupId);
      setGroups(groups.filter(g => g.group_id !== groupId));
      if (selectedGroup?.group_id === groupId) {
        setSelectedGroup(null);
      }
    } catch (error) {
      console.error('Failed to delete group:', error);
    }
  };

  const handleViewGroup = async (groupId: string) => {
    try {
      const data = await api.projectGroups.get(groupId);
      setSelectedGroup(data);
    } catch (error) {
      console.error('Failed to load group details:', error);
    }
  };

  const handleAutoAssign = async (groupId: string) => {
    setAutoAssigning(groupId);
    try {
      const result = await api.projectGroups.autoAssign(groupId);
      if (selectedGroup?.group_id === groupId) {
        handleViewGroup(groupId);
      }
      alert(`Auto-assigned ${result.assigned_count} scans`);
    } catch (error) {
      console.error('Failed to auto-assign scans:', error);
    } finally {
      setAutoAssigning(null);
    }
  };

  const handleRefreshGroup = async (groupId: string) => {
    setRefreshing(groupId);
    try {
      const result = await api.projectGroups.refresh(groupId);
      if (selectedGroup?.group_id === groupId) {
        handleViewGroup(groupId);
      }
      alert(`Refreshed: ${result.total_findings} total findings, ${result.auto_assigned} new scans assigned`);
    } catch (error) {
      console.error('Failed to refresh group:', error);
    } finally {
      setRefreshing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Project Groups</h1>
        <div className="flex gap-2">
          <button
            onClick={loadSuggestions}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
          >
            <Sparkles className="w-4 h-4" />
            Suggest Groups
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Create Group
          </button>
        </div>
      </div>

      {/* Suggestions Panel */}
      {showSuggestions && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-slate-900">Suggested Project Groups</h3>
            <button
              onClick={() => setShowSuggestions(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              ×
            </button>
          </div>
          {suggestions.length === 0 ? (
            <p className="text-slate-500">No patterns found with multiple related projects.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {suggestions.map((s, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3">
                  <div className="font-medium text-slate-900">{s.name_suggestion}</div>
                  <div className="text-xs text-slate-500 font-mono mt-1">{s.pattern}</div>
                  <div className="text-xs text-slate-400 mt-1">{s.related_projects} related projects</div>
                  <button
                    onClick={() => handleCreateFromSuggestion(s)}
                    className="mt-2 text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    Use this pattern
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Group Form */}
      {showCreateForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <h3 className="text-lg font-medium text-slate-900 mb-3">Create New Project Group</h3>
          <form onSubmit={handleCreateGroup} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                type="text"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="e.g., Kilo Platform"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Naming Pattern</label>
              <input
                type="text"
                value={newGroupPattern}
                onChange={e => setNewGroupPattern(e.target.value)}
                placeholder="e.g., kilo_*"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Use wildcards: * matches any characters, ? matches single character
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Groups List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="p-4 border-b border-slate-200">
              <h2 className="font-medium text-slate-900">All Groups ({groups.length})</h2>
            </div>
            <div className="divide-y divide-slate-200">
              {groups.length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  No project groups yet. Create one or use suggestions.
                </div>
              ) : (
                groups.map(group => (
                  <div
                    key={group.group_id}
                    className={`p-4 cursor-pointer hover:bg-slate-50 ${
                      selectedGroup?.group_id === group.group_id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => handleViewGroup(group.group_id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-slate-900">{group.name}</h3>
                        <p className="text-xs text-slate-500 mt-1 font-mono bg-slate-100 px-2 py-1 rounded">
                          {group.naming_pattern}
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                          Created {new Date(group.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        </p>
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleDeleteGroup(group.group_id);
                        }}
                        className="p-1 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Group Details */}
        <div className="lg:col-span-2">
          {selectedGroup ? (
            <div className="space-y-6">
              {/* Group Header */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{selectedGroup.name}</h2>
                    <p className="text-sm text-slate-500 mt-1">Pattern: {selectedGroup.naming_pattern}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRefreshGroup(selectedGroup.group_id)}
                      disabled={refreshing === selectedGroup.group_id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                      title="Refresh group - re-run auto-assign and recalculate"
                    >
                      {refreshing === selectedGroup.group_id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Refresh
                    </button>
                    <button
                      onClick={() => handleAutoAssign(selectedGroup.group_id)}
                      disabled={autoAssigning === selectedGroup.group_id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                    >
                      {autoAssigning === selectedGroup.group_id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Auto-Assign Scans
                    </button>
                  </div>
                </div>

                {/* Severity Summary */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-red-600">{selectedGroup.severity_summary.critical}</div>
                    <div className="text-xs text-slate-500">Critical</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-orange-600">{selectedGroup.severity_summary.high}</div>
                    <div className="text-xs text-slate-500">High</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-yellow-600">{selectedGroup.severity_summary.medium}</div>
                    <div className="text-xs text-slate-500">Medium</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-green-600">{selectedGroup.severity_summary.low}</div>
                    <div className="text-xs text-slate-500">Low</div>
                  </div>
                </div>
              </div>

              {/* Assigned Scans */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="font-medium text-slate-900 mb-4">
                  Assigned Scans ({selectedGroup.assigned_scans.length})
                </h3>
                {selectedGroup.assigned_scans.length === 0 ? (
                  <p className="text-slate-500 text-sm">No scans assigned. Click "Auto-Assign Scans" to find matching scans. Use "Refresh" to re-run auto-assignment.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Scan ID</th>
                          <th className="text-left p-2">Confidence</th>
                          <th className="text-left p-2">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedGroup.assigned_scans.map(scan => (
                          <tr key={scan.scan_id} className="border-b hover:bg-slate-50">
                            <td className="p-2 font-mono text-xs">{scan.scan_id.substring(0, 8)}...</td>
                            <td className="p-2">
                              <span className={`px-2 py-1 rounded text-xs ${
                                scan.match_confidence >= 90 ? 'bg-green-100 text-green-700' :
                                scan.match_confidence >= 70 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {scan.match_confidence}%
                              </span>
                            </td>
                            <td className="p-2">
                              <span className={`text-xs px-2 py-1 rounded ${
                                scan.is_auto_assigned ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {scan.is_auto_assigned ? 'Auto' : 'Manual'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <Folder className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">Select a Project Group</h3>
              <p className="text-slate-500">
                Choose a group from the list to view its aggregated security report.
              </p>
              <p className="text-slate-400 text-sm mt-4">
                Tip: Use "Suggest Groups" to auto-detect potential project groups from existing projects.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectGroupsPage;
