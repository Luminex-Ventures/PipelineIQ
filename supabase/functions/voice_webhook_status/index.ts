/**
 * Phase 3: Voice call status callback webhook (e.g. Twilio call status).
 * Updates calls record: ended_at, duration_seconds, disposition, recording_ref.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const STATUS_TO_DISPOSITION: Record<string, string> = {
  completed: 'completed',
  busy: 'busy',
  'no-answer': 'no_answer',
  failed: 'failed',
  canceled: 'canceled',
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const contentType = req.headers.get('content-type') ?? '';
  const body = contentType.includes('application/x-www-form-urlencoded')
    ? Object.fromEntries(new URLSearchParams(await req.text()))
    : await req.json().catch(() => ({})) as Record<string, string>;

  const CallSid = body.CallSid ?? body.call_sid;
  const CallStatus = body.CallStatus ?? body.CallStatus;
  const CallDuration = body.CallDuration ?? body.CallDuration;
  const RecordingUrl = body.RecordingUrl ?? body.recording_url;

  if (!CallSid) {
    return new Response(JSON.stringify({ error: 'Missing CallSid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  const { data: call } = await supabase
    .from('calls')
    .select('id, user_id, contact_id, deal_id, thread_id, started_at')
    .eq('provider_call_id', CallSid)
    .single();

  if (!call) {
    return new Response(JSON.stringify({ ok: false, message: 'Call not found' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const updates: Record<string, unknown> = {};

  if (CallStatus === 'completed' || CallStatus === 'busy' || CallStatus === 'no-answer' || CallStatus === 'failed' || CallStatus === 'canceled') {
    updates.ended_at = now;
    updates.duration_seconds = CallDuration ? parseInt(String(CallDuration), 10) : null;
    updates.disposition = STATUS_TO_DISPOSITION[CallStatus] ?? 'other';
  }

  if (RecordingUrl) {
    updates.recording_ref = RecordingUrl;
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('calls').update(updates).eq('id', call.id);
  }

  // Create touch for deal/contact timeline when call ends
  if ((CallStatus === 'completed' || CallStatus === 'no-answer' || CallStatus === 'left_voicemail') && call.contact_id) {
    await supabase.from('messaging_touches').insert({
      user_id: call.user_id,
      contact_id: call.contact_id,
      deal_id: call.deal_id ?? null,
      channel: 'call',
      message_id: null,
      call_id: call.id,
      occurred_at: now,
      metadata: { disposition: STATUS_TO_DISPOSITION[CallStatus] ?? 'other' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
