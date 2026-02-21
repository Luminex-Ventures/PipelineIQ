/**
 * Luma Conversations – campaigns, steps, enrollments.
 */

import { supabase } from '../lib/supabase';
import type {
  ConversationCampaign,
  CampaignStep,
  CampaignEnrollment,
  ThreadChannel,
  CampaignEnrollmentStatus,
} from '../types/conversations';

const CAMPAIGNS_TABLE = 'conversation_campaigns';
const STEPS_TABLE = 'conversation_campaign_steps';
const ENROLLMENTS_TABLE = 'conversation_campaign_enrollments';

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export async function listCampaigns(userId: string): Promise<ConversationCampaign[]> {
  const { data, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ConversationCampaign[];
}

export async function getCampaign(id: string): Promise<ConversationCampaign | null> {
  const { data, error } = await supabase.from(CAMPAIGNS_TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as ConversationCampaign | null;
}

export async function createCampaign(
  userId: string,
  input: { name: string; channel: ThreadChannel }
): Promise<ConversationCampaign> {
  const { data, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .insert({ user_id: userId, name: input.name, channel: input.channel })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ConversationCampaign;
}

export async function updateCampaign(
  id: string,
  updates: Partial<Pick<ConversationCampaign, 'name' | 'is_active'>>
): Promise<ConversationCampaign> {
  const { data, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ConversationCampaign;
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from(CAMPAIGNS_TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Campaign steps
// ---------------------------------------------------------------------------

export async function listCampaignSteps(campaignId: string): Promise<CampaignStep[]> {
  const { data, error } = await supabase
    .from(STEPS_TABLE)
    .select('*')
    .eq('campaign_id', campaignId)
    .order('step_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CampaignStep[];
}

export async function upsertCampaignSteps(
  campaignId: string,
  steps: { step_order: number; delay_days: number; subject?: string | null; body_template: string }[]
): Promise<CampaignStep[]> {
  const { error: delErr } = await supabase.from(STEPS_TABLE).delete().eq('campaign_id', campaignId);
  if (delErr) throw new Error(delErr.message);
  if (steps.length === 0) return [];
  const { data, error } = await supabase
    .from(STEPS_TABLE)
    .insert(
      steps.map((s) => ({
        campaign_id: campaignId,
        step_order: s.step_order,
        delay_days: s.delay_days,
        subject: s.subject ?? null,
        body_template: s.body_template,
      }))
    )
    .select();
  if (error) throw new Error(error.message);
  return (data ?? []) as CampaignStep[];
}

// ---------------------------------------------------------------------------
// Enrollments
// ---------------------------------------------------------------------------

export async function listEnrollments(
  campaignId: string,
  status?: CampaignEnrollmentStatus
): Promise<CampaignEnrollment[]> {
  let q = supabase
    .from(ENROLLMENTS_TABLE)
    .select(
      `
      *,
      contact:conversation_contacts(*)
    `
    )
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (CampaignEnrollment & { contact: unknown })[];
  return rows.map((r) => ({
    ...r,
    contact: Array.isArray(r.contact) ? r.contact[0] : r.contact,
  })) as CampaignEnrollment[];
}

export async function enrollContacts(
  userId: string,
  campaignId: string,
  contactIds: string[],
  steps: { delay_days: number }[]
): Promise<CampaignEnrollment[]> {
  const now = new Date();
  const inserted: CampaignEnrollment[] = [];
  for (const contactId of contactIds) {
    const nextSendAt =
      steps.length > 0
        ? new Date(now.getTime() + steps[0].delay_days * 24 * 60 * 60 * 1000).toISOString()
        : null;
    const { data, error } = await supabase
      .from(ENROLLMENTS_TABLE)
      .insert({
        campaign_id: campaignId,
        user_id: userId,
        contact_id: contactId,
        status: 'active',
        current_step: 0,
        next_send_at: nextSendAt,
        last_event_at: now.toISOString(),
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') continue; // unique violation = already enrolled
      throw new Error(error.message);
    }
    inserted.push(data as CampaignEnrollment);
  }
  return inserted;
}

export async function updateEnrollmentStatus(
  id: string,
  status: CampaignEnrollmentStatus
): Promise<CampaignEnrollment> {
  const { data, error } = await supabase
    .from(ENROLLMENTS_TABLE)
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CampaignEnrollment;
}

export async function pauseEnrollment(id: string): Promise<CampaignEnrollment> {
  return updateEnrollmentStatus(id, 'paused');
}

export async function resumeEnrollment(id: string): Promise<CampaignEnrollment> {
  return updateEnrollmentStatus(id, 'active');
}
