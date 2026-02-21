/**
 * Returns a short-lived JWT for MapKit JS so the client can initialize Apple Maps.
 * Requires Apple Developer Maps identifier and private key.
 *
 * Env: APPLE_MAPKIT_TEAM_ID, APPLE_MAPKIT_KEY_ID, APPLE_MAPKIT_PRIVATE_KEY (PEM string)
 */

import { SignJWT, importPKCS8 } from 'npm:jose@5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Origin',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const teamId = Deno.env.get('APPLE_MAPKIT_TEAM_ID');
  const keyId = Deno.env.get('APPLE_MAPKIT_KEY_ID');
  const privateKeyPem = Deno.env.get('APPLE_MAPKIT_PRIVATE_KEY');

  if (!teamId || !keyId || !privateKeyPem) {
    console.error('[mapkit-token] Missing env: APPLE_MAPKIT_TEAM_ID, APPLE_MAPKIT_KEY_ID, or APPLE_MAPKIT_PRIVATE_KEY');
    return new Response(
      JSON.stringify({ error: 'MapKit not configured' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const key = await importPKCS8(privateKeyPem.trim(), 'ES256');
    const origin = req.headers.get('Origin') ?? req.headers.get('Referer') ?? '*';
    const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    const token = await new SignJWT({ origin })
      .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
      .setIssuer(teamId)
      .setExpirationTime(exp)
      .sign(key);

    return new Response(JSON.stringify({ token }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[mapkit-token] JWT sign failed:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to issue token' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
