import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const APP_ORIGIN = Deno.env.get('APP_ORIGIN');
const FROM_EMAIL = Deno.env.get('INVITE_FROM_EMAIL') || 'Luma-IQ <no-reply@luma-iq.app>';

interface InviteRequestBody {
  inviteId: string;
  origin?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const payload: InviteRequestBody = await req.json();
    if (!payload.inviteId) {
      return jsonResponse({ error: 'inviteId is required' }, 400);
    }

    const { data: invite, error: inviteError } = await supabase
      .from('workspace_invitations')
      .select(`
        id,
        email,
        token,
        status,
        expires_at,
        intended_role,
        workspace_id,
        workspace_settings ( name )
      `)
      .eq('id', payload.inviteId)
      .single();

    if (inviteError || !invite) {
      return jsonResponse({ error: 'Invite not found' }, 404);
    }

    const workspaceName = invite.workspace_settings?.name || 'your workspace';
    const inviteLinkOrigin =
      payload.origin ||
      APP_ORIGIN ||
      req.headers.get('origin') ||
      `https://${new URL(SUPABASE_URL).hostname}`;
    const inviteUrl = `${inviteLinkOrigin}/invite/${invite.token}`;

    if (!RESEND_API_KEY) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured' }, 500);
    }

    const subject = `You're invited to ${workspaceName} on Luma-IQ`;
    const text = [
      `You have been invited to join ${workspaceName} on Luma-IQ.`,
      `Invite link: ${inviteUrl}`,
      `This invite expires on ${new Date(invite.expires_at).toLocaleString()}.`,
    ].join('\n\n');

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; padding: 16px;">
        <p style="font-size: 16px; margin: 0 0 12px;">You have been invited to join <strong>${workspaceName}</strong> on Luma-IQ.</p>
        <p style="margin: 0 0 16px;">Click the button below to accept your invite and get started.</p>
        <a href="${inviteUrl}" style="display: inline-block; background: #0a84ff; color: #ffffff; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: 600;">Accept Invite</a>
        <p style="margin: 16px 0 6px; font-size: 13px;">If the button doesn't work, copy and paste this link:</p>
        <p style="word-break: break-all; font-size: 13px; color: #334155;">${inviteUrl}</p>
        <p style="margin-top: 16px; font-size: 12px; color: #475569;">Invite expires on ${new Date(invite.expires_at).toLocaleString()}.</p>
      </div>
    `;

    const sendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [invite.email],
        subject,
        html,
        text,
      }),
    });

    if (!sendResponse.ok) {
      const details = await sendResponse.text();
      console.error('Resend error:', details);
      return jsonResponse({ error: 'Failed to send invite email', details }, 500);
    }

    return jsonResponse({ status: 'sent', inviteId: invite.id });
  } catch (error) {
    console.error('send-invite-email error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
