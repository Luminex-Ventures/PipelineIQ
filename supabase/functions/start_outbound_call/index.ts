/**
 * Phase 3: Start outbound call from agent number.
 * Authenticated. Initiates provider call, returns call session info to client.
 * Records idempotency; creates calls row. MVP: stub that creates call row only (no provider API yet).
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function getAuthUser(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1]));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const user_id = getAuthUser(req);
  if (!user_id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { to_phone: string; from_phone?: string; contact_id?: string; deal_id?: string; thread_id?: string; idempotency_key?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { to_phone, from_phone, contact_id, deal_id, thread_id, idempotency_key } = body;
  if (!to_phone) {
    return new Response(JSON.stringify({ error: 'to_phone required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  const key = idempotency_key ?? `outbound-${user_id}-${to_phone}-${Date.now()}`;
  const { data: existingCalls } = await supabase
    .from('calls')
    .select('id, provider_call_id')
    .eq('user_id', user_id)
    .eq('direction', 'outbound')
    .eq('to_number', to_phone)
    .order('created_at', { ascending: false })
    .limit(1);

  const existing = existingCalls?.[0];
  if (idempotency_key && existing) {
    const { data: row } = await supabase.from('calls').select('metadata').eq('id', existing.id).single();
    const meta = (row as { metadata?: { idempotency_key?: string } } | null)?.metadata;
    if (meta?.idempotency_key === idempotency_key) {
      return new Response(
        JSON.stringify({
          call_id: existing.id,
          provider_call_id: existing.provider_call_id,
          status: 'initiated',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  const { data: call, error } = await supabase
    .from('calls')
    .insert({
      user_id,
      org_id: null,
      contact_id: contact_id ?? null,
      deal_id: deal_id ?? null,
      thread_id: thread_id ?? null,
      provider_call_id: null,
      direction: 'outbound',
      from_number: from_phone ?? '',
      to_number: to_phone,
      started_at: now,
      ended_at: null,
      duration_seconds: null,
      disposition: null,
      recording_ref: null,
      transcript_ref: null,
      metadata: { idempotency_key: key },
    })
    .select('id')
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      call_id: call.id,
      provider_call_id: null,
      status: 'initiated',
      message: 'MVP: call row created; wire Twilio API to start actual call and set provider_call_id',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
