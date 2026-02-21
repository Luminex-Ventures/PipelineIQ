/**
 * Start OAuth flow for Google Ads or Meta Ads.
 * Returns auth_url for redirect; callback handled by marketing-oauth-callback.
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

interface Body {
  provider: 'google_ads' | 'meta_ads';
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
    if (provider !== 'google_ads' && provider !== 'meta_ads') {
      return jsonResponse({ error: 'provider must be google_ads or meta_ads' }, 400);
    }

    const state = `${user.id}:${provider}:${crypto.randomUUID()}`;
    let authUrl = '';

    if (provider === 'google_ads') {
      if (!GOOGLE_ADS_CLIENT_ID) return jsonResponse({ error: 'Google Ads OAuth not configured' }, 503);
      const scopes = encodeURIComponent([
        'https://www.googleapis.com/auth/adwords',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' '));
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_ADS_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_ADS_REDIRECT_URI)}&response_type=code&scope=${scopes}&state=${encodeURIComponent(state)}&access_type=offline&prompt=consent`;
    } else {
      if (!META_ADS_APP_ID) return jsonResponse({ error: 'Meta Ads OAuth not configured' }, 503);
      const scopes = encodeURIComponent(['ads_management', 'business_management', 'email'].join(','));
      authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${META_ADS_APP_ID}&redirect_uri=${encodeURIComponent(META_ADS_REDIRECT_URI)}&state=${encodeURIComponent(state)}&scope=${scopes}`;
    }

    return jsonResponse({ auth_url: authUrl, state });
  } catch (err) {
    console.error('marketing-oauth-start:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
