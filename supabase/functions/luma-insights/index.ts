import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

interface InsightsRequest {
  stats: {
    ytdGCI: number;
    ytdDeals: number;
    ytdVolume: number;
    avgCommission: number;
    closingThisMonth: number;
    conversionRate: number;
  };
  pipelineHealth: Array<{
    id: string;
    name: string;
    count: number;
    expectedGCI: number;
    stalledCount: number;
  }>;
  leadSourceData: Array<{
    name: string;
    deals: number;
    gci: number;
  }>;
  monthlyData: Array<{
    month: string;
    gci: number;
    deals: number;
  }>;
  upcomingDealsCount: number;
  projectedGCI: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY is not configured in Supabase secrets' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const requestData: InsightsRequest = await req.json();

    const prompt = buildPrompt(requestData);

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are Luma, an AI assistant for real estate agents. Provide concise, actionable insights based on the dashboard data. Focus on trends, opportunities, and areas needing attention. Keep each insight to 1-2 sentences. Be specific with numbers and percentages. Return 3-5 insights as a JSON array of strings. Do not wrap your response in markdown code blocks.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to generate insights', details: errorText }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const openaiData = await openaiResponse.json();
    let content = openaiData.choices[0]?.message?.content || '';

    // Remove markdown code block formatting if present
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let insights: string[];
    try {
      insights = JSON.parse(content);
      // Ensure it's an array
      if (!Array.isArray(insights)) {
        insights = [content];
      }
    } catch {
      // If parsing fails, split by newlines and filter
      insights = content.split('\n').filter((line: string) => line.trim().length > 0 && !line.includes('[') && !line.includes(']'));
    }

    return new Response(
      JSON.stringify({ insights }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Luma insights error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});

function buildPrompt(data: InsightsRequest): string {
  const { stats, pipelineHealth, leadSourceData, monthlyData, upcomingDealsCount, projectedGCI } = data;

  let prompt = `Analyze this real estate agent's dashboard data and provide 3-5 actionable insights:\n\n`;

  prompt += `Performance Metrics:\n`;
  prompt += `- YTD GCI: $${stats.ytdGCI.toLocaleString()}\n`;
  prompt += `- Closed Deals: ${stats.ytdDeals}\n`;
  prompt += `- Average Commission: $${stats.avgCommission.toLocaleString()}\n`;
  prompt += `- Conversion Rate: ${(stats.conversionRate * 100).toFixed(1)}%\n`;
  prompt += `- Closing This Month: ${stats.closingThisMonth} deals\n\n`;

  if (monthlyData.length >= 2) {
    const recent = monthlyData.slice(-3);
    prompt += `Recent Monthly Trend:\n`;
    recent.forEach(m => {
      prompt += `- ${m.month}: ${m.deals} deals, $${m.gci.toLocaleString()} GCI\n`;
    });
    prompt += `\n`;
  }

  if (pipelineHealth.length > 0) {
    const totalActive = pipelineHealth.reduce((sum, s) => sum + s.count, 0);
    const totalStalled = pipelineHealth.reduce((sum, s) => sum + s.stalledCount, 0);
    prompt += `Pipeline Health:\n`;
    prompt += `- Total Active Deals: ${totalActive}\n`;
    prompt += `- Total Stalled (30+ days): ${totalStalled}\n`;
    pipelineHealth.forEach(status => {
      if (status.count > 0) {
        prompt += `  • ${status.name}: ${status.count} deals`;
        if (status.stalledCount > 0) {
          prompt += ` (${status.stalledCount} stalled)`;
        }
        prompt += `\n`;
      }
    });
    prompt += `\n`;
  }

  if (leadSourceData.length > 0) {
    prompt += `Top Lead Sources:\n`;
    leadSourceData.slice(0, 3).forEach((source, idx) => {
      prompt += `${idx + 1}. ${source.name}: ${source.deals} deals, $${source.gci.toLocaleString()} GCI\n`;
    });
    prompt += `\n`;
  }

  if (upcomingDealsCount > 0) {
    prompt += `Upcoming: ${upcomingDealsCount} deals projected to close with $${projectedGCI.toLocaleString()} potential GCI\n\n`;
  }

  prompt += `Provide insights as a JSON array of 3-5 strings. Focus on:\n`;
  prompt += `1. Performance trends (improving/declining)\n`;
  prompt += `2. Urgent actions needed (stalled deals)\n`;
  prompt += `3. Opportunities (strong lead sources, upcoming closings)\n`;
  prompt += `4. Strategic recommendations\n\n`;
  prompt += `Format: ["insight 1", "insight 2", "insight 3"]`;

  return prompt;
}
