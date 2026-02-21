/**
 * Dotloop OAuth callback: exchange code for tokens, optional GET /account for display,
 * upsert transaction_integrations, redirect to app.
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
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') || 'http://localhost:5173';
const DOTLOOP_CLIENT_ID = Deno.env.get('DOTLOOP_CLIENT_ID');
const DOTLOOP_CLIENT_SECRET = Deno.env.get('DOTLOOP_CLIENT_SECRET');
const DOTLOOP_REDIRECT_URI = Deno.env.get('DOTLOOP_REDIRECT_URI') ||
  `${new URL(SUPABASE_URL).origin}/functions/v1/transaction-dotloop-callback`;

const DOTLOOP_AUTH_BASE = 'https://auth.dotloop.com/oauth';
const DOTLOOP_API_BASE = 'https://api-gateway.dotloop.com/public/v2';

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
  if (!userId || provider !== 'dotloop') {
    return redirect(`${INTEGRATIONS_REDIRECT}&error=invalid_state`);
  }

  if (!DOTLOOP_CLIENT_ID || !DOTLOOP_CLIENT_SECRET) {
    return redirect(`${INTEGRATIONS_REDIRECT}&error=oauth_not_configured`);
  }

  try {
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: DOTLOOP_REDIRECT_URI,
      state,
    });
    const tokenRes = await fetch(`${DOTLOOP_AUTH_BASE}/token?${tokenParams.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${DOTLOOP_CLIENT_ID}:${DOTLOOP_CLIENT_SECRET}`)}`,
      },
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error('Dotloop token error:', t);
      return redirect(`${INTEGRATIONS_REDIRECT}&error=token_exchange_failed`);
    }
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token ?? '';
    const refreshToken = tokenData.refresh_token ?? '';

    let externalAccountId = `dotloop-${userId}`;
    let externalAccountName: string | null = null;

    const accountRes = await fetch(`${DOTLOOP_API_BASE}/account`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (accountRes.ok) {
      const accountJson = await accountRes.json();
      const data = accountJson?.data;
      if (data) {
        externalAccountId = String(data.id ?? externalAccountId);
        const first = data.firstName ?? '';
        const last = data.lastName ?? '';
        externalAccountName = [first, last].filter(Boolean).join(' ') || data.email || null;
      }
    }

    const tokenRef = `enc:${btoa(JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }))}`;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: upsertErr } = await supabase.from('transaction_integrations').upsert(
      {
        user_id: userId,
        provider: 'dotloop',
        external_account_id: externalAccountId,
        external_account_name: externalAccountName,
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
    return redirect(`${INTEGRATIONS_REDIRECT}&connected=dotloop`);
  } catch (err) {
    console.error('transaction-dotloop-callback:', err);
    return redirect(`${INTEGRATIONS_REDIRECT}&error=internal`);
  }
});
