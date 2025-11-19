import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../lib/database.types';

type WorkspaceRow = Database['public']['Tables']['workspace_settings']['Row'];

export function useWorkspaceSettings() {
  const { roleInfo } = useAuth();
  const workspaceId = roleInfo?.workspaceId || null;
  const [workspace, setWorkspace] = useState<WorkspaceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspace = useCallback(async () => {
    if (!workspaceId) {
      setWorkspace(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('workspace_settings')
      .select('*')
      .eq('id', workspaceId)
      .maybeSingle();

    if (error) {
      console.error('Error loading workspace settings:', error);
      setError('Unable to load workspace settings.');
    } else {
      setWorkspace(data);
    }

    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  const updateWorkspace = async (payload: Partial<WorkspaceRow>) => {
    if (!workspaceId) return { error: new Error('Workspace not found') };

    const { data, error } = await supabase
      .from('workspace_settings')
      .update({
        ...payload,
        updated_at: new Date().toISOString()
      })
      .eq('id', workspaceId)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('Error updating workspace settings:', error);
      return { error };
    }

    if (data) {
      setWorkspace(data);
    }
    return { error: null };
  };

  return {
    workspace,
    loading,
    error,
    refresh: fetchWorkspace,
    updateWorkspace
  };
}
