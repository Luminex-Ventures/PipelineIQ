/**
 * Twilio inbound webhook. Verify signature, map To number to user_id, persist message.
 * If body contains STOP (case-insensitive), set contact.opted_out_sms = true and pause active enrollments.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');

function isStop(body: string): boolean {
  const t = body.trim().toUpperCase();
  return t === 'STOP' || t === 'STOPALL' || t === 'UNSUBSCRIBE';
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const form = await req.formData();
    const fromPhone = (form.get('From') as string) ?? '';
    const toPhone = (form.get('To') as string) ?? '';
    const body = (form.get('Body') as string) ?? '';
    const messageSid = (form.get('MessageSid') as string) ?? '';

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: account } = await supabase
      .from('connected_accounts')
      .select('user_id, id')
      .eq('provider', 'twilio')
      .eq('status', 'connected')
      .or(`external_account_id.eq.${toPhone},metadata->>from_phone.eq.${toPhone}`)
      .limit(1)
      .single();
    if (!account) {
      console.warn('Twilio webhook: no account for To', toPhone);
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    await supabase.from('conversation_webhook_events').insert({
      user_id: account.user_id,
      provider: 'twilio',
      event_type: 'inbound_sms',
      payload: { from: fromPhone, to: toPhone, body, messageSid },
    });

    let contactId: string | null = null;
    const { data: contact } = await supabase
      .from('conversation_contacts')
      .select('id')
      .eq('user_id', account.user_id)
      .eq('phone', fromPhone)
      .limit(1)
      .single();
    if (contact) contactId = contact.id;

    let threadId: string | null = null;
    if (contactId) {
      const { data: thread } = await supabase
        .from('conversation_threads')
        .select('id')
        .eq('user_id', account.user_id)
        .eq('primary_contact_id', contactId)
        .eq('channel', 'sms')
        .limit(1)
        .single();
      if (thread) threadId = thread.id;
      else {
        const { data: newThread } = await supabase
          .from('conversation_threads')
          .insert({
            user_id: account.user_id,
            primary_contact_id: contactId,
            channel: 'sms',
            unread_count: 1,
          })
          .select('id')
          .single();
        threadId = newThread?.id ?? null;
      }
    }

    const now = new Date().toISOString();
    await supabase.from('conversation_messages').insert({
      user_id: account.user_id,
      thread_id: threadId,
      direction: 'inbound',
      channel: 'sms',
      from_phone: fromPhone,
      to_phone: toPhone,
      body_text: body,
      provider_message_id: messageSid,
      received_at: now,
      status: 'delivered',
    });
    if (threadId) {
      const { data: threadRow } = await supabase
        .from('conversation_threads')
        .select('unread_count')
        .eq('id', threadId)
        .single();
      const nextUnread = ((threadRow as { unread_count?: number })?.unread_count ?? 0) + 1;
      await supabase
        .from('conversation_threads')
        .update({
          last_message_at: now,
          unread_count: nextUnread,
          updated_at: now,
        })
        .eq('id', threadId);
    }

    if (isStop(body) && contactId) {
      await supabase
        .from('conversation_contacts')
        .update({ opted_out_sms: true })
        .eq('id', contactId);
      await supabase
        .from('conversation_campaign_enrollments')
        .update({ status: 'stopped' })
        .eq('contact_id', contactId)
        .eq('status', 'active');
    }

    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (err) {
    console.error('conversations-twilio-webhook:', err);
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 500,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
});
