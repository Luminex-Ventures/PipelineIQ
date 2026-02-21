/**
 * Phase 2: Automation engine (cron every 1–5 min).
 * Consumes messaging_events where processed_at IS NULL,
 * evaluates active automations (trigger_type + conditions),
 * executes actions: start sequence, enqueue message, create task, etc.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface Automation {
  id: string;
  user_id: string;
  trigger_type: string;
  conditions: Record<string, unknown>;
  actions: unknown[];
}

function conditionsMatch(conditions: Record<string, unknown>, payload: Record<string, unknown>): boolean {
  if (!conditions || Object.keys(conditions).length === 0) return true;
  if (conditions.tags && Array.isArray(conditions.tags)) {
    const contactTags = (payload.contact_tags as string[]) ?? [];
    const required = conditions.tags as string[];
    if (required.some((t) => !contactTags.includes(t))) return false;
  }
  if (conditions.stage_id != null && payload.to_stage_id !== conditions.stage_id) return false;
  if (conditions.trigger_type != null && payload.type !== conditions.trigger_type) return false;
  return true;
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  const { data: events } = await supabase
    .from('messaging_events')
    .select('id, user_id, type, payload')
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(100);

  if (!events?.length) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: automations } = await supabase
    .from('messaging_automations')
    .select('id, user_id, trigger_type, conditions, actions')
    .eq('is_active', true);

  const byUser = (automations ?? []).reduce((acc, a) => {
    const u = (a as Automation).user_id;
    if (!acc[u]) acc[u] = [];
    acc[u].push(a as Automation);
    return acc;
  }, {} as Record<string, Automation[]>);

  let processed = 0;
  for (const evt of events) {
    const list = byUser[evt.user_id] ?? [];
    const payload = (evt.payload as Record<string, unknown>) ?? {};
    const eventType = evt.type as string;

    for (const auto of list) {
      if (auto.trigger_type !== eventType) continue;
      if (!conditionsMatch(auto.conditions, payload)) continue;

      const actions = (auto.actions as Record<string, unknown>[]) ?? [];
      for (const action of actions) {
        const kind = action.kind as string;
        if (kind === 'start_sequence' && action.sequence_id && action.contact_id) {
          const seqId = action.sequence_id as string;
          const contactId = action.contact_id as string;
          const { data: steps } = await supabase
            .from('messaging_sequence_steps')
            .select('step_key, delay_minutes')
            .eq('sequence_id', seqId)
            .order('step_key')
            .limit(1);
          const firstStep = steps?.[0] as { step_key: string; delay_minutes: number } | undefined;
          const nextRun = firstStep
            ? (() => {
                const d = new Date();
                d.setMinutes(d.getMinutes() + (firstStep.delay_minutes ?? 0));
                return d.toISOString();
              })()
            : null;
          await supabase.from('messaging_sequence_enrollments').upsert(
            {
              sequence_id: seqId,
              user_id: evt.user_id,
              contact_id: contactId,
              status: 'active',
              current_step_key: null,
              next_run_at: nextRun,
              last_outbound_at: null,
              last_inbound_at: null,
              updated_at: now,
            },
            { onConflict: 'sequence_id,contact_id' }
          );
        }
        if (kind === 'enqueue_message' && action.contact_id && action.channel && action.body) {
          const idemKey = `auto-${evt.id}-${auto.id}-${action.contact_id}`;
          await supabase.from('message_send_queue').upsert(
            {
              user_id: evt.user_id,
              contact_id: action.contact_id,
              thread_id: action.thread_id ?? null,
              channel: action.channel,
              to_address: action.to_address ?? null,
              to_phone: action.to_phone ?? null,
              payload: { subject: action.subject ?? null, body: action.body },
              idempotency_key: idemKey,
              status: 'queued',
              attempts: 0,
              next_attempt_at: now,
              updated_at: now,
            },
            { onConflict: 'idempotency_key' }
          );
        }
      }
    }

    await supabase
      .from('messaging_events')
      .update({ processed_at: now })
      .eq('id', evt.id);
    processed++;
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
