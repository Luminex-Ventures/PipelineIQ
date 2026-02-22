/**
 * SaaS: Create Stripe Checkout session for a reservation. Server-side only.
 * Call with reservation_id; returns { url } for redirect. Rate-limit at gateway.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14?target=deno';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SAAS_APP_URL = Deno.env.get('SAAS_APP_URL') ?? 'https://app.luma-iq.ai';

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

  if (!STRIPE_SECRET_KEY) {
    return jsonResponse({ error: 'Stripe not configured' }, 503);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body: { reservation_id: string; success_path?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const reservationId = body.reservation_id;
  if (!reservationId) {
    return jsonResponse({ error: 'Missing reservation_id' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: reservation, error: resErr } = await supabase
    .from('tenant_reservations')
    .select('id, subdomain, plan_code, workspace_name, owner_email, owner_user_id, state, expires_at')
    .eq('id', reservationId)
    .single();

  if (resErr || !reservation) {
    return jsonResponse({ error: 'Reservation not found' }, 404);
  }

  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
  if (!user || reservation.owner_user_id !== user.id) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (reservation.state !== 'reserved') {
    return jsonResponse({ error: 'Reservation not in reserved state' }, 400);
  }

  if (reservation.expires_at && new Date(reservation.expires_at) < new Date()) {
    return jsonResponse({ error: 'Reservation expired' }, 400);
  }

  const { data: plan } = await supabase
    .from('saas_plans')
    .select('code, provider_price_id, is_enterprise')
    .eq('code', reservation.plan_code)
    .single();

  if (plan?.is_enterprise || !plan?.provider_price_id) {
    return jsonResponse({ error: 'Plan not available for checkout' }, 400);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20' });
  const successPath = body.success_path ?? '/setup';
  const successUrl = `${SAAS_APP_URL}${successPath}?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${SAAS_APP_URL}/signup?plan=${reservation.plan_code}`;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: reservation.owner_email,
    client_reference_id: reservationId,
    line_items: [{ price: plan.provider_price_id, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: { metadata: { reservation_id: reservationId, subdomain: reservation.subdomain } },
  });

  await supabase.from('tenant_reservations').update({
    state: 'checkout_initiated',
    checkout_session_id: session.id,
    updated_at: new Date().toISOString(),
  }).eq('id', reservationId);

  return jsonResponse({ url: session.url }, 200);
});
