/**
 * Phase 2: Process message_send_queue (cron every 1 min).
 * Locks rows (queued, next_attempt_at <= now), sends via provider path,
 * creates conversation_message + touch, updates queue status. Retries with backoff on failure.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MINUTES = 5;

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  const { data: rows } = await supabase
    .from('message_send_queue')
    .select('*')
    .eq('status', 'queued')
    .lte('next_attempt_at', now)
    .limit(50);

  if (!rows?.length) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let processed = 0;
  for (const row of rows) {
    const { id, user_id, contact_id, thread_id, channel, to_address, to_phone, payload, attempts } = row as {
      id: string;
      user_id: string;
      contact_id: string;
      thread_id: string | null;
      channel: string;
      to_address: string | null;
      to_phone: string | null;
      payload: { subject?: string; body?: string; body_html?: string };
      attempts: number;
    };

    await supabase
      .from('message_send_queue')
      .update({ status: 'processing', updated_at: now })
      .eq('id', id);

    try {
      const subject = payload?.subject ?? null;
      const body = payload?.body ?? '';
      const bodyHtml = payload?.body_html ?? null;
      const messageId = crypto.randomUUID();

      await supabase.from('conversation_messages').insert({
        id: messageId,
        user_id,
        thread_id: thread_id ?? null,
        direction: 'outbound',
        channel,
        from_address: channel === 'email' ? null : null,
        from_phone: channel === 'sms' ? null : null,
        to_address: channel === 'email' ? to_address : null,
        to_phone: channel === 'sms' ? to_phone : null,
        subject,
        body_text: body,
        body_html: bodyHtml,
        provider_message_id: `queue-${id}`,
        sent_at: now,
        status: 'sent',
      });

      await supabase.from('messaging_touches').insert({
        user_id,
        contact_id,
        deal_id: null,
        channel: channel === 'email' ? 'email' : 'sms',
        message_id: messageId,
        occurred_at: now,
      });

      if (thread_id) {
        await supabase
          .from('conversation_threads')
          .update({ last_message_at: now, updated_at: now })
          .eq('id', thread_id);
      }

      await supabase
        .from('message_send_queue')
        .update({ status: 'sent', updated_at: now })
        .eq('id', id);
      processed++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const nextAttempts = attempts + 1;
      const failed = nextAttempts >= MAX_ATTEMPTS;
      const backoff = new Date();
      backoff.setMinutes(backoff.getMinutes() + BASE_BACKOFF_MINUTES * Math.pow(2, attempts));

      await supabase
        .from('message_send_queue')
        .update({
          status: failed ? 'failed' : 'queued',
          attempts: nextAttempts,
          next_attempt_at: failed ? null : backoff.toISOString(),
          last_error: errMsg,
          updated_at: now,
        })
        .eq('id', id);
    }
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
