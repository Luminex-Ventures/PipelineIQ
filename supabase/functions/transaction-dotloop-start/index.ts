/**
 * Start Dotloop OAuth flow (3-legged OAuth 2.0).
 * Returns auth_url for redirect; callback handled by transaction-dotloop-callback.
 * Docs: https://dotloop.github.io/public-api/
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DOTLOOP_CLIENT_ID = Deno.env.get('DOTLOOP_CLIENT_ID');
const DOTLOOP_REDIRECT_URI = Deno.env.get('DOTLOOP_REDIRECT_URI') ||
  `${new URL(SUPABASE_URL).origin}/functions/v1/transaction-dotloop-callback`;

const DOTLOOP_AUTH_BASE = 'https://auth.dotloop.com/oauth';

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

    if (!DOTLOOP_CLIENT_ID) {
      return jsonResponse({ error: 'Dotloop OAuth not configured' }, 503);
    }

    const state = `${user.id}:dotloop:${crypto.randomUUID()}`;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: DOTLOOP_CLIENT_ID,
      redirect_uri: DOTLOOP_REDIRECT_URI,
      state,
    });
    const authUrl = `${DOTLOOP_AUTH_BASE}/authorize?${params.toString()}`;

    return jsonResponse({ auth_url: authUrl, state });
  } catch (err) {
    console.error('transaction-dotloop-start:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
