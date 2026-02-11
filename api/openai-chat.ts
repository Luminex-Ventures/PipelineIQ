/**
 * Vercel serverless function: proxy for OpenAI chat completions.
 * Keeps OPENAI_API_KEY on the server; never exposed to the client.
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[api/openai-chat] OPENAI_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'OpenAI API is not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { messages, model = 'gpt-4o-mini', temperature = 0.7, max_tokens = 1000 } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
      }),
    });

    const responseText = await openaiResponse.text();
    if (!openaiResponse.ok) {
      console.error('[api/openai-chat] OpenAI error:', openaiResponse.status, responseText);
      return new Response(responseText, {
        status: openaiResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(responseText, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
