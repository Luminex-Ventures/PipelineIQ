/**
 * Phase 3: Retention worker (daily cron).
 * Applies retention_policies: deletes/archives messages, calls, transcripts older than configured days.
 * Logs deletions to audit_ledger.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();

  const { data: policies } = await supabase
    .from('retention_policies')
    .select('id, org_id, user_id, messages_days, calls_days, transcripts_days');

  let totalMessages = 0;
  let totalTranscripts = 0;
  let totalCalls = 0;

  for (const policy of policies ?? []) {
    const userId = policy.user_id;
    const orgId = policy.org_id;
    let deletedMessages = 0;
    let deletedTranscripts = 0;
    let deletedCalls = 0;

    if (policy.transcripts_days != null && policy.transcripts_days > 0 && userId) {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - policy.transcripts_days);
      const cutoffIso = cutoff.toISOString();

      const { data: transcripts } = await supabase
        .from('call_transcripts')
        .select('id')
        .eq('user_id', userId)
        .lt('created_at', cutoffIso);

      for (const t of transcripts ?? []) {
        await supabase.from('call_transcripts').delete().eq('id', t.id);
        deletedTranscripts++;
      }
    }

    if (policy.calls_days != null && policy.calls_days > 0 && userId) {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - policy.calls_days);
      const cutoffIso = cutoff.toISOString();

      const { data: oldCalls } = await supabase
        .from('calls')
        .select('id')
        .eq('user_id', userId)
        .lt('created_at', cutoffIso);

      for (const c of oldCalls ?? []) {
        await supabase.from('calls').delete().eq('id', c.id);
        deletedCalls++;
      }
    }

    if (policy.messages_days != null && policy.messages_days > 0 && userId) {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - policy.messages_days);
      const cutoffIso = cutoff.toISOString();

      const { data: oldMessages } = await supabase
        .from('conversation_messages')
        .select('id')
        .eq('user_id', userId)
        .lt('sent_at', cutoffIso);

      for (const m of oldMessages ?? []) {
        await supabase.from('conversation_messages').delete().eq('id', m.id);
        deletedMessages++;
      }
    }

    totalMessages += deletedMessages;
    totalTranscripts += deletedTranscripts;
    totalCalls += deletedCalls;

    await supabase.from('audit_ledger').insert({
      org_id: orgId ?? null,
      user_id: userId ?? null,
      actor_type: 'system',
      actor_id: null,
      action_type: 'retention_applied',
      object_type: 'retention_policy',
      object_id: policy.id,
      reason: 'Scheduled retention run',
      payload: {
        messages_deleted: deletedMessages,
        transcripts_deleted: deletedTranscripts,
        calls_deleted: deletedCalls,
      },
    });
  }

  return new Response(
    JSON.stringify({
      policies_processed: policies?.length ?? 0,
      deleted_messages: totalMessages,
      deleted_transcripts: totalTranscripts,
      deleted_calls: totalCalls,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
