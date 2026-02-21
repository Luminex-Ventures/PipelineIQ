/**
 * Luma Conversations – threads, messages, contacts.
 * All access via Supabase client (RLS enforces user_id = auth.uid()).
 */

import { supabase } from '../lib/supabase';
import type {
  ConversationContact,
  ConversationThread,
  ConversationMessage,
  ThreadChannel,
  MessageDirection,
} from '../types/conversations';

const THREADS_TABLE = 'conversation_threads';
const MESSAGES_TABLE = 'conversation_messages';
const CONTACTS_TABLE = 'conversation_contacts';

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function listContacts(userId: string): Promise<ConversationContact[]> {
  const { data, error } = await supabase
    .from(CONTACTS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('name', { nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ConversationContact[];
}

export async function getContact(id: string): Promise<ConversationContact | null> {
  const { data, error } = await supabase.from(CONTACTS_TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as ConversationContact | null;
}

export async function createContact(
  userId: string,
  input: { name?: string; email?: string; phone?: string; tags?: string[] }
): Promise<ConversationContact> {
  const { data, error } = await supabase
    .from(CONTACTS_TABLE)
    .insert({
      user_id: userId,
      name: input.name ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      tags: input.tags ?? [],
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ConversationContact;
}

export async function updateContact(
  id: string,
  updates: Partial<Pick<ConversationContact, 'name' | 'email' | 'phone' | 'tags' | 'unsubscribed_email' | 'opted_out_sms'>>
): Promise<ConversationContact> {
  const { data, error } = await supabase
    .from(CONTACTS_TABLE)
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ConversationContact;
}

export async function optOutSmsByPhone(userId: string, phone: string): Promise<void> {
  const { error } = await supabase
    .from(CONTACTS_TABLE)
    .update({ opted_out_sms: true })
    .eq('user_id', userId)
    .eq('phone', phone);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export interface ListThreadsFilters {
  channel?: ThreadChannel;
  unreadOnly?: boolean;
  search?: string;
}

export async function listThreads(
  userId: string,
  filters: ListThreadsFilters = {},
  limit = 50
): Promise<ConversationThread[]> {
  let q = supabase
    .from(THREADS_TABLE)
    .select(
      `
      *,
      contact:conversation_contacts(id, name, email, phone)
    `
    )
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (filters.channel) q = q.eq('channel', filters.channel);
  if (filters.unreadOnly) q = q.gt('unread_count', 0);

  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const threads = (rows ?? []) as (ConversationThread & { contact: ConversationContact[] })[];

  if (filters.search && filters.search.trim()) {
    const term = filters.search.trim().toLowerCase();
    return threads.filter((t) => {
      const c = Array.isArray(t.contact) ? t.contact[0] : t.contact;
      const name = (c?.name ?? '').toLowerCase();
      const email = (c?.email ?? '').toLowerCase();
      const phone = (c?.phone ?? '').toLowerCase();
      return name.includes(term) || email.includes(term) || phone.includes(term);
    });
  }

  return threads.map((t) => ({
    ...t,
    contact: Array.isArray(t.contact) ? t.contact[0] ?? null : t.contact ?? null,
  })) as ConversationThread[];
}

export async function getThread(id: string): Promise<ConversationThread | null> {
  const { data, error } = await supabase
    .from(THREADS_TABLE)
    .select(
      `
      *,
      contact:conversation_contacts(*)
    `
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as ConversationThread & { contact: ConversationContact[] };
  return {
    ...row,
    contact: Array.isArray(row.contact) ? row.contact[0] ?? null : row.contact ?? null,
  } as ConversationThread;
}

export async function getOrCreateThread(
  userId: string,
  contactId: string,
  channel: ThreadChannel,
  subject?: string | null
): Promise<ConversationThread> {
  const existing = await supabase
    .from(THREADS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('primary_contact_id', contactId)
    .eq('channel', channel)
    .maybeSingle();
  if (existing.data) return existing.data as ConversationThread;
  const { data, error } = await supabase
    .from(THREADS_TABLE)
    .insert({
      user_id: userId,
      primary_contact_id: contactId,
      channel,
      subject: subject ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ConversationThread;
}

export async function markThreadRead(id: string): Promise<void> {
  const { error } = await supabase
    .from(THREADS_TABLE)
    .update({ unread_count: 0 })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function listMessages(threadId: string, limit = 100): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ConversationMessage[];
}

export async function getMessage(id: string): Promise<ConversationMessage | null> {
  const { data, error } = await supabase.from(MESSAGES_TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as ConversationMessage | null;
}

export async function insertMessage(
  userId: string,
  input: {
    thread_id: string;
    direction: MessageDirection;
    channel: ThreadChannel;
    from_address?: string | null;
    from_phone?: string | null;
    to_address?: string | null;
    to_phone?: string | null;
    subject?: string | null;
    body_text: string;
    body_html?: string | null;
    provider_message_id?: string | null;
    sent_at?: string | null;
    status?: 'queued' | 'sent' | 'delivered' | 'failed';
    error?: string | null;
  }
): Promise<ConversationMessage> {
  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .insert({
      user_id: userId,
      thread_id: input.thread_id,
      direction: input.direction,
      channel: input.channel,
      from_address: input.from_address ?? null,
      from_phone: input.from_phone ?? null,
      to_address: input.to_address ?? null,
      to_phone: input.to_phone ?? null,
      subject: input.subject ?? null,
      body_text: input.body_text,
      body_html: input.body_html ?? null,
      provider_message_id: input.provider_message_id ?? null,
      sent_at: input.sent_at ?? null,
      received_at: input.direction === 'inbound' ? new Date().toISOString() : null,
      status: input.status ?? 'sent',
      error: input.error ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ConversationMessage;
}

export async function getLastOutboundMessage(threadId: string): Promise<ConversationMessage | null> {
  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .select('*')
    .eq('thread_id', threadId)
    .eq('direction', 'outbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ConversationMessage | null;
}

export async function getLastInboundMessage(threadId: string): Promise<ConversationMessage | null> {
  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .select('*')
    .eq('thread_id', threadId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ConversationMessage | null;
}
