/**
 * Send email via connected Gmail or Microsoft account.
 * Persist outbound message and update thread last_message_at.
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
  to?: string;
  subject?: string;
  body: string;
  body_html?: string;
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
      .in('provider', ['gmail', 'microsoft'])
      .eq('status', 'connected')
      .limit(1)
      .single();
    if (!account) return jsonResponse({ error: 'No connected email account' }, 400);

    let toAddress = body.to;
    let threadId = body.thread_id;
    let subject = body.subject ?? '';
    if (threadId) {
      const { data: thread } = await supabase
        .from('conversation_threads')
        .select('*, contact:conversation_contacts(email)')
        .eq('id', threadId)
        .eq('user_id', user.id)
        .single();
      if (thread) {
        const c = (thread as { contact: unknown }).contact;
        const contact = Array.isArray(c) ? c[0] : c;
        if (contact && typeof contact === 'object' && contact !== null && 'email' in contact) {
          toAddress = (contact as { email: string }).email ?? toAddress;
        }
        if (!subject && (thread as { subject?: string }).subject) {
          subject = (thread as { subject: string }).subject;
        }
      }
    }
    if (!toAddress) return jsonResponse({ error: 'to or thread_id with contact email required' }, 400);

    // MVP: no actual provider send; persist message and return
    const messageId = crypto.randomUUID();
    const now = new Date().toISOString();
    const fromEmail = (account.metadata as { email?: string })?.email ?? account.external_account_id ?? '';
    await supabase.from('conversation_messages').insert({
      id: messageId,
      user_id: user.id,
      thread_id: threadId ?? null,
      direction: 'outbound',
      channel: 'email',
      from_address: fromEmail,
      to_address: toAddress,
      subject: subject || null,
      body_text: body.body,
      body_html: body.body_html ?? null,
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
    console.error('conversations-send-email:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
