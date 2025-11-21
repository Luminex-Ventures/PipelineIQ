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

  return { teams, loading, refresh: fetchTeams };
}
