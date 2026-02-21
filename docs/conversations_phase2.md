# Luma Conversations – Phase 2

## Overview

Phase 2 adds event-triggered automations, Luma AI conversation intelligence, multi-channel sequences with branching, team/broker support (templates, orgs), queue-based sending with retries, and pipeline integration (touches, deal/stage linking).

---

## Architecture (high level)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  App / Pipeline                                                          │
│  (deal stage change, contact created, inbound reply)                     │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  messaging-event-ingest (Edge Function)                                  │
│  POST { type, payload } → messaging_events                               │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  automation_engine (cron 1–5 min)                                        │
│  Reads unprocessed events → evaluates automations → actions              │
│  (start sequence, enqueue message, create task)                          │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│ sequence_     │    │ message_send_     │    │ tasks / reminders     │
│ runner (cron) │    │ queue             │    │ (existing)            │
│               │    │                  │    │                      │
│ Enrollments   │───▶│ process_send_     │    │                      │
│ next_run_at   │    │ queue (cron)      │    │                      │
│ → enqueue     │    │ → send + touch    │    │                      │
└───────────────┘    └──────────────────┘    └─────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  conversation_messages + messaging_touches                               │
│  (and optional provider send when tokens available)                     │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  ai_insights_worker (cron 5 min)                                         │
│  Threads/contacts → Luma AI → messaging_ai_thread_insights,              │
│  messaging_ai_contact_insights                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Database (Phase 2)

### New tables

| Table | Purpose |
|-------|--------|
| `messaging_organizations` | Teams/broker orgs for shared templates and sequences |
| `messaging_organization_members` | org_id, user_id, role (owner/admin/member) |
| `messaging_templates` | Email/SMS templates; org_id or user_id |
| `messaging_events` | Event log for automation engine (type, payload, processed_at) |
| `messaging_automations` | Rules: trigger_type, conditions (jsonb), actions (jsonb) |
| `messaging_sequences` | Multi-channel sequences (replaces/extends campaigns concept) |
| `messaging_sequence_steps` | step_key, channel, delay_minutes, branch_on_reply_to, branch_on_no_reply_to |
| `messaging_sequence_enrollments` | current_step_key, next_run_at, last_inbound/outbound |
| `message_send_queue` | idempotency_key, status (queued/processing/sent/failed), retries |
| `messaging_ai_thread_insights` | summary, intent, sentiment, urgency_score, next_best_action, suggested_drafts |
| `messaging_ai_contact_insights` | engagement_score, lead_temperature, objections, preferences |
| `messaging_touches` | contact_id, deal_id, channel, message_id, occurred_at |
| `messaging_consent_events` | Audit of consent changes |

### Extended (Phase 1 tables)

- `conversation_contacts`: `communication_consent` (unknown/consented/declined)
- `conversation_threads`: `deal_id`, `stage_id`, `opportunity_type`

---

## Event types

| Type | Description | Typical payload |
|------|-------------|------------------|
| `contact_created` | New lead/contact | contact_id, tags |
| `deal_stage_changed` | Pipeline stage change | deal_id, from_stage_id, to_stage_id, contact_id? |
| `inbound_reply` | Contact replied in thread | thread_id, contact_id |
| `no_reply_after_days` | No reply after N days | thread_id, contact_id, days |
| `appointment_scheduled` | Stub / future | contact_id |
| `market_signal` | From Market Intelligence (stub) | area, signal_type |

Events are inserted via **messaging-event-ingest** (authenticated). The **automation_engine** marks them processed and runs matching automations.

---

## Automation examples

1. **When deal stage changes to “Active Buyer”, start Buyer Nurture sequence**  
   Trigger: `deal_stage_changed`. Conditions: `to_stage_id` = X. Action: `start_sequence` with `sequence_id`, `contact_id` (from payload or resolved from deal).

2. **When contact is created, send welcome email**  
   Trigger: `contact_created`. Action: `enqueue_message` with template, contact_id, channel email.

3. **When inbound reply received, pause sequence**  
   Trigger: `inbound_reply`. Action: `pause_sequence` for that contact’s enrollments.

Actions (jsonb) shape examples:

- `{ "kind": "start_sequence", "sequence_id": "uuid", "contact_id": "uuid" }`
- `{ "kind": "enqueue_message", "contact_id": "uuid", "channel": "email", "body": "...", "subject": "..." }`
- `{ "kind": "pause_sequence", "contact_id": "uuid" }`

---

## Edge Functions (Phase 2)

| Function | Invocation | Purpose |
|----------|------------|---------|
| `messaging-event-ingest` | POST (auth) | Insert event into `messaging_events` |
| `automation_engine` | Cron 1–5 min | Process events, evaluate rules, run actions |
| `sequence_runner` | Cron 1–5 min | Run sequence enrollments (next_run_at), enqueue steps |
| `process_send_queue` | Cron 1 min | Process `message_send_queue`, persist message + touch |
| `ai_insights_worker` | Cron 5 min | Generate/update AI thread and contact insights (stub or Luma AI) |

---

## Queue and idempotency

- Outbound sends (from sequences or automations) are inserted into **message_send_queue** with an **idempotency_key** to avoid duplicates.
- **process_send_queue** locks rows (queued, next_attempt_at ≤ now), creates `conversation_messages` and `messaging_touches`, then marks queue row as sent (or failed and retries with backoff).

---

## RLS

- All Phase 2 tables use RLS with `user_id = (SELECT auth.uid())` or org membership for shared resources.
- `messaging_events` and `message_send_queue` updates are done by service role in Edge Functions; users can read their own rows.

---

## How to test end-to-end (Phase 2)

1. **Run migrations**  
   `npx supabase db push` or apply `20260220140000_luma_conversations_phase2.sql`.

2. **Emit an event**  
   Call `messaging-event-ingest` with Authorization and body:  
   `{ "type": "contact_created", "payload": { "contact_id": "<uuid>" } }`.

3. **Create an automation**  
   Insert into `messaging_automations`: trigger_type `contact_created`, actions e.g. `[{ "kind": "enqueue_message", "contact_id": "<from payload>", "channel": "email", "body": "Welcome!" }]`. (In production, contact_id would come from the event payload when the engine runs.)

4. **Run automation_engine**  
   Invoke the function (cron or manually). Check `messaging_events.processed_at` and `message_send_queue` for a new row.

5. **Run process_send_queue**  
   Invoke the function. Check `conversation_messages` and `messaging_touches` for the new outbound message and touch.

6. **Sequence**  
   Create a sequence with steps, enroll a contact, run **sequence_runner**; confirm queue and then process_send_queue.

7. **AI insights**  
   Run **ai_insights_worker**; confirm `messaging_ai_thread_insights` has rows (stub or real).

---

## Implementation status

- **Done**: DB migrations + RLS, event ingest, automation_engine (basic), process_send_queue (persist message + touch), sequence_runner (enqueue steps), ai_insights_worker (stub), Phase 2 types, this doc.
- **Next**: Frontend UI for automations, sequences 2.0 builder, templates library, quiet hours/settings, pipeline deal/stage link in thread UI, real Luma AI for insights, provider send inside process_send_queue when tokens available.
