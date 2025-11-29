import { useWorkspaceMembers } from '../../../hooks/useWorkspaceMembers';
import { useAuth } from '../../../contexts/AuthContext';
import { canManageWorkspaceMembers, getRoleLabel } from '../../../lib/rbac';
import type { GlobalRole } from '../../../lib/database.types';
import { Loader2, Power, RefreshCw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useWorkspaceTeams } from '../../../hooks/useWorkspaceTeams';

const ROLE_SEQUENCE: GlobalRole[] = ['admin', 'sales_manager', 'team_lead', 'agent'];

export default function WorkspaceMembersSettings() {
  const { roleInfo, user } = useAuth();
  const workspaceId = roleInfo?.workspaceId || null;
  const canManage = canManageWorkspaceMembers(roleInfo);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const { members, loading, error, changeRole, deactivate, reactivate, remove, updateTeam } = useWorkspaceMembers(workspaceId);
  const { teams, loading: teamsLoading } = useWorkspaceTeams(workspaceId);
  const [teamError, setTeamError] = useState<string | null>(null);

  const adminCount = useMemo(
    () => members.filter((member) => member.global_role === 'admin' && member.is_active).length,
    [members]
  );

  const handleRoleChange = async (memberId: string, nextRole: GlobalRole) => {
    setPendingAction(memberId + nextRole);
    await changeRole(memberId, nextRole);
    setPendingAction(null);
  };

  const handleDeactivate = async (memberId: string) => {
    setPendingAction(`deactivate-${memberId}`);
    await deactivate(memberId);
    setPendingAction(null);
  };

  const handleReactivate = async (memberId: string) => {
    setPendingAction(`reactivate-${memberId}`);
    await reactivate(memberId);
    setPendingAction(null);
  };

  const handleDelete = async (memberId: string, memberEmail?: string | null) => {
    const confirmed = confirm(
      `Delete ${memberEmail || 'this user'}? This removes their account and access. This cannot be undone.`
    );
    if (!confirmed) return;
    setPendingAction(`delete-${memberId}`);
    await remove(memberId);
    setPendingAction(null);
  };

  const handleTeamChange = async (memberId: string, teamId: string | null) => {
    setPendingAction(`team-${memberId}`);
    const { error } = await updateTeam(memberId, teamId);
    setTeamError(error?.message ?? null);
    setPendingAction(null);
  };

  if (!workspaceId || !canManage) {
    return (
      <div className="text-sm text-gray-600">
        Workspace member management is limited to administrators. Contact an admin if you need to add or update teammates.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Workspace Members</h2>
        <p className="text-sm text-gray-500">
          View and manage everyone in your workspace. You currently have {adminCount} admin{adminCount === 1 ? '' : 's'}.
        </p>
        {error && (
          <div className="mt-3 rounded-xl border border-red-200/70 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
        {teamError && !error && (
          <div className="mt-3 rounded-xl border border-red-200/70 bg-red-50 px-3 py-2 text-sm text-red-600">
            {teamError}
          </div>
        )}
        {!error && teamsLoading && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200/70 bg-white px-3 py-1 text-xs text-gray-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading teams…
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200/70">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50/60">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.25em] text-gray-500">
                Member
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.25em] text-gray-500">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.25em] text-gray-500">
                Team
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.25em] text-gray-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.25em] text-gray-500">
                Last active
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white/80">
            {members.map((member) => {
              const isSelf = member.user_id === user?.id;
              const isActive = member.is_active;
              const hasPending = pendingAction !== null;
              const isPendingRow = hasPending && (pendingAction?.includes(member.user_id) ?? false);
              const disableControls = hasPending && !isPendingRow;
              return (
                <tr key={member.user_id}>
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-gray-900">
                        {member.full_name || member.email || 'Member'}
                      </span>
                      <span className="text-xs text-gray-500">{member.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      className="hig-input text-sm"
                      value={member.global_role}
                      disabled={!isActive || disableControls || isSelf}
                      onChange={(e) => handleRoleChange(member.user_id, e.target.value as GlobalRole)}
                    >
                      {ROLE_SEQUENCE.map((role) => (
                        <option key={role} value={role}>
                          {getRoleLabel(role)}
                        </option>
                      ))}
                    </select>
                    {isSelf && (
                      <p className="mt-1 text-[11px] text-gray-500">
                        You can’t change your own role from this screen.
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <select
                      className="hig-input text-sm"
                      value={member.team_id || teams[0]?.team_id || ''}
                      disabled={!isActive || disableControls || teamsLoading || teams.length === 0}
                      onChange={(e) => handleTeamChange(member.user_id, e.target.value)}
                    >
                      {teams.map((team) => (
                        <option key={team.team_id} value={team.team_id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                          : 'bg-gray-100 text-gray-500 border border-gray-200'
                      }`}
                    >
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">
                    {member.last_sign_in_at
                      ? new Date(member.last_sign_in_at).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-4 py-4 text-right space-x-2">
                    {isActive ? (
                      <button
                        onClick={() => handleDeactivate(member.user_id)}
                        disabled={disableControls || isSelf}
                        className="inline-flex items-center gap-2 rounded-2xl border border-red-200/70 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                      >
                        <Power className="h-4 w-4" />
                        Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivate(member.user_id)}
                        disabled={disableControls}
                        className="inline-flex items-center gap-2 rounded-2xl border border-blue-200/70 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Reactivate
                      </button>
                    )}
                    {!isSelf && (
                      <button
                        onClick={() => handleDelete(member.user_id, member.email)}
                        disabled={disableControls}
                        className="inline-flex items-center gap-2 rounded-2xl border border-gray-200/70 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-red-50 hover:border-red-200/70 hover:text-red-700 disabled:opacity-50"
                        title="Delete user"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
