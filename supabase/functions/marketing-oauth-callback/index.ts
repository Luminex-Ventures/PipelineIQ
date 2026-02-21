/**
 * Marketing OAuth callback for Google Ads and Meta Ads.
 * Exchanges code for tokens, upserts marketing_integrations, redirects to app.
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
const GOOGLE_ADS_CLIENT_ID = Deno.env.get('GOOGLE_ADS_CLIENT_ID') ?? Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_ADS_CLIENT_SECRET = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET') ?? Deno.env.get('GOOGLE_CLIENT_SECRET');
const GOOGLE_ADS_REDIRECT_URI = Deno.env.get('GOOGLE_ADS_REDIRECT_URI') ||
  `${new URL(SUPABASE_URL).origin}/functions/v1/marketing-oauth-callback`;
const META_ADS_APP_ID = Deno.env.get('META_ADS_APP_ID') ?? Deno.env.get('META_APP_ID');
const META_ADS_APP_SECRET = Deno.env.get('META_ADS_APP_SECRET') ?? Deno.env.get('META_APP_SECRET');
const META_ADS_REDIRECT_URI = Deno.env.get('META_ADS_REDIRECT_URI') ||
  `${new URL(SUPABASE_URL).origin}/functions/v1/marketing-oauth-callback`;

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
  if (!userId || (provider !== 'google_ads' && provider !== 'meta_ads')) {
    return redirect(`${INTEGRATIONS_REDIRECT}&error=invalid_state`);
  }

  try {
    let accessToken = '';
    let refreshToken = '';
    let externalAccountId = '';
    let externalAccountName: string | null = null;

    if (provider === 'google_ads') {
      if (!GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_CLIENT_SECRET) {
        return redirect(`${INTEGRATIONS_REDIRECT}&error=oauth_not_configured`);
      }
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_ADS_CLIENT_ID,
          client_secret: GOOGLE_ADS_CLIENT_SECRET,
          redirect_uri: GOOGLE_ADS_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) {
        const t = await tokenRes.text();
        console.error('Google Ads token error:', t);
        return redirect(`${INTEGRATIONS_REDIRECT}&error=token_exchange_failed`);
      }
      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token ?? '';
      refreshToken = tokenData.refresh_token ?? '';
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userRes.ok) {
        const userInfo = await userRes.json();
        externalAccountId = userInfo.email ?? userInfo.id ?? `google-${userId}`;
        externalAccountName = userInfo.email ?? null;
      } else {
        externalAccountId = `google-${userId}`;
      }
    } else {
      if (!META_ADS_APP_ID || !META_ADS_APP_SECRET) {
        return redirect(`${INTEGRATIONS_REDIRECT}&error=oauth_not_configured`);
      }
      const tokenRes = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${META_ADS_APP_ID}&client_secret=${META_ADS_APP_SECRET}&redirect_uri=${encodeURIComponent(META_ADS_REDIRECT_URI)}&code=${encodeURIComponent(code)}`,
        { method: 'GET' }
      );
      if (!tokenRes.ok) {
        const t = await tokenRes.text();
        console.error('Meta Ads token error:', t);
        return redirect(`${INTEGRATIONS_REDIRECT}&error=token_exchange_failed`);
      }
      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token ?? '';
      const userRes = await fetch(
        `https://graph.facebook.com/v18.0/me?fields=id,name,email&access_token=${accessToken}`
      );
      if (userRes.ok) {
        const userInfo = await userRes.json();
        externalAccountId = userInfo.id ?? `meta-${userId}`;
        externalAccountName = userInfo.name ?? userInfo.email ?? null;
      } else {
        externalAccountId = `meta-${userId}`;
      }
    }

    const tokenRef = `enc:${btoa(JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }))}`;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: upsertErr } = await supabase.from('marketing_integrations').upsert(
      {
        user_id: userId,
        provider,
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
      { onConflict: 'user_id,provider,external_account_id' }
    );
    if (upsertErr) {
      console.error('Upsert marketing_integrations:', upsertErr);
      return redirect(`${INTEGRATIONS_REDIRECT}&error=save_failed`);
    }
    return redirect(`${INTEGRATIONS_REDIRECT}&connected=${provider}`);
  } catch (err) {
    console.error('marketing-oauth-callback:', err);
    return redirect(`${INTEGRATIONS_REDIRECT}&error=internal`);
  }
});
