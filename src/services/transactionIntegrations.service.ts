/**
 * Transaction & E-sign integrations: list, disconnect, start OAuth (DocuSign, Dotloop).
 */

import { supabase } from '../lib/supabase';
import type { TransactionIntegration } from '../types/transaction';

const TABLE = 'transaction_integrations';

export async function listTransactionIntegrations(
  userId: string
): Promise<TransactionIntegration[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .in('status', ['connected', 'error'])
    .order('provider');
  if (error) throw new Error(error.message);
  return (data ?? []) as TransactionIntegration[];
}

export async function disconnectTransactionIntegration(
  userId: string,
  integrationId: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ status: 'disconnected' })
    .eq('id', integrationId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export interface TransactionOAuthStartResult {
  auth_url: string;
  state: string;
}

export async function startDocuSignOAuth(): Promise<TransactionOAuthStartResult> {
  const { data, error } = await supabase.functions.invoke<TransactionOAuthStartResult>(
    'transaction-docusign-start',
    { body: {} }
  );
  if (error) throw new Error(error.message ?? 'Failed to start DocuSign OAuth');
  if (!data?.auth_url) throw new Error('Invalid DocuSign OAuth start response');
  return data;
}

export async function startDotloopOAuth(): Promise<TransactionOAuthStartResult> {
  const { data, error } = await supabase.functions.invoke<TransactionOAuthStartResult>(
    'transaction-dotloop-start',
    { body: {} }
  );
  if (error) throw new Error(error.message ?? 'Failed to start Dotloop OAuth');
  if (!data?.auth_url) throw new Error('Invalid Dotloop OAuth start response');
  return data;
}

export function getTransactionIntegrationRedirectUrl(): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/workspace-settings?section=integrations`;
}
