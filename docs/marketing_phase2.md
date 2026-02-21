# Luma-IQ Intelligent Marketing Engine – Phase 2

## Overview

Phase 2 connects to ad platforms (Google Ads, Meta Ads), ingests real spend and performance data, upgrades attribution to multi-touch, adds campaign control with audit logging, tracking (gclid/fbclid/UTM), a recommendation engine, and automation rules—while keeping all data tied to existing tenancy, deals, and lead sources.

**Flow:** fund → deploy → measure → optimize → reinvest.

---

## Schema Mapping

### Reused (Phase 1, unchanged)

| Table | Purpose |
|-------|--------|
| `marketing_wallets` | Balance, funded, spent; one per user. |
| `marketing_funding` | Funding events. |
| `marketing_transactions` | Ledger (credit/debit). |
| `marketing_channels` | Google Ads, Meta Ads (slug/name). |
| `marketing_allocations` | Per-wallet, per-channel budget + pause. |
| `deals` | Existing pipeline; no parallel tables. |
| `lead_sources` | Existing; `marketing_channel_id` for channel link. |

### Extended (Phase 2)

| Table | Changes |
|-------|--------|
| `marketing_spend` | `source` ('manual' \| 'api'), `platform_event_id` (idempotency), `raw_payload` (audit). Unique index on `platform_event_id` where not null. |
| `marketing_allocations` | `budget_cap_daily_cents`, `budget_cap_monthly_cents`, `last_budget_push_at`, `last_status_push_at`. |
| `deals` | Optional UTM/click: `utm_source`, `utm_medium`, `utm_campaign`, `gclid`, `fbclid`. |

### New (Phase 2)

| Table | Purpose |
|-------|--------|
| `marketing_integrations` | Ad platform OAuth: provider (google_ads, meta_ads), external_account_id, token_ref, refresh_token_ref, status, last_sync_at. Per user; optional team_id/workspace_id. |
| `marketing_campaigns` | Platform campaigns: integration_id, wallet_id, channel_id, allocation_id, platform_campaign_id, status, budget_cents_daily/monthly, last_budget_push_at, last_status_push_at. |
| `marketing_actions` | Audit log: user_id, action_type (pause_campaign, resume_campaign, update_budget, sync_campaigns), entity_type/entity_id, before_state, after_state, platform_response. |
| `lead_attribution_touchpoints` | Multi-touch: deal_id, touch_type (ad_click, form_submit, call, email_response, …), occurred_at, channel_id, campaign_id, metadata. Ties to existing `deals`. |
| `marketing_attribution_settings` | Per user: attribution_model (first_touch, last_touch, linear). |
| `marketing_tracking_events` | Clicks/form submits: event_type, gclid, fbclid, utm_*, landing_url, optional deal_id. |
| `marketing_recommendations` | Recommendation type, title, description, suggested_action, confidence, status (pending/applied/dismissed), metric_snapshot. |
| `marketing_automation_rules` | Rule type (reinvest_percent_of_commission, min_wallet_balance, cpl_below_increase_budget), config jsonb, is_active. |

---

## Data Rules (unchanged)

- **No parallel lead/deal/pipeline tables.** All attribution and touchpoints reference `deals` and `lead_sources`.
- **Tenancy:** marketing_integrations, campaigns, actions, recommendations, automation_rules use user_id; optional team_id/workspace_id where relevant.
- **Auditability:** Platform-derived data: `marketing_spend.raw_payload`, `marketing_actions` (before/after/platform_response), `marketing_tracking_events` for raw clicks/form submits.

---

## Platform Integrations

- **Providers:** `google_ads`, `meta_ads` (enum).
- **Storage:** `marketing_integrations` with token_ref / refresh_token_ref (tokens in secure store; ref in DB).
- **Account selection:** One row per (user_id, provider, external_account_id); user can connect multiple ad accounts.
- **Sync:** last_sync_at, last_sync_error; daily scheduled sync + manual “sync now” (implementation in jobs/Edge Functions).

---

## Real Spend Ingestion

- **Source:** `marketing_spend.source = 'api'` for platform-ingested spend.
- **Idempotency:** `platform_event_id` unique; no double count when re-syncing.
- **Backfill:** Sync jobs can pull last 30/60/90 days; each row keyed by platform_event_id.
- **Raw:** `raw_payload` stores full platform payload for debug/audit.

---

## Campaign Control

- **Pause/resume:** Update campaign status; log in `marketing_actions` with before/after and platform_response.
- **Budget updates:** Respect wallet balance and allocation caps; log in `marketing_actions`.
- **Allocations → campaigns:** `marketing_campaigns.allocation_id` links to `marketing_allocations`; budget pushes update last_budget_push_at / last_status_push_at.

---

## Attribution Upgrade

- **Touchpoints:** `lead_attribution_touchpoints` per deal; touch_type and timestamps.
- **Models:** `marketing_attribution_settings.attribution_model`: first_touch, last_touch, linear.
- **Outputs:** Attributed pipeline value, attributed closed value, time-to-close by channel (computed from touchpoints + model).
- **Touch types:** ad_click, form_submit, call, email_response, sms_response, appointment_set, deal_created, deal_closed.

---

## Landing Pages + Tracking

- **Tracking links:** UTM + gclid/fbclid capture; store in `marketing_tracking_events` and optionally on `deals` (utm_*, gclid, fbclid).
- **Server-side:** Event logging endpoint writes to `marketing_tracking_events` (and can create/update deals or touchpoints when form converts).
- **Form submissions:** Create/update leads in existing lead/deal flow; write touchpoint with touch_type form_submit and link to deal when applicable.

---

## Recommendations & Automation

- **Recommendations:** Stored in `marketing_recommendations`; inputs in metric_snapshot; suggested_action; status pending/applied/dismissed.
- **Automation rules:** `marketing_automation_rules` with rule_type and config; executed by scheduled jobs; every automatic action must write to audit (e.g. marketing_actions or transactions).

---

## Marketplace Prep

- **Channel abstraction:** `marketing_channels` already holds Google/Meta; new providers (e.g. Zillow) add rows and optional new integration provider enum values or a generic “provider” table later.
- **Standard performance schema:** spend/leads/conversions remain in marketing_spend, deals + lead_attribution_touchpoints, and existing performance aggregates.

---

## Success Criteria (Phase 2)

- [ ] **Integrations:** Connect Google / Connect Meta; account selection; daily sync + manual sync.
- [ ] **Spend:** Real spend from platforms; idempotent ingestion; backfill 30/60/90 days; raw payload stored.
- [ ] **Campaign control:** Pause/resume and budget updates from Luma; guardrails (wallet + caps); every change in marketing_actions.
- [ ] **Attribution:** First-touch, last-touch, linear; model selector; attributed pipeline/closed value and time-to-close by channel.
- [ ] **Tracking:** Luma tracking links; gclid/fbclid capture; server-side event endpoint; form → lead/deal + touchpoint.
- [ ] **Recommendations:** Clear, explainable; status tracked (pending/applied/dismissed).
- [ ] **Automation:** Reinvestment and pacing rules; execution via jobs; audit for every auto action.
- [ ] **Ready for Phase 3:** Add Zillow/Realtor.com etc. without schema redesign.

---

## Implementation Notes

- **OAuth flows:** Implement in app or Edge Functions; store only token_ref in DB; encryption/secrets in vault or Supabase Vault.
- **Sync jobs:** Cron or Edge Functions: fetch spend/campaigns from Google/Meta APIs; upsert marketing_spend (with platform_event_id); update marketing_campaigns; set last_sync_at on marketing_integrations.
- **Recommendation engine:** Rule-based v1: e.g. CPL spike, pacing, budget shift suggestions; write rows to marketing_recommendations with metric_snapshot and suggested_action.
- **Automation execution:** Scheduled job reads marketing_automation_rules; evaluates conditions (e.g. closed deal → reinvest %); performs wallet credit or budget change; logs to marketing_actions and marketing_transactions.
