/**
 * Phase 3: Transcription worker (cron every 5 min).
 * Fetches calls with recording_ref and no transcript_ref; transcribes; stores call_transcripts;
 * sets call.transcript_ref; emits event call_transcribed for workflow/AI pipeline.
 * MVP: stub that writes placeholder transcript; replace with provider (Twilio) or Luma transcription.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  const { data: calls } = await supabase
    .from('calls')
    .select('id, user_id, recording_ref')
    .not('recording_ref', 'is', null)
    .is('transcript_ref', null)
    .limit(20);

  let processed = 0;
  for (const call of calls ?? []) {
    const { data: existing } = await supabase
      .from('call_transcripts')
      .select('id')
      .eq('call_id', call.id)
      .maybeSingle();
    if (existing) {
      await supabase.from('calls').update({ transcript_ref: existing.id }).eq('id', call.id);
      processed++;
      continue;
    }

    // MVP: placeholder transcript (replace with real fetch + transcribe)
    const transcriptText = '[Placeholder transcript – recording not yet transcribed]';
    const { data: transcript } = await supabase
      .from('call_transcripts')
      .insert({
        call_id: call.id,
        user_id: call.user_id,
        transcript_text: transcriptText,
        speaker_map: [],
        provider: 'stub',
      })
      .select('id')
      .single();

    if (transcript?.id) {
      await supabase.from('calls').update({ transcript_ref: transcript.id }).eq('id', call.id);
      await supabase.from('messaging_events').insert({
        user_id: call.user_id,
        type: 'call_transcribed',
        payload: { call_id: call.id, transcript_id: transcript.id },
      });
      processed++;
    }
  }

  return new Response(
    JSON.stringify({ processed }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
