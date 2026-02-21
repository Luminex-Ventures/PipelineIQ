# Luma Conversations – Phase 3

## Vision

Phase 3 turns Luma Conversations into a **communication operating system + AI coach**: voice/call handling, real-time coaching and negotiation assistance, advanced analytics and attribution, deeper team workflows, compliance-grade audit trails, and an extensible signals + actions workflow engine.

---

## Architecture (high level)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Voice / Twilio                                                           │
│  Inbound call → voice_webhook_inbound → calls row                         │
│  Status → voice_webhook_status → ended_at, duration, recording_ref        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  transcription_worker (cron 5 min)                                        │
│  calls with recording_ref, no transcript → call_transcripts →             │
│  call.transcript_ref → event call_transcribed                              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ai_call_insights_worker (cron 5 min)                                     │
│  transcript → AI → ai_call_insights (summary, action_items, drafts)        │
│  → event call_insights_ready                                              │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  start_outbound_call (POST, auth)                                           │
│  Creates call row; MVP no provider dial yet; wire Twilio to set           │
│  provider_call_id and trigger provider flow                               │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  workflow_engine_v2 (cron 1–5 min)                                         │
│  messaging_events (unprocessed) → workflow_runs + audit_ledger           │
│  → start sequence, enqueue message, etc. (idempotent)                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  retention_worker (daily)                                                 │
│  retention_policies → delete old messages/calls/transcripts              │
│  → audit_ledger entry per run                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Database (Phase 3)

### New tables

| Table | Purpose |
|-------|--------|
| `calls` | Voice calls: direction, from/to, started_at, ended_at, duration_seconds, disposition, recording_ref, transcript_ref |
| `call_transcripts` | Transcript text, speaker_map, provider |
| `ai_call_insights` | Summary, action_items, objections, drafts (email/sms) |
| `internal_notes` | Team-only notes; thread_id, contact_id, deal_id, body, mentions |
| `approvals` | org_id, requested_by, approved_by, object_type, object_id, status (pending/approved/rejected) |
| `workflow_runs` | workflow_id, event_id, status, started_at, ended_at, logs, idempotency_key |
| `audit_ledger` | Append-only: actor_type, action_type, object_type, object_id, reason, payload |
| `retention_policies` | org_id or user_id; messages_days, calls_days, transcripts_days |

### Extended tables

- `messaging_touches`: `call_id` (FK to calls) for call touches.
- `conversation_threads`: `owner_user_id` for assignment.
- `conversation_contacts`: `owner_user_id`, `lead_source_id` for assignment and attribution.

---

## Edge functions (Phase 3)

| Function | Invocation | Purpose |
|----------|------------|--------|
| `voice_webhook_inbound` | POST (Twilio) | Create `calls` row for inbound call; return TwiML if needed |
| `voice_webhook_status` | POST (Twilio) | Update call: ended_at, duration, disposition, recording_ref |
| `start_outbound_call` | POST (auth) | Create outbound call row; idempotency; MVP no provider dial |
| `transcription_worker` | Cron 5 min | Recordings → call_transcripts; set call.transcript_ref; emit call_transcribed |
| `ai_call_insights_worker` | Cron 5 min | Transcripts → ai_call_insights; emit call_insights_ready |
| `workflow_engine_v2` | Cron 1–5 min | Process events; write workflow_runs + audit_ledger; run actions |
| `retention_worker` | Daily | Apply retention_policies; delete old data; log to audit_ledger |

---

## Event types (Phase 3 additions)

- `call_transcribed` – payload: call_id, transcript_id
- `call_insights_ready` – payload: call_id

Existing Phase 2 events (contact_created, deal_stage_changed, inbound_reply, etc.) are consumed by `workflow_engine_v2` (or `automation_engine`); Phase 3 prefers `workflow_engine_v2` for run history and audit.

---

## RLS summary

- **Calls / call_transcripts / ai_call_insights**: user-scoped; service_role for writes from workers.
- **Internal notes**: org members can view; only org members can insert.
- **Approvals**: org members view; admins update (approve/reject).
- **Workflow runs**: user or org read; service_role write.
- **Audit ledger**: org/user read; **insert only via service_role** (append-only).
- **Retention policies**: user or org; admins manage org policy.

---

## Definition of done (Phase 3 checklist)

- [ ] Agent can click-to-call a lead from a thread (start_outbound_call creates call row; UI wires provider later).
- [ ] Call is logged as a touch and appears in deal timeline (create touch with call_id when call ends).
- [ ] Transcript + AI summary + action items created within minutes (transcription_worker → ai_call_insights_worker).
- [ ] Coach Mode suggests follow-up text/email post-call (ai_call_insights.drafts surfaced in UI).
- [ ] Team member can add internal notes and @mention another agent (internal_notes + mentions).
- [ ] Workflow triggers on “negative sentiment” and creates manager notification (event + workflow_engine_v2 + audit).
- [ ] Analytics: reply rate and conversion to appointment by sequence (frontend + analytics schema as needed).
- [ ] Retention policy deletes transcripts older than configured days and logs audit entry (retention_worker).

---

## Implementation status

- **Done**: DB migration (calls, call_transcripts, ai_call_insights, internal_notes, approvals, workflow_runs, audit_ledger, retention_policies); touches.call_id, thread/contact owner and lead_source_id; RLS; Edge functions (voice webhooks, start_outbound_call, transcription_worker, ai_call_insights_worker, workflow_engine_v2, retention_worker); Phase 3 types; this doc.
- **Next**: UI (dialer, call detail, Coach panel, internal notes, approvals, retention/deliverability settings); real Twilio dial in start_outbound_call; real transcription and Luma AI in workers; touch creation with call_id when call ends; Comms Analytics dashboard.

---

## How to test (Phase 3)

1. **Apply migration**: `npx supabase db push` or run `20260220180000_luma_conversations_phase3.sql`.
2. **Inbound webhook**: POST to `voice_webhook_inbound` with Twilio-style params (CallSid, From, To); check `calls` row.
3. **Status webhook**: POST to `voice_webhook_status` with CallSid, CallStatus=completed, CallDuration; check call updated.
4. **Outbound**: POST to `start_outbound_call` with Authorization and `{ "to_phone": "+1...", "contact_id": "..." }`; check `calls` row.
5. **Transcription**: Run `transcription_worker`; for calls with recording_ref, expect call_transcripts row and call.transcript_ref set.
6. **AI call insights**: Run `ai_call_insights_worker`; expect ai_call_insights row for calls with transcript_ref.
7. **Workflow v2**: Insert messaging_events row; run `workflow_engine_v2`; check workflow_runs and audit_ledger.
8. **Retention**: Insert retention_policies row; run `retention_worker`; check audit_ledger and deleted data (if any).
