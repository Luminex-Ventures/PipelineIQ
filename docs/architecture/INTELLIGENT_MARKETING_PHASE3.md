# Intelligent Marketing System – Phase 3 (Enterprise-Ready)

**Goal:** Luma-IQ’s “Intelligent Marketing System”: orgs input investment dollars; Luma allocates, funds, and optimizes spend across lead-generation channels (Zillow, Google, etc.) using pipeline + conversions + closed deals. Continuous learning, auditable, privacy-preserving.

---

## Non-Negotiables

| Principle | Requirement |
|-----------|-------------|
| **Trust & isolation** | No leakage of org/team ROI or spend to team agents. Enforced at DB + API. |
| **Auditability** | Every allocation decision explainable (admin view); data inputs recorded. |
| **Data-first** | Reuse existing DB objects; no parallel concepts. |
| **Safety rails** | Budget caps, pause controls, anomaly detection, human-in-the-loop overrides. |
| **Vendor-agnostic** | Provider interface first; adding channels is systematic. |

---

## 1. Marketing “Investment Account” + Budgets

### 1.1 Budget Containers

**Entity:** `marketing_budgets` (per org or per agent, scope-aligned).

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `organization_id` | FK → organizations (required) |
| `created_by` | user who created (for private: owner) |
| `visibility_scope` | `organization` \| `team` \| `private` (Phase 1 enum) |
| `team_id` | optional; required when scope = team |
| `name` | e.g. "Q1 Org Marketing", "My Facebook" |
| `monthly_budget_cents` | base monthly budget |
| `weekly_cap_cents` | optional weekly cap |
| `per_channel_caps` | jsonb: `{ "channel_slug": max_cents }` |
| `pacing_rule` | enum: `even` \| `front_load` \| `aggressive` |
| `start_date`, `end_date` | optional window |
| `funding_method` | placeholder (e.g. `manual` \| `billing` later) |
| `is_paused` | global pause for this budget |
| `metadata` | jsonb |

**Links:** Budget pools (below) allocate from a budget. Wallets/allocations can be linked to a budget for spend tracking.

### 1.2 Budget Pools + Permissioning

**Concept:** A *pool* is a logical container of funds with a scope.

- **ORG/TEAM pool** – Admin-controlled; `visibility_scope` = organization or team; only org admins/owners manage.
- **PRIVATE pool** – Agent-controlled; `visibility_scope` = private; only `created_by` sees/manages.

Existing `marketing_wallets` already have `organization_id`, `created_by`, `visibility_scope` (Phase 1). Phase 3 adds **marketing_budgets** as the higher-level “investment account” that can fund one or more wallets or be used as the cap source for allocation decisions. Permissioning reuses Phase 1 RLS: `can_see_by_visibility(visibility_scope, organization_id, team_id, created_by, uid)`.

---

## 2. Provider Integration Framework (Do First)

### 2.1 Provider Interface (MVP)

Abstraction (TypeScript) that every channel implements:

- **Create campaign** – create or clone campaign on provider.
- **Update campaign** – budget, status, targeting (as supported).
- **Pause / Resume** – status only.
- **Read spend + delivery metrics** – spend, impressions, clicks, leads (where available).
- **Read leads / conversions** – where provider exposes (e.g. webhook + polling fallback).
- **Credential storage** – secure (e.g. encrypted ref or Supabase Vault); never plain tokens in app DB.
- **Account mapping** – provider account ↔ org/user in `marketing_provider_accounts`.

**DB:**

- **marketing_provider_accounts** – org- or user-scoped; `organization_id`, `created_by`, `visibility_scope`; `provider` (zillow, google_ads, meta_ads, etc.); `external_account_id`, `external_account_name`; `credential_ref` (secure ref); `status`; `last_sync_at`, `last_sync_error`.
- **marketing_campaigns** (existing) – already has `integration_id`, `wallet_id`, `platform_campaign_id`. Extend to reference `marketing_provider_accounts` if we generalize beyond “integration” (or keep integration = account for simplicity).
- **marketing_spend** – already has `source`, `platform_event_id`, `raw_payload`; link to campaign/channel.
- **Lead** – `deals.lead_source_id` + UTM/gclid/fbclid (existing); add `provider_lead_id` if needed for provider ↔ lead mapping.

Providers can be **stubbed** in Phase 3; interfaces must be real so adding Zillow/Google later is drop-in.

### 2.2 Identity Mapping

| Luma concept | Provider concept | Table / column |
|--------------|------------------|----------------|
| Organization | Provider account(s) | `marketing_provider_accounts.organization_id` |
| User (private) | Provider account | `marketing_provider_accounts.created_by`, scope private |
| Campaign | Provider campaign ID | `marketing_campaigns.platform_campaign_id` |
| Spend record | Provider spend data | `marketing_spend.platform_event_id`, `raw_payload` |
| Lead | Provider lead ID | `deals` / lead_sources: optional `provider_lead_id` or via tracking_events |

---

## 3. Attribution Engine (Foundation → Real)

### 3.1 Attribution Levels

| Level | Data | Source |
|-------|------|--------|
| Campaign → Lead | Spend per campaign/channel; leads (deals) per lead_source/channel | `marketing_spend`, `deals.lead_source_id`, `lead_sources.marketing_channel_id`, touchpoints |
| Lead → Opportunity | Pipeline stage, stage_entered_at | `deals.status`, `pipeline_statuses`, `deal_stage_events` |
| Opportunity → Closed | closed_at, actual_sale_price | `deals` |
| Closed → Revenue | Commission or configured value | `deals.expected_sale_price`, `actual_sale_price`, GCI formula |

Existing: `lead_attribution_touchpoints`, `marketing_attribution_settings` (first/last/linear), `deals.lead_source_id`, UTM/gclid/fbclid on deals. **Extend:** one canonical attribution result table (e.g. `attribution_results`) that stores computed link: spend_id/campaign_id → deal_id with confidence and model (last_touch, etc.).

### 3.2 Attribution Rules (Configurable)

- **Attribution window** – e.g. 30 / 60 / 90 days (config per org in `marketing_attribution_settings` or org-level settings).
- **Multi-touch vs last-touch** – Phase 3 default last-touch; keep hooks for multi-touch (existing `attribution_model_type`).
- **Manual overrides** – table `attribution_overrides`: deal_id, override_lead_source_id or override_campaign_id, reason, created_by. Used when correcting misattribution.

### 3.3 Data Backfill

- Job (app or Edge Function): match historical deals to campaign/spend using UTM, gclid, fbclid, landing page, import tags.
- Store confidence per match; support manual review. Table or columns on attribution result to record `confidence`, `match_method`, `backfill_job_id`.

---

## 4. ROI & Performance Metrics Layer

Canonical metrics (computed or materialized), not ad-hoc only in UI.

**Metrics:**

- CPL (cost per lead)
- CPApt (cost per appointment) if tracked
- CPC (cost per contract / pipeline)
- CPClose (cost per closed deal)
- Revenue per lead
- ROI (net or gross)
- Conversion rates per stage
- Time-to-convert
- Quality score (model output; optional)

**Dimensions:** Org, team (optional), agent (private), campaign, channel/provider, time window.

**Implementation:** Materialized view or RPC that aggregates `marketing_spend` + `deals` + `lead_sources` + pipeline stages, scoped by `organization_id` and visibility. Results stored in `marketing_metrics_cache` (org_id, scope, dimension_type, dimension_id, period_start, period_end, metric_name, value) for fast dashboards. Agent-facing queries only return rows where visibility allows (private + assigned leads); admin gets org/team.

---

## 5. Intelligent Allocation Engine

### 5.1 Inputs

- Historical performance (from ROI metrics layer).
- Lead velocity & capacity (agent availability, response time, pipeline load) – from deals/tasks.
- Budget caps and pacing rules (from `marketing_budgets`).
- Policy (privacy + admin settings): no allocation of org budget to channels the agent shouldn’t see.

### 5.2 Decision Outputs (per budget cycle: daily/weekly)

- Amount per channel/campaign.
- Scale up / down / pause.
- New experiments (A/B) where supported.
- **Confidence score + explanation** (stored for admin).

**Table:** `allocation_decisions` – id, organization_id, budget_id, period_start, period_end, decisions jsonb (channel/campaign id → cents, action), explanation text, confidence numeric, status (pending | applied | overridden), created_at, applied_at, created_by (system or user).

### 5.3 Strategy Modes (Admin Selectable)

- **Balanced** – spread across channels by historical mix + ROI.
- **Max ROI** – favor highest ROI channels (with caps).
- **Max Volume** – favor lead volume (CPL guardrails).
- **Quick Wins** – favor short time-to-close.
- **Experiment Heavy** – higher % to tests; exploration.

Stored in org or budget settings: `strategy_mode`, optional params.

### 5.4 Exploration vs Exploitation

- Reserve % of budget for experiments (configurable).
- Stop-loss: underperforming experiments auto-pause or reduce.
- Promote winners into stable allocation (thresholds in config).

### 5.5 Guardrails

- Hard caps: day/week/month (from `marketing_budgets` + per_channel_caps).
- Pause: global (budget) and per channel (existing `marketing_allocations.is_paused`).
- Anomaly detection: CPL spike, lead drop, conversion collapse → flag and optionally auto-pause (with audit).
- “Approval required” mode: certain actions (new campaign, large budget increase) create pending decisions; admin must approve (stored in `allocation_decisions` or `marketing_actions`).

---

## 6. Campaign Lifecycle Management

### 6.1 Campaign Templates (MVP)

**Table:** `marketing_campaign_templates` – name, organization_id, channel_id, target_geography jsonb, audience_keywords_placeholder jsonb, budget_range_cents min/max, creative_placeholder text, landing_page_url, tracking_fields jsonb, visibility_scope.

Used when creating new campaigns from allocation engine or admin.

### 6.2 Auto-Optimization Actions

- Increase/decrease budget, pause/resume, create experiment, shift geo (if supported). All via provider interface; every action logged in `marketing_actions` (existing) with before/after, platform response. Allocation engine produces recommendations; “apply” writes to `marketing_actions` and calls provider.

---

## 7. Reporting & Dashboards

### 7.1 Admin/Owner

- Budget pacing, spend by channel, ROI by channel/campaign, lead quality trends, recommendations + explanation, “what changed this week”.

### 7.2 Agent (Team Members)

- **Only:** own private spend and ROI; performance of *their* leads (e.g. conversion from team-provided leads at personal level); coaching insights without team comparisons. **Never:** brokerage spend, org ROI, other agents’ marketing, vendor names if hidden by policy.

Queries filtered by RLS and by visibility_scope; metrics RPCs accept “scope” and return only allowed rows.

---

## 8. AI Marketing Copilot (Role-Safe)

- **Admin/Owner:** “Where should we spend next week?”, “Underperforming channels?”, “Create test plan for March”, “Summarize ROI drivers.” Uses org-level metrics and allocation explanations.
- **Agent:** “Draft follow-up plan for these leads”, “Improve my conversion rate”, “Suggest personal marketing plan if I spend $X”. No org-level spend/ROI, no team rankings, no vendor disclosure if hidden. All AI outputs pass through Phase 2 AI permissions layer (if present) and visibility checks.

---

## 9. Implementation Order (Phase 3)

1. **Provider interface** – Types + interface (TypeScript); `marketing_provider_accounts` table; stub provider(s). Identity mapping columns where needed.
2. **Marketing budgets** – `marketing_budgets` table; link to org/visibility; optional link wallet/budget for caps.
3. **Budget pools** – Clarify wallet vs budget; RLS for budgets reusing `can_see_by_visibility`.
4. **Attribution extension** – Attribution result/overrides tables; config (window, model); backfill job spec.
5. **ROI metrics layer** – RPC or materialized view + `marketing_metrics_cache`; scope by org/team/agent; respect visibility.
6. **Allocation engine** – Inputs from metrics + budgets; decision output table; strategy modes; guardrails; apply → marketing_actions + provider.
7. **Campaign templates** – Table + admin UI stub.
8. **Reporting** – Admin vs agent dashboards (queries only); no agent-visible org ROI.
9. **AI Copilot** – Prompt + context scoping by role; call existing AI layer with policy.

---

## 10. Acceptance Criteria (Must Pass)

- Team agent cannot see brokerage spend, vendor, or ROI (including AI summaries).
- Admin sees exact allocation decisions + reasoning trail.
- Allocation engine respects caps and pacing.
- Attribution links leads to spend with confidence; supports manual correction.
- “Pause marketing” immediately halts future spend actions and is logged.
- Org-funded and agent-funded marketing coexist without commingling visibility.

---

## 11. Implementation Reference (Phase 3 Foundation)

| Deliverable | Location |
|-------------|----------|
| Migration (provider accounts, budgets, allocation_decisions, templates, attribution_overrides) | `supabase/migrations/20260223100000_intelligent_marketing_phase3.sql` |
| Provider interface (TypeScript) | `src/lib/marketing-providers/types.ts` |
| Stub provider | `src/lib/marketing-providers/stub-provider.ts` |
| Provider registry | `src/lib/marketing-providers/index.ts` |
| Phase 3 types (budgets, decisions, templates, overrides) | `src/types/marketing.ts` (Phase 3 section) |

RLS: Provider accounts and budgets use `can_see_by_visibility`; allocation_decisions are admin/owner only. Agents never see org ROI or allocation reasoning.

---

## 12. Glossary

- **Budget container** – `marketing_budgets`: org/team/private “investment account” with caps and pacing.
- **Budget pool** – Scope (org/team/private) of funds; permissioned via Phase 1 visibility.
- **Provider** – External channel (Zillow, Google Ads, Meta Ads); implements `IMarketingProvider`.
- **Allocation decision** – Engine output stored in `allocation_decisions`; how much per channel/campaign + explanation; admin/owner only.
- **Attribution result** – Canonical link from spend/campaign to deal with confidence and model; manual overrides in `attribution_overrides`.
