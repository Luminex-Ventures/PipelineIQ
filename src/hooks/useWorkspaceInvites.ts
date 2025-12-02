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

  const sendInviteEmail = async (inviteId: string) => {
    try {
      const { error: fnError } = await supabase.functions.invoke('send-invite-email', {
        body: { inviteId, origin: typeof window !== 'undefined' ? window.location.origin : undefined },
      });
      if (fnError) {
        console.error('Invite email dispatch failed', fnError);
      }
    } catch (err) {
      console.error('Invite email dispatch failed', err);
    }
  };

  const fetchInvites = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('workspace_invitations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
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

  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel(`workspace-invitations-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workspace_invitations', filter: `workspace_id=eq.${workspaceId}` },
        () => {
          fetchInvites();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, fetchInvites]);

  const createInvite = useCallback(
    async ({ email, intendedRole, teamId }: CreateInvitePayload) => {
      if (!workspaceId) return { error: new Error('Workspace is required') };
      if (!teamId) return { error: new Error('Team is required for invites') };
      const { data, error} = await (supabase
        .from('workspace_invitations') as any)
        .insert({
          email,
          intended_role: intendedRole,
          workspace_id: workspaceId,
          team_id: teamId ?? null,
        })
        .select('*')
        .single();
      if (!error && data) {
        await sendInviteEmail((data as any).id);
        await fetchInvites();
      }
      return { error };
    },
    [workspaceId, fetchInvites]
  );

  const cancelInvite = useCallback(
    async (inviteId: string) => {
      const { error } = await (supabase
        .from('workspace_invitations') as any)
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
      const { data, error } = await (supabase
        .from('workspace_invitations') as any)
        .update({
          status: 'pending',
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', inviteId)
        .select('*')
        .single();
      if (!error && data) {
        await sendInviteEmail((data as any).id);
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
