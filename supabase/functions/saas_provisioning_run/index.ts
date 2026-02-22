/**
 * SaaS: Run one provisioning job (create org, workspace, owner, subscription).
 * Invoked by stripe_webhook or by cron for retries. Idempotent on reservation state.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: { job_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const jobId = body.job_id;
  if (!jobId) {
    return jsonResponse({ error: 'Missing job_id' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: job, error: jobErr } = await supabase
    .from('provisioning_jobs')
    .select('id, reservation_id, status, attempts, max_attempts')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) {
    return jsonResponse({ error: 'Job not found' }, 404);
  }

  if (job.status === 'succeeded') {
    return jsonResponse({ ok: true, already_succeeded: true }, 200);
  }

  if (job.status === 'running') {
    return jsonResponse({ error: 'Job already running' }, 409);
  }

  if (job.attempts >= job.max_attempts) {
    return jsonResponse({ error: 'Max attempts exceeded' }, 400);
  }

  const { data: reservation, error: resErr } = await supabase
    .from('tenant_reservations')
    .select('id, subdomain, plan_code, workspace_name, owner_email, owner_user_id, state, organization_id, provider_customer_id, provider_subscription_id')
    .eq('id', job.reservation_id)
    .single();

  if (resErr || !reservation) {
    await supabase.from('provisioning_jobs').update({
      status: 'failed',
      error_message: 'Reservation not found',
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);
    return jsonResponse({ error: 'Reservation not found' }, 404);
  }

  if (reservation.state === 'active' && reservation.organization_id) {
    await supabase.from('provisioning_jobs').update({
      status: 'succeeded',
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);
    return jsonResponse({ ok: true, already_provisioned: true }, 200);
  }

  await supabase.from('provisioning_jobs').update({
    status: 'running',
    attempts: job.attempts + 1,
    started_at: new Date().toISOString(),
  }).eq('id', jobId);

  const ownerId = reservation.owner_user_id ?? null;

  try {
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .insert({
        name: reservation.workspace_name,
        organization_type: 'independent',
        owner_id: ownerId,
        subdomain: reservation.subdomain,
        subscription_tier: reservation.plan_code,
        agent_limit: 50,
        active_user_count: ownerId ? 1 : 0,
      })
      .select('id')
      .single();

    if (orgErr || !org) {
      throw new Error(orgErr?.message ?? 'Failed to create organization');
    }

    const { data: workspace, error: wsErr } = await supabase
      .from('workspace_settings')
      .insert({
        owner_user_id: ownerId,
        name: reservation.workspace_name,
        organization_id: org.id,
      })
      .select('id')
      .single();

    if (wsErr || !workspace) {
      await supabase.from('organizations').delete().eq('id', org.id);
      throw new Error(wsErr?.message ?? 'Failed to create workspace');
    }

    if (ownerId) {
      await supabase.from('organization_members').insert({
        organization_id: org.id,
        user_id: ownerId,
        role: 'owner',
      });

      const { data: userSettings } = await supabase
        .from('user_settings')
        .select('id')
        .eq('user_id', ownerId)
        .maybeSingle();

      if (userSettings) {
        await supabase.from('user_settings').update({
          workspace_id: workspace.id,
          global_role: 'admin',
        }).eq('user_id', ownerId);
      } else {
        await supabase.from('user_settings').insert({
          user_id: ownerId,
          workspace_id: workspace.id,
          global_role: 'admin',
        });
      }
    }

    await supabase.from('saas_subscriptions').insert({
      organization_id: org.id,
      provider_customer_id: reservation.provider_customer_id ?? 'pending',
      provider_subscription_id: reservation.provider_subscription_id,
      plan_code: reservation.plan_code,
      status: 'active',
      current_period_end: null,
    });

    await supabase.from('tenant_reservations').update({
      state: 'active',
      organization_id: org.id,
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', reservation.id);

    await supabase.from('provisioning_jobs').update({
      status: 'succeeded',
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

    await supabase.from('saas_audit_log').insert([
      { event_type: 'tenant_created', entity_type: 'organizations', entity_id: org.id, payload: { subdomain: reservation.subdomain } },
      { event_type: 'provisioning_completed', entity_type: 'provisioning_job', entity_id: jobId, payload: { reservation_id: reservation.id } },
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[saas_provisioning_run]', message);

    await supabase.from('provisioning_jobs').update({
      status: 'failed',
      error_message: message,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

    await supabase.from('tenant_reservations').update({
      state: 'failed',
      error_message: message,
      updated_at: new Date().toISOString(),
    }).eq('id', reservation.id);

    await supabase.from('saas_audit_log').insert({
      event_type: 'provisioning_failed',
      entity_type: 'provisioning_job',
      entity_id: jobId,
      payload: { error: message },
    });

    return jsonResponse({ error: message }, 500);
  }

  return jsonResponse({ ok: true }, 200);
});
