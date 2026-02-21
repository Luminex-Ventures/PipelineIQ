# Luma-IQ Intelligent Marketing Engine – Phase 1

## Overview

Phase 1 delivers a **Marketing Wallet**, **channel allocation** (Google + Meta), **lead source tracking**, a **performance dashboard**, and **rule-based insights**. The system is designed for clarity, trust, and future AI optimization.

---

## Features

### 1. Marketing Wallet

- **Balance**: Current available funds (cents stored, displayed in USD).
- **Total funded / Total spend**: Lifetime totals.
- **Add funds**: One-time or recurring (recurring scheduling is stored; execution can be wired to a cron in Phase 2).
- **Transaction history**: Audit log of credits (funding) and debits (spend).

### 2. Channel Allocation

- **Channels**: Google Ads, Meta Ads (seed data in `marketing_channels`).
- **Per-channel monthly budget**: Set in USD; stored as `monthly_budget_cents` in `marketing_allocations`.
- **Pause / Resume**: `is_paused` on allocation stops new spend from that channel (logic in app or future worker).

Phase 1 does **not** create or manage actual ad campaigns; it establishes budget and allocation for later automation.

### 3. Lead Source Tracking

- **Attribution**: `lead_sources.marketing_channel_id` links a lead source to a marketing channel (Google or Meta).
- **Deals**: Existing `deals.lead_source_id` ties a deal to a lead source; combined with `marketing_channel_id`, leads are attributed to a channel.
- **Cost per lead**: For a channel, CPL = (sum of `marketing_spend.amount_cents` for that channel) / (count of deals whose `lead_source.marketing_channel_id` = that channel).
- **ROI**: Pipeline value (expected/actual sale price) vs spend; ROI % = (pipeline value − spend) / spend × 100.

**To get CPL/ROI in the dashboard**: In **Settings → Lead Sources**, link each lead source to **Google Ads** or **Meta Ads** (when the UI field is added). Record spend via **Marketing → record spend** (or future integration).

### 4. Performance Dashboard

- **Total spend, leads, cost per lead, ROI** (current period: YTD).
- **By channel**: Spend, leads, CPL, ROI per channel.
- **Monthly trend**: Spend by month (foundation for charts).

### 5. Rule-Based Insights (Phase 1, no AI)

- “Google is outperforming Meta this month” (when one channel has more leads).
- “Your cost per lead is $X” (when leads and spend exist).
- “You may run out of budget in N days” (based on balance and total active monthly allocation).
- “Positive ROI” when estimated ROI &gt; 0.

---

## Database Schema

| Table | Purpose |
|-------|--------|
| `marketing_channels` | Google Ads, Meta Ads (slug, name). |
| `marketing_wallets` | One per user; balance_cents, total_funded_cents, total_spent_cents. |
| `marketing_funding` | Funding events (amount, type, status). |
| `marketing_transactions` | Ledger: credit/debit, balance_after, reference to funding or spend. |
| `marketing_allocations` | Per-wallet, per-channel: monthly_budget_cents, is_paused. |
| `marketing_spend` | Recorded spend per channel (amount, period_start, period_end, optional campaign_name). |
| `lead_sources` | New column: `marketing_channel_id` (optional FK to `marketing_channels`). |

All amounts are stored in **cents** (integer). RLS restricts access to the wallet owner (user_id).

---

## API / Service Layer

- **getOrCreateWallet(userId)**: Returns or creates the user’s wallet.
- **addFunding(walletId, amountCents, type)**: Inserts funding, updates wallet balance and total_funded, inserts transaction.
- **getTransactions(walletId, limit)**: List transactions.
- **getChannels()**: List marketing channels.
- **getAllocations(walletId)**: Allocations with channel details.
- **setAllocation(walletId, channelId, monthlyBudgetCents, isPaused)**: Upsert allocation.
- **getSpend(walletId, options?)**: List spend records.
- **recordSpend(walletId, channelId, amountCents, periodStart, periodEnd, campaignName?)**: Inserts spend, decrements wallet balance, inserts transaction.
- **getPerformance(userId)**: Aggregates spend and deals (via lead_sources.marketing_channel_id), returns CPL, ROI, by-channel, monthly trend.
- **getInsights(userId)**: Rule-based insight list.

---

## UI

- **Route**: `/marketing`.
- **Sections**: Wallet (balance, funded, spend, transaction history), Channel allocation (Google/Meta budget + pause), Performance (metrics + by-channel table), Insights (cards).
- **Add funds**: Modal with amount input; one-time funding.

---

## Phase 2 Expansion (Planned)

- **Recurring funding**: Cron to apply scheduled funding and insert transactions.
- **Lead source UI**: Dropdown in Lead Sources settings to set `marketing_channel_id`.
- **Spend ingestion**: Import or API to record spend from ad platforms.
- **AI optimization**: Recommendations, budget pacing, channel mix.
- **Brokerage / team wallets**: Optional team_id / workspace_id on wallets and scope in RLS.
- **Zillow, marketplace, financing**: New channels and allocation types.

---

## Success Criteria (Phase 1)

- [x] Agents can fund wallet and see balance / history.
- [x] Agents can set monthly budget per channel (Google, Meta) and pause/resume.
- [x] Leads are attributable to channels via lead_sources.marketing_channel_id.
- [x] Performance dashboard shows spend, leads, CPL, ROI.
- [x] Rule-based insights appear when conditions are met.
- [x] Schema and service layer support future AI and multi-channel expansion.
