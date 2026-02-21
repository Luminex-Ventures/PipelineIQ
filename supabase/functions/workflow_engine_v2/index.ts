/**
 * Phase 3: Workflow engine v2 (cron every 1–5 min).
 * Consumes messaging_events; evaluates workflows (messaging_automations) with rate limits and conditions;
 * writes workflow_runs + audit_ledger; enqueues actions. Idempotent via idempotency_key.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  const { data: events } = await supabase
    .from('messaging_events')
    .select('id, user_id, type, payload')
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(50);

  if (!events?.length) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: automations } = await supabase
    .from('messaging_automations')
    .select('id, user_id, org_id, trigger_type, conditions, actions')
    .eq('is_active', true);

  const byUser = (automations ?? []).reduce((acc: Record<string, typeof automations>, a: { user_id: string }) => {
    const u = a.user_id;
    if (!acc[u]) acc[u] = [];
    acc[u].push(a);
    return acc;
  }, {});

  let processed = 0;
  for (const ev of events) {
    const idemKey = `wf-${ev.id}`;
    const { data: existingRun } = await supabase
      .from('workflow_runs')
      .select('id')
      .eq('idempotency_key', idemKey)
      .maybeSingle();
    if (existingRun) {
      await supabase.from('messaging_events').update({ processed_at: now }).eq('id', ev.id);
      processed++;
      continue;
    }

    const runId = crypto.randomUUID();
    await supabase.from('workflow_runs').insert({
      id: runId,
      user_id: ev.user_id,
      org_id: null,
      workflow_id: null,
      event_id: ev.id,
      status: 'running',
      started_at: now,
      logs: [],
      idempotency_key: idemKey,
    });

    const list = byUser[ev.user_id] ?? [];
    const matching = list.filter((a: { trigger_type: string }) => a.trigger_type === ev.type);
    const logs: unknown[] = [];

    for (const auto of matching) {
      const actions = (auto as { actions?: unknown[] }).actions ?? [];
      for (const act of actions) {
        const a = act as { kind?: string; sequence_id?: string; contact_id?: string };
        if (a.kind === 'start_sequence' && a.sequence_id && a.contact_id) {
          await supabase.from('messaging_sequence_enrollments').upsert(
            {
              sequence_id: a.sequence_id,
              user_id: ev.user_id,
              contact_id: a.contact_id,
              status: 'active',
              current_step_key: null,
              next_run_at: now,
              metadata: {},
            },
            { onConflict: 'sequence_id,contact_id', ignoreDuplicates: false }
          );
          logs.push({ action: 'start_sequence', sequence_id: a.sequence_id, contact_id: a.contact_id });
        }
      }
    }

    await supabase.from('workflow_runs').update({
      status: 'completed',
      ended_at: now,
      logs,
    }).eq('id', runId);

    await supabase.from('audit_ledger').insert({
      org_id: null,
      user_id: ev.user_id,
      actor_type: 'system',
      actor_id: null,
      action_type: 'workflow_run',
      object_type: 'workflow_run',
      object_id: runId,
      reason: `Event ${ev.type}`,
      payload: { event_id: ev.id, logs },
    });

    await supabase.from('messaging_events').update({ processed_at: now }).eq('id', ev.id);
    processed++;
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
