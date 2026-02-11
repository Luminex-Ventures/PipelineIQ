/**
 * Local dev proxy for OpenAI chat. Run alongside `npm run dev` so /api/openai-chat works.
 * Loads .env from project root and forwards POST /api/openai-chat to OpenAI.
 *
 * Usage: npx tsx scripts/local-openai-proxy.ts
 * (Or: npm run dev:api in a second terminal)
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const PORT = 3001;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// Load .env from project root (no extra dependency)
function loadEnv(): void {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }
}

loadEnv();

const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/api/openai-chat') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[local-openai-proxy] OPENAI_API_KEY not set. Add it to .env');
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'OpenAI API is not configured' }));
    return;
  }

  let body: string;
  try {
    body = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  } catch (e) {
    console.error('[local-openai-proxy] Read error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to read body' }));
    return;
  }

  let parsed: { messages?: unknown[]; model?: string; temperature?: number; max_tokens?: number };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const { messages, model = 'gpt-4o-mini', temperature = 0.7, max_tokens = 1000 } = parsed;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'messages array is required' }));
    return;
  }

  try {
    const openaiRes = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens }),
    });
    const text = await openaiRes.text();
    res.writeHead(openaiRes.status, { 'Content-Type': 'application/json' });
    res.end(text);
  } catch (e) {
    console.error('[local-openai-proxy] OpenAI request failed:', e);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy request failed' }));
  }
});

server.listen(PORT, () => {
  console.log(`[local-openai-proxy] OpenAI proxy running at http://localhost:${PORT}`);
  console.log(`[local-openai-proxy] Forward /api/openai-chat (use with Vite proxy or vercel dev)`);
});
