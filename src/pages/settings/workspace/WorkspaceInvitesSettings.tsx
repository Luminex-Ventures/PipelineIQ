import { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { canInviteAgents, canInviteElevatedRoles, getRoleLabel } from '../../../lib/rbac';
import { useWorkspaceInvites } from '../../../hooks/useWorkspaceInvites';
import { useWorkspaceTeams } from '../../../hooks/useWorkspaceTeams';
import type { GlobalRole } from '../../../lib/database.types';
import { Loader2, MailPlus, RefreshCw, XCircle, Link as LinkIcon } from 'lucide-react';

const roleOptions: { value: GlobalRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'sales_manager', label: 'Sales Manager' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'agent', label: 'Agent' },
];

export default function WorkspaceInvitesSettings() {
  const { roleInfo } = useAuth();
  const workspaceId = roleInfo?.workspaceId || null;
  const canInvite = canInviteAgents(roleInfo);
  const canInviteElevated = canInviteElevatedRoles(roleInfo);
  const { invites, loading, createInvite, resendInvite, cancelInvite } = useWorkspaceInvites(workspaceId);
  const { teams } = useWorkspaceTeams(workspaceId);
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<GlobalRole>('agent');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(roleInfo?.teamId || null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const userTeamName = teams.find((team) => team.team_id === roleInfo?.teamId)?.name;

  const availableRoles = canInviteElevated ? roleOptions : roleOptions.filter((r) => r.value === 'agent');

  useEffect(() => {
    if (!canInviteElevated) {
      setSelectedRole('agent');
    }
  }, [canInviteElevated]);

  const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    if (!workspaceId) {
      setFeedback({
        type: 'error',
        text: 'Workspace is required before sending invites. Please refresh or contact an admin.',
      });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    const { error } = await createInvite({
      email: email.trim().toLowerCase(),
      intendedRole: selectedRole,
      teamId: selectedRole === 'agent' ? (selectedTeamId || roleInfo?.teamId || null) : selectedTeamId,
    });
    setSubmitting(false);
    if (error) {
      setFeedback({ type: 'error', text: error.message || 'Unable to send invite. Please try again.' });
      return;
    }
    setEmail('');
    setFeedback({
      type: 'success',
      text: `Invitation sent to ${email.trim().toLowerCase()}. Share the link or let them check their inbox.`,
    });
  };

  useEffect(() => {
    if (roleInfo?.teamId) {
      setSelectedTeamId(roleInfo.teamId);
    }
  }, [roleInfo?.teamId]);

  if (!canInvite) {
    return (
      <div className="text-sm text-gray-600">
        Only admins, sales managers, or team leads can invite new members. Contact an admin if you need to add someone to your workspace.
      </div>
    );
  }

  const pendingInvites = invites.filter((invite) => invite.status === 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="hig-text-heading mb-2">Invitations</h2>
        <p className="text-sm text-gray-600">
          Invite teammates by email and manage pending invitations. Links stay valid for 14 days.
        </p>
      </div>

      <form onSubmit={handleInvite} className="rounded-2xl border border-gray-200/70 bg-white/80 p-5 space-y-4">
        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {feedback.text}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="hig-label">Email</label>
            <input
              type="email"
              required
              className="hig-input"
              placeholder="newagent@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="hig-label">Role</label>
            <select
              className="hig-input"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as GlobalRole)}
            >
              {availableRoles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="hig-label">Team (optional)</label>
            {roleInfo?.globalRole === 'agent' || (!canInviteElevated && roleInfo?.teamId) ? (
              <input
                type="text"
                className="hig-input bg-gray-50"
                value={userTeamName || 'Assigned automatically'}
                readOnly
              />
            ) : (
              <select
                className="hig-input"
                value={selectedTeamId || ''}
                onChange={(e) => setSelectedTeamId(e.target.value || null)}
              >
                <option value="">No specific team</option>
                {teams.map((team) => (
                  <option key={team.team_id} value={team.team_id}>
                    {team.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="hig-btn-primary inline-flex items-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <MailPlus className="h-4 w-4" />
              Send invitation
            </>
          )}
        </button>
      </form>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Pending invitations</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading invitations…
          </div>
        ) : pendingInvites.length === 0 ? (
          <p className="text-sm text-gray-500">No active invitations.</p>
        ) : (
          <div className="space-y-4">
            {pendingInvites.map((invite) => {
              const isExpired = invite.status === 'pending' && new Date(invite.expires_at).getTime() < Date.now();
              const effectiveStatus = isExpired ? 'expired' : invite.status;
              return (
                <div
                  key={invite.id}
                  className="flex flex-col gap-3 rounded-2xl border border-gray-200/70 bg-white/80 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{invite.email}</p>
                    <p className="text-xs text-gray-500">
                      {getRoleLabel(invite.intended_role)} • expires {new Date(invite.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {invite.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(inviteLink(invite.token))}
                        className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-300"
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                        Copy link
                      </button>
                    )}
                    {effectiveStatus === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => resendInvite(invite.id)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-blue-200/70 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Resend
                      </button>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 capitalize">
                        {effectiveStatus}
                      </span>
                    )}
                    {invite.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => cancelInvite(invite.id)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-red-200/70 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
