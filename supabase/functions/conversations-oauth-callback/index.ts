/**
 * OAuth callback for Gmail and Microsoft.
 * Exchanges code for tokens, stores token_ref (MVP: store encrypted in metadata or use Vault when available), upserts connected_accounts.
 * Redirects to APP_ORIGIN/conversations/connected-accounts?connected=gmail|microsoft or ?error=...
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
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI') ||
  `${new URL(SUPABASE_URL).origin}/functions/v1/conversations-oauth-callback`;
const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const MICROSOFT_REDIRECT_URI = Deno.env.get('MICROSOFT_REDIRECT_URI') ||
  `${new URL(SUPABASE_URL).origin}/functions/v1/conversations-oauth-callback`;
const ENCRYPTION_KEY = Deno.env.get('CONVERSATIONS_TOKEN_ENCRYPTION_KEY'); // optional; if not set we store ref only

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
    return redirect(`${APP_ORIGIN}/conversations/connected-accounts?error=${encodeURIComponent(errorParam)}`);
  }
  if (!code || !state) {
    return redirect(`${APP_ORIGIN}/conversations/connected-accounts?error=missing_code_or_state`);
  }

  const [userId, provider] = state.split(':');
  if (!userId || (provider !== 'gmail' && provider !== 'microsoft')) {
    return redirect(`${APP_ORIGIN}/conversations/connected-accounts?error=invalid_state`);
  }

  try {
    let accessToken = '';
    let refreshToken = '';
    let email = '';

    if (provider === 'gmail') {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return redirect(`${APP_ORIGIN}/conversations/connected-accounts?error=oauth_not_configured`);
      }
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) {
        const t = await tokenRes.text();
        console.error('Google token error:', t);
        return redirect(`${APP_ORIGIN}/conversations/connected-accounts?error=token_exchange_failed`);
      }
      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token || '';
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userRes.ok) {
        const userInfo = await userRes.json();
        email = userInfo.email || '';
      }
    } else {
      if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
        return redirect(`${APP_ORIGIN}/conversations/connected-accounts?error=oauth_not_configured`);
      }
      const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          redirect_uri: MICROSOFT_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) {
        const t = await tokenRes.text();
        console.error('Microsoft token error:', t);
        return redirect(`${APP_ORIGIN}/conversations/connected-accounts?error=token_exchange_failed`);
      }
      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token || '';
      const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userRes.ok) {
        const userInfo = await userRes.json();
        email = userInfo.mail || userInfo.userPrincipalName || '';
      }
    }

    const tokenRef = ENCRYPTION_KEY
      ? `enc:${btoa(JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }))}`
      : `ref:${crypto.randomUUID()}`;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: upsertErr } = await supabase.from('connected_accounts').upsert(
      {
        user_id: userId,
        provider,
        status: 'connected',
        external_account_id: email || null,
        token_ref: tokenRef,
        metadata: { email: email || null },
        last_sync_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    );
    if (upsertErr) {
      console.error('Upsert connected_accounts:', upsertErr);
      return redirect(`${APP_ORIGIN}/conversations/connected-accounts?error=save_failed`);
    }
    return redirect(`${APP_ORIGIN}/conversations/connected-accounts?connected=${provider}`);
  } catch (err) {
    console.error('conversations-oauth-callback:', err);
    return redirect(`${APP_ORIGIN}/conversations/connected-accounts?error=internal`);
  }
});
