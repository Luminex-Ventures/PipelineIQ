import { FormEvent, useMemo, useState } from 'react';
import { Loader2, PlusCircle } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { canManageTeams } from '../../../lib/rbac';
import { useWorkspaceTeams } from '../../../hooks/useWorkspaceTeams';

export default function WorkspaceTeamsSettings() {
  const { roleInfo, user } = useAuth();
  const workspaceId = roleInfo?.workspaceId || null;
  const canCreate = canManageTeams(roleInfo);
  const { teams, loading, createTeam } = useWorkspaceTeams(workspaceId);
  const [teamName, setTeamName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const sortedTeams = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    setSubmitting(true);
    setFeedback(null);
    const { error } = await createTeam(teamName, user?.id);
    setSubmitting(false);
    if (error) {
      const duplicate = error.message?.toLowerCase().includes('duplicate');
      setFeedback({
        type: 'error',
        text: duplicate ? 'A team with that name already exists.' : error.message || 'Unable to create team right now.'
      });
      return;
    }
    setTeamName('');
    setFeedback({ type: 'success', text: 'Team created. Assign members from the Members tab.' });
  };

  if (!workspaceId || !canCreate) {
    return (
      <div className="text-sm text-gray-600">
        Only workspace admins can create teams. Ask an admin to set this up if you need a new team.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="hig-text-heading mb-2">Teams</h2>
        <p className="text-sm text-gray-600">
          Create lightweight teams to group agents and route invitations. You can add members after creating the team.
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-2xl border border-gray-200/70 bg-white/80 p-5"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
          <div className="flex-1">
            <label className="hig-label">Team name</label>
            <input
              type="text"
              className="hig-input"
              placeholder="Example: East Coast Team"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-gray-500">Names must be unique across your workspace.</p>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="hig-btn-primary inline-flex items-center justify-center gap-2 px-4"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4" />
                Create team
              </>
            )}
          </button>
        </div>
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
      </form>

      <div className="rounded-2xl border border-gray-200/70 bg-white/80 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Existing teams</h3>
            <p className="text-xs text-gray-500">
              {loading ? 'Loading teams…' : `${sortedTeams.length || 'No'} team${sortedTeams.length === 1 ? '' : 's'}`}
            </p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
        </div>
        {!loading && sortedTeams.length === 0 && (
          <p className="mt-3 text-sm text-gray-500">No teams yet. Create one to get started.</p>
        )}
        {!loading && sortedTeams.length > 0 && (
          <div className="mt-4 space-y-3">
            {sortedTeams.map((team) => (
              <div
                key={team.team_id}
                className="flex items-center justify-between rounded-xl border border-gray-100/80 bg-white px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">{team.name}</p>
                  <p className="text-xs text-gray-500">Assign members from the Members tab.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">
                  Team
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
