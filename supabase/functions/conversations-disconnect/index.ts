/**
 * Disconnect a provider (gmail, microsoft, twilio). Set status to disconnected or remove token_ref.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface Body {
  provider: 'gmail' | 'microsoft' | 'twilio';
}

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

    const body = (await req.json()) as Body;
    const provider = body?.provider;
    if (!provider || !['gmail', 'microsoft', 'twilio'].includes(provider)) {
      return jsonResponse({ error: 'provider must be gmail, microsoft, or twilio' }, 400);
    }

    const { error: updateErr } = await supabase
      .from('connected_accounts')
      .update({
        status: 'disconnected',
        token_ref: null,
        external_account_id: null,
        metadata: {},
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('provider', provider);
    if (updateErr) {
      console.error('conversations-disconnect:', updateErr);
      return jsonResponse({ error: 'Failed to disconnect' }, 500);
    }
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('conversations-disconnect:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
