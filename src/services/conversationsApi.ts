/**
 * Client for Luma Conversations Edge Functions.
 * OAuth, sync, send email/SMS – all go through these invocations.
 */

import { supabase } from '../lib/supabase';

export type OAuthProvider = 'gmail' | 'microsoft';

export interface OAuthStartResult {
  auth_url: string;
  state: string;
}

export async function startOAuth(provider: OAuthProvider): Promise<OAuthStartResult> {
  const { data, error } = await supabase.functions.invoke<OAuthStartResult>(
    'conversations-oauth-start',
    { body: { provider } }
  );
  if (error) throw new Error(error.message ?? 'Failed to start OAuth');
  if (!data?.auth_url) throw new Error('Invalid OAuth start response');
  return data;
}

export async function syncEmailMessages(accountId: string): Promise<{ synced: number }> {
  const { data, error } = await supabase.functions.invoke<{ synced: number }>(
    'conversations-sync-email',
    { body: { connected_account_id: accountId } }
  );
  if (error) throw new Error(error.message ?? 'Failed to sync email');
  return data ?? { synced: 0 };
}

export interface SendEmailPayload {
  thread_id?: string;
  to?: string;
  subject?: string;
  body: string;
  body_html?: string;
}

export async function sendEmailViaApi(payload: SendEmailPayload): Promise<{ message_id: string }> {
  const { data, error } = await supabase.functions.invoke<{ message_id: string }>(
    'conversations-send-email',
    { body: payload }
  );
  if (error) throw new Error(error.message ?? 'Failed to send email');
  if (!data?.message_id) throw new Error('Invalid send email response');
  return data;
}

export interface SendSmsPayload {
  thread_id?: string;
  to_phone: string;
  body: string;
}

export async function sendSmsViaApi(payload: SendSmsPayload): Promise<{ message_id: string }> {
  const { data, error } = await supabase.functions.invoke<{ message_id: string }>(
    'conversations-send-sms',
    { body: payload }
  );
  if (error) throw new Error(error.message ?? 'Failed to send SMS');
  if (!data?.message_id) throw new Error('Invalid send SMS response');
  return data;
}

export interface ConnectTwilioPayload {
  account_sid: string;
  auth_token: string;
  from_phone: string;
}

export async function connectTwilioViaApi(payload: ConnectTwilioPayload): Promise<{ account_id: string }> {
  const { data, error } = await supabase.functions.invoke<{ account_id: string }>(
    'conversations-twilio-connect',
    { body: payload }
  );
  if (error) throw new Error(error.message ?? 'Failed to connect Twilio');
  if (!data?.account_id) throw new Error('Invalid Twilio connect response');
  return data;
}

export async function disconnectAccount(provider: 'gmail' | 'microsoft' | 'twilio'): Promise<void> {
  const { error } = await supabase.functions.invoke('conversations-disconnect', {
    body: { provider },
  });
  if (error) throw new Error(error.message ?? 'Failed to disconnect');
}
