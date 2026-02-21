/**
 * Start DocuSign OAuth flow.
 * Returns auth_url for redirect; callback handled by transaction-docusign-callback.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DOCUSIGN_INTEGRATION_KEY = Deno.env.get('DOCUSIGN_INTEGRATION_KEY');
const DOCUSIGN_REDIRECT_URI = Deno.env.get('DOCUSIGN_REDIRECT_URI') ||
  `${new URL(SUPABASE_URL).origin}/functions/v1/transaction-docusign-callback`;
const DOCUSIGN_BASE_URL = Deno.env.get('DOCUSIGN_BASE_URL') || 'https://account-d.docusign.com';

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

    if (!DOCUSIGN_INTEGRATION_KEY) {
      return jsonResponse({ error: 'DocuSign OAuth not configured' }, 503);
    }

    const state = `${user.id}:docusign:${crypto.randomUUID()}`;
    const scopes = encodeURIComponent('signature extended');
    const authUrl = `${DOCUSIGN_BASE_URL}/oauth/auth?response_type=code&scope=${scopes}&client_id=${DOCUSIGN_INTEGRATION_KEY}&redirect_uri=${encodeURIComponent(DOCUSIGN_REDIRECT_URI)}&state=${encodeURIComponent(state)}`;

    return jsonResponse({ auth_url: authUrl, state });
  } catch (err) {
    console.error('transaction-docusign-start:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
