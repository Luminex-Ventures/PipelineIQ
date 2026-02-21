/**
 * Proxies address autocomplete to US Census Bureau Geocoder.
 * Called by the frontend to avoid CORS; returns { suggestions: { address: string }[] }.
 */

const CENSUS_URL =
  'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface CensusMatch {
  matchedAddress?: string;
}

interface CensusResponse {
  result?: { addressMatches?: CensusMatch[] };
}

const MAX = 8;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    let query = '';
    if (req.method === 'POST') {
      try {
        const body = (await req.json()) as { q?: string };
        query = (body.q ?? '').trim();
      } catch {
        query = '';
      }
    } else {
      const url = new URL(req.url);
      query = url.searchParams.get('q')?.trim() ?? '';
    }
    if (query.length < 3) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const params = new URLSearchParams({
      address: query,
      benchmark: 'Public_AR_Current',
      format: 'json',
    });
    const res = await fetch(`${CENSUS_URL}?${params.toString()}`);
    if (!res.ok) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = (await res.json()) as CensusResponse;
    const matches = data?.result?.addressMatches ?? [];
    const seen = new Set<string>();
    const suggestions = matches
      .filter((m) => m.matchedAddress && !seen.has(m.matchedAddress))
      .slice(0, MAX)
      .map((m) => {
        seen.add(m.matchedAddress!);
        return { address: m.matchedAddress! };
      });

    return new Response(JSON.stringify({ suggestions }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('address-suggestions:', err);
    return new Response(JSON.stringify({ suggestions: [] }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
