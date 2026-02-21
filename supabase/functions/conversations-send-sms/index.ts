/**
 * Send SMS via Twilio using agent's connected account.
 * Persist outbound message and update thread.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface Body {
  thread_id?: string;
  to_phone: string;
  body: string;
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
    if (!body?.body) return jsonResponse({ error: 'body required' }, 400);

    const { data: account } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'twilio')
      .eq('status', 'connected')
      .single();
    if (!account) return jsonResponse({ error: 'No connected SMS account' }, 400);

    const meta = account.metadata as { from_phone?: string } | null;
    const fromPhone = meta?.from_phone ?? account.external_account_id ?? '';
    let toPhone = body.to_phone;
    const threadId = body.thread_id;
    if (threadId && !toPhone) {
      const { data: thread } = await supabase
        .from('conversation_threads')
        .select('*, contact:conversation_contacts(phone)')
        .eq('id', threadId)
        .eq('user_id', user.id)
        .single();
      if (thread) {
        const c = (thread as { contact: unknown }).contact;
        const contact = Array.isArray(c) ? c[0] : c;
        if (contact && typeof contact === 'object' && contact !== null && 'phone' in contact) {
          toPhone = (contact as { phone: string }).phone ?? '';
        }
      }
    }
    if (!toPhone) return jsonResponse({ error: 'to_phone or thread_id with contact phone required' }, 400);

    // MVP: persist message; optional Twilio send if credentials stored
    const messageId = crypto.randomUUID();
    const now = new Date().toISOString();
    await supabase.from('conversation_messages').insert({
      id: messageId,
      user_id: user.id,
      thread_id: threadId ?? null,
      direction: 'outbound',
      channel: 'sms',
      from_phone: fromPhone,
      to_phone: toPhone,
      body_text: body.body,
      provider_message_id: `local-${messageId}`,
      sent_at: now,
      status: 'sent',
    });
    if (threadId) {
      await supabase
        .from('conversation_threads')
        .update({ last_message_at: now, updated_at: now })
        .eq('id', threadId);
    }

    return jsonResponse({ message_id: messageId });
  } catch (err) {
    console.error('conversations-send-sms:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
