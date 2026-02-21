/**
 * DocuSign OAuth callback: exchange code for tokens, upsert transaction_integrations, redirect to app.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') || 'http://localhost:5173';
const DOCUSIGN_INTEGRATION_KEY = Deno.env.get('DOCUSIGN_INTEGRATION_KEY');
const DOCUSIGN_SECRET_KEY = Deno.env.get('DOCUSIGN_SECRET_KEY');
const DOCUSIGN_REDIRECT_URI = Deno.env.get('DOCUSIGN_REDIRECT_URI') ||
  `${new URL(SUPABASE_URL).origin}/functions/v1/transaction-docusign-callback`;
const DOCUSIGN_BASE_URL = Deno.env.get('DOCUSIGN_BASE_URL') || 'https://account-d.docusign.com';

const INTEGRATIONS_REDIRECT = `${APP_ORIGIN}/workspace-settings?section=integrations`;

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url, ...corsHeaders } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return redirect(`${INTEGRATIONS_REDIRECT}&error=${encodeURIComponent(errorParam)}`);
  }
  if (!code || !state) {
    return redirect(`${INTEGRATIONS_REDIRECT}&error=missing_code_or_state`);
  }

  const [userId, provider] = state.split(':');
  if (!userId || provider !== 'docusign') {
    return redirect(`${INTEGRATIONS_REDIRECT}&error=invalid_state`);
  }

  if (!DOCUSIGN_INTEGRATION_KEY || !DOCUSIGN_SECRET_KEY) {
    return redirect(`${INTEGRATIONS_REDIRECT}&error=oauth_not_configured`);
  }

  try {
    const tokenRes = await fetch(`${DOCUSIGN_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${DOCUSIGN_INTEGRATION_KEY}:${DOCUSIGN_SECRET_KEY}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: DOCUSIGN_REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error('DocuSign token error:', t);
      return redirect(`${INTEGRATIONS_REDIRECT}&error=token_exchange_failed`);
    }
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token ?? '';
    const refreshToken = tokenData.refresh_token ?? '';
    const accountId = tokenData.account_id ?? 'default';

    const tokenRef = `enc:${btoa(JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }))}`;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: upsertErr } = await supabase.from('transaction_integrations').upsert(
      {
        user_id: userId,
        provider: 'docusign',
        external_account_id: accountId,
        external_account_name: null,
        token_ref: tokenRef,
        refresh_token_ref: refreshToken ? tokenRef : null,
        status: 'connected',
        last_sync_at: null,
        last_sync_error: null,
        metadata: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    );
    if (upsertErr) {
      console.error('Upsert transaction_integrations:', upsertErr);
      return redirect(`${INTEGRATIONS_REDIRECT}&error=save_failed`);
    }
    return redirect(`${INTEGRATIONS_REDIRECT}&connected=docusign`);
  } catch (err) {
    console.error('transaction-docusign-callback:', err);
    return redirect(`${INTEGRATIONS_REDIRECT}&error=internal`);
  }
});
