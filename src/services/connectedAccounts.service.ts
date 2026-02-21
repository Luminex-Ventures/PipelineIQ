/**
 * Luma Conversations – connected accounts (read-only from client).
 * Connect/disconnect via Edge Functions (conversationsApi).
 */

import { supabase } from '../lib/supabase';
import type { ConnectedAccount, ConnectedAccountProvider } from '../types/conversations';

const TABLE = 'connected_accounts';

export async function listConnectedAccounts(userId: string): Promise<ConnectedAccount[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('provider');
  if (error) throw new Error(error.message);
  return (data ?? []) as ConnectedAccount[];
}

export async function getConnectedAccountByProvider(
  userId: string,
  provider: ConnectedAccountProvider
): Promise<ConnectedAccount | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ConnectedAccount | null;
}
