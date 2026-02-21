/**
 * Campaign runner (cron, e.g. every 5 min).
 * Find enrollments with next_send_at <= now and status=active; skip if opted_out/unsubscribed.
 * Send current step (email or SMS), advance current_step, set next_send_at; mark completed when done.
 * If contact replied after last outbound in thread, pause enrollment (MVP rule).
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  const { data: enrollments } = await supabase
    .from('conversation_campaign_enrollments')
    .select(`
      id,
      campaign_id,
      user_id,
      contact_id,
      current_step,
      next_send_at,
      campaign:conversation_campaigns(id, channel, is_active),
      contact:conversation_contacts(email, phone, unsubscribed_email, opted_out_sms)
    `)
    .eq('status', 'active')
    .lte('next_send_at', now);

  if (!enrollments?.length) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stepsByCampaign: Record<string, { id: string; step_order: number; delay_days: number; subject: string | null; body_template: string }[]> = {};
  let processed = 0;

  for (const enr of enrollments) {
    const campaign = Array.isArray(enr.campaign) ? enr.campaign[0] : enr.campaign;
    const contact = Array.isArray(enr.contact) ? enr.contact[0] : enr.contact;
    if (!campaign?.is_active || !contact) continue;
    const channel = campaign.channel as string;
    if (channel === 'email' && (contact as { unsubscribed_email?: boolean }).unsubscribed_email) continue;
    if (channel === 'sms' && (contact as { opted_out_sms?: boolean }).opted_out_sms) continue;

    let steps = stepsByCampaign[enr.campaign_id];
    if (!steps) {
      const { data: s } = await supabase
        .from('conversation_campaign_steps')
        .select('*')
        .eq('campaign_id', enr.campaign_id)
        .order('step_order');
      steps = (s ?? []) as { id: string; step_order: number; delay_days: number; subject: string | null; body_template: string }[];
      stepsByCampaign[enr.campaign_id] = steps;
    }
    const stepIndex = enr.current_step;
    const step = steps[stepIndex];
    if (!step) {
      await supabase
        .from('conversation_campaign_enrollments')
        .update({ status: 'completed', next_send_at: null, updated_at: now })
        .eq('id', enr.id);
      processed++;
      continue;
    }

    const contactId = enr.contact_id;
    const { data: thread } = await supabase
      .from('conversation_threads')
      .select('id')
      .eq('user_id', enr.user_id)
      .eq('primary_contact_id', contactId)
      .eq('channel', channel)
      .single();
    if (thread) {
      const { data: lastOut } = await supabase
        .from('conversation_messages')
        .select('created_at')
        .eq('thread_id', thread.id)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      const { data: lastIn } = await supabase
        .from('conversation_messages')
        .select('created_at')
        .eq('thread_id', thread.id)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (lastOut && lastIn && new Date(lastIn.created_at) > new Date(lastOut.created_at)) {
        await supabase
          .from('conversation_campaign_enrollments')
          .update({ status: 'paused', updated_at: now })
          .eq('id', enr.id);
        processed++;
        continue;
      }
    }

    const body = step.body_template;
    if (channel === 'email') {
      const to = (contact as { email?: string }).email;
      if (to) {
        await supabase.from('conversation_messages').insert({
          user_id: enr.user_id,
          thread_id: thread?.id ?? null,
          direction: 'outbound',
          channel: 'email',
          to_address: to,
          subject: step.subject,
          body_text: body,
          sent_at: now,
          status: 'sent',
        });
      }
    } else {
      const toPhone = (contact as { phone?: string }).phone;
      if (toPhone) {
        await supabase.from('conversation_messages').insert({
          user_id: enr.user_id,
          thread_id: thread?.id ?? null,
          direction: 'outbound',
          channel: 'sms',
          to_phone: toPhone,
          body_text: body,
          sent_at: now,
          status: 'sent',
        });
      }
    }

    const nextStep = steps[stepIndex + 1];
    if (!nextStep) {
      await supabase
        .from('conversation_campaign_enrollments')
        .update({ status: 'completed', current_step: stepIndex + 1, next_send_at: null, last_event_at: now, updated_at: now })
        .eq('id', enr.id);
    } else {
      const nextAt = new Date();
      nextAt.setDate(nextAt.getDate() + nextStep.delay_days);
      await supabase
        .from('conversation_campaign_enrollments')
        .update({
          current_step: stepIndex + 1,
          next_send_at: nextAt.toISOString(),
          last_event_at: now,
          updated_at: now,
        })
        .eq('id', enr.id);
    }
    processed++;
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
