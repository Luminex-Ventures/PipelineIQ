/**
 * SaaS: Poll provisioning status. Returns minimal payload (no PII).
 * Call with session_id (Stripe) or reservation_id. Rate-limit at gateway.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id');
  const reservationId = url.searchParams.get('reservation_id');

  if (!sessionId && !reservationId) {
    return jsonResponse({ error: 'Missing session_id or reservation_id' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let reservation: { id: string; state: string; subdomain: string } | null = null;

  if (reservationId) {
    const { data } = await supabase
      .from('tenant_reservations')
      .select('id, state, subdomain')
      .eq('id', reservationId)
      .single();
    reservation = data;
  }

  if (!reservation && sessionId) {
    const { data } = await supabase
      .from('tenant_reservations')
      .select('id, state, subdomain')
      .eq('checkout_session_id', sessionId)
      .single();
    reservation = data;
  }

  if (!reservation) {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  return jsonResponse(
    {
      state: reservation.state,
      subdomain: reservation.subdomain,
      ready: reservation.state === 'active',
    },
    200
  );
});
