/**
 * Sync email messages for a connected account (Gmail or Microsoft).
 * MVP: pull last N days or since last_sync_at, create/update threads + messages, set last_sync_at.
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
  connected_account_id: string;
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
    const accountId = body?.connected_account_id;
    if (!accountId) return jsonResponse({ error: 'connected_account_id required' }, 400);

    const { data: account, error: accErr } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();
    if (accErr || !account) return jsonResponse({ error: 'Account not found' }, 404);
    if (account.provider !== 'gmail' && account.provider !== 'microsoft') {
      return jsonResponse({ error: 'Email sync only for gmail/microsoft' }, 400);
    }

    // MVP: placeholder sync – real implementation would call Gmail/Microsoft API, map to threads/messages
    const now = new Date().toISOString();
    await supabase
      .from('connected_accounts')
      .update({ last_sync_at: now, updated_at: now })
      .eq('id', accountId);

    return jsonResponse({ synced: 0 });
  } catch (err) {
    console.error('conversations-sync-email:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
