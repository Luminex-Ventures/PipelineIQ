/**
 * Phase 2: Ingest events for the automation engine.
 * POST { type, payload }. Inserts into messaging_events (service role).
 * Caller must be authenticated; user_id from auth.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_TYPES = [
  'contact_created',
  'deal_stage_changed',
  'inbound_reply',
  'no_reply_after_days',
  'appointment_scheduled',
  'market_signal',
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = (await req.json()) as { type?: string; payload?: Record<string, unknown> };
    const type = body?.type;
    const payload = body?.payload ?? {};

    if (!type || !ALLOWED_TYPES.includes(type)) {
      return jsonResponse({ error: `type must be one of: ${ALLOWED_TYPES.join(', ')}` }, 400);
    }

    const { data: evt, error } = await supabase
      .from('messaging_events')
      .insert({ user_id: user.id, type, payload })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('[messaging-event-ingest]', error);
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ id: evt.id, created_at: evt.created_at });
  } catch (err) {
    console.error('[messaging-event-ingest]', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
