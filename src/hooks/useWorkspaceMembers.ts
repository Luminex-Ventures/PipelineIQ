import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { GlobalRole } from '../lib/database.types';

export interface WorkspaceMember {
  user_id: string;
  email: string | null;
  full_name: string | null;
  global_role: GlobalRole;
  team_role: string | null;
  team_id: string | null;
  is_active: boolean;
  last_sign_in_at: string | null;
}

export function useWorkspaceMembers(workspaceId?: string | null) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    const { data, error } = await (supabase.rpc as any)('get_workspace_members', {
      p_workspace_id: workspaceId,
    });
    if (error) {
      setError(error.message);
      setMembers([]);
    } else {
      setMembers((data as WorkspaceMember[]) || []);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const manageMember = useCallback(
    async (
      targetUser: string,
      action: 'update_role' | 'deactivate' | 'reactivate' | 'delete',
      newRole?: GlobalRole
    ) => {
      const { error } = await (supabase.rpc as any)('manage_workspace_member', {
        target_user: targetUser,
        action,
        new_role: newRole ?? null,
      });
      if (!error) {
        await fetchMembers();
      }
      return { error };
    },
    [fetchMembers]
  );

  return {
    members,
    loading,
    error,
    refresh: fetchMembers,
    changeRole: (userId: string, role: GlobalRole) => manageMember(userId, 'update_role', role),
    deactivate: (userId: string) => manageMember(userId, 'deactivate'),
    reactivate: (userId: string) => manageMember(userId, 'reactivate'),
    remove: (userId: string) => manageMember(userId, 'delete'),
    updateTeam: async (userId: string, teamId: string | null) => {
      if (!teamId) return { error: new Error('Team is required') };
      // Clear existing team memberships then add the new one.
      const { error: deleteError } = await supabase.from('user_teams').delete().eq('user_id', userId);
      if (deleteError) return { error: deleteError };

      const { error: insertError } = await (supabase
        .from('user_teams') as any)
        .upsert({ user_id: userId, team_id: teamId, role: 'agent' });
      if (insertError) return { error: insertError };

      await fetchMembers();
      return { error: null };
    },
  };
}
