import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Database, GlobalRole } from '../lib/database.types';

type Invitation = Database['public']['Tables']['workspace_invitations']['Row'];

interface CreateInvitePayload {
  email: string;
  intendedRole: GlobalRole;
  teamId?: string | null;
}

export function useWorkspaceInvites(workspaceId?: string | null) {
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('workspace_invitations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      setError(error.message);
      setInvites([]);
    } else {
      setInvites(data || []);
    }

    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const createInvite = useCallback(
    async ({ email, intendedRole, teamId }: CreateInvitePayload) => {
      if (!workspaceId) return { error: new Error('Workspace is required') };
      const { error } = await supabase.from('workspace_invitations').insert({
        email,
        intended_role: intendedRole,
        workspace_id: workspaceId,
        team_id: teamId ?? null,
      });
      if (!error) {
        await fetchInvites();
      }
      return { error };
    },
    [workspaceId, fetchInvites]
  );

  const cancelInvite = useCallback(
    async (inviteId: string) => {
      const { error } = await supabase
        .from('workspace_invitations')
        .update({ status: 'canceled' })
        .eq('id', inviteId);
      if (!error) {
        await fetchInvites();
      }
      return { error };
    },
    [fetchInvites]
  );

  const resendInvite = useCallback(
    async (inviteId: string) => {
      const { error } = await supabase
        .from('workspace_invitations')
        .update({
          status: 'pending',
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', inviteId);
      if (!error) {
        await fetchInvites();
      }
      return { error };
    },
    [fetchInvites]
  );

  return {
    invites,
    loading,
    error,
    refresh: fetchInvites,
    createInvite,
    cancelInvite,
    resendInvite,
  };
}
