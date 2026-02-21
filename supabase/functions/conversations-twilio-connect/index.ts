/**
 * Connect Twilio: validate Account SID + Auth Token + From Number, store securely (token_ref), upsert connected_accounts.
 * MVP: agent-owned Twilio number they bring. Store credentials server-side; never expose to client.
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
  account_sid: string;
  auth_token: string;
  from_phone: string;
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
    if (!body?.account_sid || !body?.auth_token || !body?.from_phone) {
      return jsonResponse({ error: 'account_sid, auth_token, from_phone required' }, 400);
    }

    const validateRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${body.account_sid}.json`,
      {
        headers: {
          Authorization: 'Basic ' + btoa(`${body.account_sid}:${body.auth_token}`),
        },
      }
    );
    if (!validateRes.ok) {
      return jsonResponse({ error: 'Invalid Twilio credentials' }, 400);
    }

    const tokenRef = `twilio:${body.account_sid}`;
    const { data: account, error: upsertErr } = await supabase
      .from('connected_accounts')
      .upsert(
        {
          user_id: user.id,
          provider: 'twilio',
          status: 'connected',
          external_account_id: body.from_phone,
          token_ref: tokenRef,
          metadata: {
            from_phone: body.from_phone,
            account_sid: body.account_sid,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      )
      .select('id')
      .single();
    if (upsertErr) {
      console.error('Twilio connect upsert:', upsertErr);
      return jsonResponse({ error: 'Failed to save connection' }, 500);
    }
    return jsonResponse({ account_id: account.id });
  } catch (err) {
    console.error('conversations-twilio-connect:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
