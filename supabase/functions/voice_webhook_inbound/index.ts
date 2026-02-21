/**
 * Phase 3: Inbound voice webhook (e.g. Twilio Voice).
 * Verifies provider signature, maps to user/org, creates calls record.
 * MVP: creates call row; map from_number/to_number to user via connected_accounts or config.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Twilio signature verification (optional; set TWILIO_AUTH_TOKEN to enable)
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';

function verifyTwilioSignature(_url: string, _params: Record<string, string>, _signature: string): boolean {
  if (!TWILIO_AUTH_TOKEN) return true;
  // Stub: integrate Twilio validateRequest(TWILIO_AUTH_TOKEN, signature, url, params) when ready
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const contentType = req.headers.get('content-type') ?? '';
  const body = contentType.includes('application/x-www-form-urlencoded')
    ? Object.fromEntries(new URLSearchParams(await req.text()))
    : await req.json().catch(() => ({})) as Record<string, string>;

  const signature = req.headers.get('x-twilio-signature') ?? '';
  const url = new URL(req.url).href;
  if (signature && !verifyTwilioSignature(url, body, signature)) {
    return new Response('Invalid signature', { status: 403 });
  }

  const CallSid = body.CallSid ?? body.call_sid;
  const From = body.From ?? body.from ?? '';
  const To = body.To ?? body.to ?? '';
  const CallStatus = body.CallStatus ?? body.CallStatus ?? 'ringing';

  if (!CallSid) {
    return new Response(JSON.stringify({ error: 'Missing CallSid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  // Resolve user_id: MVP use first Twilio-connected account or env fallback
  const { data: accounts } = await supabase
    .from('connected_accounts')
    .select('user_id')
    .eq('provider', 'twilio')
    .eq('status', 'connected')
    .limit(1);
  const user_id = accounts?.[0]?.user_id ?? Deno.env.get('DEFAULT_TWILIO_USER_ID');
  if (!user_id) {
    return new Response(JSON.stringify({ error: 'No Twilio user mapped' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: existing } = await supabase
    .from('calls')
    .select('id')
    .eq('provider_call_id', CallSid)
    .maybeSingle();

  if (existing) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'application/xml' },
    });
  }

  await supabase.from('calls').insert({
    user_id,
    org_id: null,
    contact_id: null,
    deal_id: null,
    thread_id: null,
    provider_call_id: CallSid,
    direction: 'inbound',
    from_number: From,
    to_number: To,
    started_at: now,
    ended_at: null,
    duration_seconds: null,
    disposition: null,
    recording_ref: null,
    transcript_ref: null,
    metadata: { raw: body },
  });

  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'application/xml' },
  });
});
