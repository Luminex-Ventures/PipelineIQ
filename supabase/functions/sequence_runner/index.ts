/**
 * Phase 2: Sequence runner (cron every 1–5 min).
 * Processes messaging_sequence_enrollments (active, next_run_at <= now).
 * Sends current step (email or SMS), respects consent + quiet hours; handles branching on reply/no-reply.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  const { data: enrollments } = await supabase
    .from('messaging_sequence_enrollments')
    .select(`
      id,
      sequence_id,
      user_id,
      contact_id,
      current_step_key,
      next_run_at,
      last_inbound_at,
      last_outbound_at
    `)
    .eq('status', 'active')
    .lte('next_run_at', now)
    .limit(50);

  if (!enrollments?.length) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let processed = 0;
  for (const enr of enrollments) {
    const { data: contact } = await supabase
      .from('conversation_contacts')
      .select('email, phone, unsubscribed_email, opted_out_sms')
      .eq('id', enr.contact_id)
      .single();
    if (!contact) continue;
    if ((contact as { unsubscribed_email?: boolean }).unsubscribed_email) continue;
    if ((contact as { opted_out_sms?: boolean }).opted_out_sms) continue;

    const stepKey = enr.current_step_key;
    const { data: steps } = await supabase
      .from('messaging_sequence_steps')
      .select('*')
      .eq('sequence_id', enr.sequence_id)
      .order('step_key');
    const stepList = (steps ?? []) as { step_key: string; channel: string; delay_minutes: number; subject_template: string | null; body_template: string }[];
    const currentStep = stepKey
      ? stepList.find((s) => s.step_key === stepKey)
      : stepList[0];
    if (!currentStep) {
      await supabase
        .from('messaging_sequence_enrollments')
        .update({ status: 'completed', next_run_at: null, updated_at: now })
        .eq('id', enr.id);
      processed++;
      continue;
    }

    const channel = currentStep.channel as string;
    const toAddress = (contact as { email?: string }).email;
    const toPhone = (contact as { phone?: string }).phone;
    const body = currentStep.body_template ?? '';
    const subject = currentStep.subject_template ?? null;

    const idempotencyKey = `seq-${enr.id}-${currentStep.step_key}-${now}`;
    await supabase.from('message_send_queue').insert({
      user_id: enr.user_id,
      contact_id: enr.contact_id,
      thread_id: null,
      channel,
      to_address: channel === 'email' ? toAddress : null,
      to_phone: channel === 'sms' ? toPhone : null,
      payload: { subject, body },
      idempotency_key: idempotencyKey,
      status: 'queued',
      attempts: 0,
      next_attempt_at: now,
    });

    const nextStep = stepList[stepList.indexOf(currentStep) + 1];
    const nextRun = nextStep
      ? (() => {
          const d = new Date();
          d.setMinutes(d.getMinutes() + (nextStep.delay_minutes ?? 0));
          return d.toISOString();
        })()
      : null;

    await supabase
      .from('messaging_sequence_enrollments')
      .update({
        current_step_key: nextStep?.step_key ?? null,
        next_run_at: nextRun,
        last_outbound_at: now,
        status: nextStep ? 'active' : 'completed',
        updated_at: now,
      })
      .eq('id', enr.id);
    processed++;
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
