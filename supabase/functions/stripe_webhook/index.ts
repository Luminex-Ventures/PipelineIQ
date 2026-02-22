/**
 * SaaS: Stripe webhook – signature verification, idempotency, trigger provisioning.
 * Never provision on redirect; only on checkout.session.completed (and subscription active).
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14?target=deno';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

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

  const signature = req.headers.get('Stripe-Signature');
  if (!signature || !STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe_webhook] Missing Stripe-Signature or STRIPE_WEBHOOK_SECRET');
    return jsonResponse({ error: 'Webhook not configured' }, 500);
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-11-20' });
    const cryptoProvider = Stripe.createSubtleCryptoProvider();
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    console.error('[stripe_webhook] Signature verification failed:', err);
    return jsonResponse({ error: 'Invalid signature' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const eventId = event.id;

      const { data: existing } = await supabase
        .from('tenant_reservations')
        .select('id, state, organization_id')
        .eq('idempotency_event_id', eventId)
        .maybeSingle();

      if (existing) {
        console.log('[stripe_webhook] Idempotent skip event', eventId);
        return jsonResponse({ received: true, idempotent: true }, 200);
      }

      const reservationId = session.client_reference_id as string | null;
      if (!reservationId) {
        console.error('[stripe_webhook] No client_reference_id (reservation_id)');
        return jsonResponse({ error: 'Missing client_reference_id' }, 400);
      }

      const { data: reservation, error: resErr } = await supabase
        .from('tenant_reservations')
        .select('id, subdomain, plan_code, workspace_name, owner_email, owner_user_id, state')
        .eq('id', reservationId)
        .single();

      if (resErr || !reservation) {
        console.error('[stripe_webhook] Reservation not found', reservationId, resErr);
        return jsonResponse({ error: 'Reservation not found' }, 404);
      }

      if (reservation.state === 'active' && reservation.organization_id) {
        await supabase
          .from('tenant_reservations')
          .update({ idempotency_event_id: eventId })
          .eq('id', reservationId);
        return jsonResponse({ received: true, already_active: true }, 200);
      }

      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

      await supabase.from('tenant_reservations').update({
        state: 'payment_pending',
        checkout_session_id: session.id,
        provider_customer_id: customerId ?? null,
        provider_subscription_id: subscriptionId,
        idempotency_event_id: eventId,
        updated_at: new Date().toISOString(),
      }).eq('id', reservationId);

      const { data: job, error: jobErr } = await supabase
        .from('provisioning_jobs')
        .insert({
          reservation_id: reservationId,
          status: 'queued',
          attempts: 0,
          max_attempts: 3,
        })
        .select('id')
        .single();

      if (jobErr || !job) {
        console.error('[stripe_webhook] Failed to create job', jobErr);
        await supabase.from('tenant_reservations').update({
          state: 'failed',
          error_message: 'Failed to enqueue provisioning job',
        }).eq('id', reservationId);
        return jsonResponse({ error: 'Job creation failed' }, 500);
      }

      await supabase.from('saas_audit_log').insert({
        event_type: 'provisioning_started',
        entity_type: 'provisioning_job',
        entity_id: job.id,
        payload: { reservation_id: reservationId, stripe_event_id: eventId },
      });

      try {
        const runUrl = `${SUPABASE_URL}/functions/v1/saas_provisioning_run`;
        const runRes = await fetch(runUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ job_id: job.id }),
        });
        if (!runRes.ok) {
          const t = await runRes.text();
          console.error('[stripe_webhook] Provisioning run failed', runRes.status, t);
        }
      } catch (e) {
        console.error('[stripe_webhook] Invoke provisioning failed', e);
      }

      return jsonResponse({ received: true, job_id: job.id }, 200);
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const subId = sub.id;
      const status = sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : 'canceled';

      const { data: existingSub } = await supabase
        .from('saas_subscriptions')
        .select('id, organization_id')
        .eq('provider_subscription_id', subId)
        .maybeSingle();

      if (existingSub) {
        await supabase.from('saas_subscriptions').update({
          status,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          cancel_at_period_end: sub.cancel_at_period_end ?? false,
          updated_at: new Date().toISOString(),
        }).eq('id', existingSub.id);

        await supabase.from('saas_audit_log').insert({
          event_type: 'billing_status_change',
          entity_type: 'saas_subscriptions',
          entity_id: existingSub.id,
          payload: { subscription_id: subId, status },
        });
      }
      return jsonResponse({ received: true }, 200);
    }

    default:
      return jsonResponse({ received: true }, 200);
  }
});
