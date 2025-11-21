import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface WorkspaceTeam {
  team_id: string;
  name: string;
}

export function useWorkspaceTeams(workspaceId?: string | null) {
  const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTeams = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('get_workspace_teams', {
      p_workspace_id: workspaceId,
    });
    if (!error) {
      setTeams((data as WorkspaceTeam[]) || []);
    } else {
      setTeams([]);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const createTeam = useCallback(
    async (name: string, userId?: string | null) => {
      if (!workspaceId) return { error: new Error('Workspace is required') };
      const trimmedName = name.trim();
      if (!trimmedName) return { error: new Error('Team name is required') };

      const { data: team, error } = await supabase
        .from('teams')
        .insert({ name: trimmedName })
        .select('id, name')
        .single();

      if (error || !team) {
        return { error };
      }

      if (userId) {
        const { error: membershipError } = await supabase
          .from('user_teams')
          .upsert({ user_id: userId, team_id: team.id, role: 'team_lead' });
        if (membershipError) {
          return { error: membershipError };
        }
      }

      await fetchTeams();
      return { error: null };
    },
    [workspaceId, fetchTeams]
  );

  return { teams, loading, refresh: fetchTeams, createTeam };
}
