/**
 * Start OAuth flow for Gmail or Microsoft.
 * Returns auth_url for redirect; callback will be handled by conversations-oauth-callback.
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
const GOOGLE_CLIENT_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI') ||
  `${new URL(SUPABASE_URL).origin}/functions/v1/conversations-oauth-callback`;
const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_REDIRECT_URI = Deno.env.get('MICROSOFT_REDIRECT_URI') ||
  `${new URL(SUPABASE_URL).origin}/functions/v1/conversations-oauth-callback`;

interface Body {
  provider: 'gmail' | 'microsoft';
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
    if (provider !== 'gmail' && provider !== 'microsoft') {
      return jsonResponse({ error: 'provider must be gmail or microsoft' }, 400);
    }

    const state = `${user.id}:${provider}:${crypto.randomUUID()}`;
    let authUrl = '';

    if (provider === 'gmail') {
      if (!GOOGLE_CLIENT_ID) return jsonResponse({ error: 'Gmail OAuth not configured' }, 503);
      const scopes = encodeURIComponent([
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' '));
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_CLIENT_REDIRECT_URI)}&response_type=code&scope=${scopes}&state=${encodeURIComponent(state)}&access_type=offline&prompt=consent`;
    } else {
      if (!MICROSOFT_CLIENT_ID) return jsonResponse({ error: 'Microsoft OAuth not configured' }, 503);
      const scopes = encodeURIComponent([
        'openid',
        'email',
        'https://graph.microsoft.com/Mail.Read',
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/User.Read',
      ].join(' '));
      authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${MICROSOFT_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(MICROSOFT_REDIRECT_URI)}&response_mode=query&scope=${scopes}&state=${encodeURIComponent(state)}`;
    }

    return jsonResponse({ auth_url: authUrl, state });
  } catch (err) {
    console.error('conversations-oauth-start:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
