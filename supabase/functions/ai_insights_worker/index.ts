/**
 * Phase 2: AI insights worker (cron every 5 min).
 * Processes threads/contacts with stale or missing insights.
 * Calls Luma AI server-side, stores in messaging_ai_thread_insights + messaging_ai_contact_insights.
 * MVP: stub that writes placeholder insights; replace with real Luma AI call when ready.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  const { data: threads } = await supabase
    .from('conversation_threads')
    .select('id, user_id')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(20);

  let threadCount = 0;
  for (const t of threads ?? []) {
    const { data: existing } = await supabase
      .from('messaging_ai_thread_insights')
      .select('thread_id')
      .eq('thread_id', t.id)
      .maybeSingle();
    if (existing) continue;

    await supabase.from('messaging_ai_thread_insights').upsert(
      {
        thread_id: t.id,
        user_id: t.user_id,
        model_version: 'stub',
        prompt_version: 'v1',
        summary: 'Summary not yet generated.',
        intent: null,
        sentiment: null,
        urgency_score: null,
        next_best_action: 'Review thread and reply.',
        suggested_drafts: [],
        updated_at: now,
      },
      { onConflict: 'thread_id' }
    );
    threadCount++;
  }

  return new Response(
    JSON.stringify({ threads_updated: threadCount }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
