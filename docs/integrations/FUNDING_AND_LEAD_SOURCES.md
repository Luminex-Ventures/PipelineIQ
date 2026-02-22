# Connecting funding to lead sources – developer guide

This doc explains how marketing funding flows from the wallet to channels and how that ties to **lead sources**. Use it when implementing or extending “fund this lead source” behavior, ROI attribution, or budget controls.

---

## 1. Data model (summary)

Funding is **channel-based**, not lead-source-based. Lead sources are linked to channels; the channel’s allocation is the effective “funding” for every lead source attached to that channel.

```
marketing_wallets (one per user)
    ↓ addFunding / marketing_funding
wallet balance
    ↓ setAllocation / marketing_allocations
monthly_budget_cents per marketing_channels(id)
    ↑
lead_sources.marketing_channel_id → marketing_channels(id)
```

| Table / concept | Role |
|-----------------|------|
| **marketing_wallets** | One per user. `balance_cents`, `total_funded_cents`, `total_spent_cents`. |
| **marketing_funding** | Credits to the wallet (one-time or recurring). |
| **marketing_channels** | Fixed list of channels (e.g. `google_ads`, `meta_ads`, `zillow`, `realtor_com`). `slug` matches `marketing_integrations.provider`. |
| **marketing_allocations** | Per-channel monthly budget: `wallet_id`, `channel_id`, `monthly_budget_cents`, `is_paused`. One row per (wallet, channel). |
| **lead_sources** | Each row can have `marketing_channel_id` → `marketing_channels(id)`. Deals with that `lead_source_id` are attributed to that channel for spend/ROI. |
| **marketing_spend** | Recorded spend per `channel_id` (and optional `allocation_id`) for CPL/ROI. |

There is **no** separate “fund this lead source” table. Funding a lead source = ensuring it is tied to a channel and that the user has set an allocation for that channel.

---

## 2. How funding reaches a lead source

1. **User adds money to the wallet**  
   - UI: Growth Engine → “Add funds”.  
   - Backend: `addFunding(walletId, amountCents)` → `marketing_funding` + wallet balance update.

2. **User allocates budget per channel**  
   - UI: Growth Engine → Channel Allocation (only connected channels).  
   - Backend: `setAllocation(walletId, channelId, monthlyBudgetCents, isPaused)` → `marketing_allocations` (upsert per wallet + channel).  
   - “Channel” here is `marketing_channels` (e.g. Google Ads, Zillow). Connected channels are those with at least one row in `marketing_integrations` with matching `provider` (= channel `slug`).

3. **Lead source is tied to a channel**  
   - When creating/editing a lead source, set `marketing_channel_id` to the desired `marketing_channels.id`.  
   - That lead source is then “funded” by the **allocation** for that channel (the monthly budget the user set for that channel).  
   - All lead sources with the same `marketing_channel_id` share that channel’s allocation; the system does not split budget per lead source.

4. **Spend and attribution**  
   - When spend is recorded, it is stored in `marketing_spend` with `channel_id`.  
   - Performance (spend, leads, CPL, ROI) is computed per channel using deals whose `lead_source_id` points to a lead source with that `marketing_channel_id`.

So: **connecting funding to a lead source** = setting `lead_sources.marketing_channel_id` and having the user set an allocation for that channel in the Growth Engine.

---

## 3. Code locations

| What | Where |
|------|--------|
| Wallet / funding / allocations | `src/services/marketing.service.ts`: `getOrCreateWallet`, `addFunding`, `getAllocations`, `setAllocation`, `getChannels`. |
| Channel allocation UI | `src/pages/Marketing.tsx`: “Channel Allocation” section; only shows channels the user has connected (from `listIntegrations`). Luma recommendations: `getChannelAllocationRecommendations`. |
| Lead source CRUD / channel link | `src/pages/settings/LeadSourcesSettings.tsx`, `src/pages/LeadSources.tsx`; post-connect flow in `src/components/integrations/MarketingConnectionsSection.tsx` (create lead source with `marketing_channel_id` when user connects a channel). |
| Performance (spend, leads, ROI by channel) | `src/services/marketing.service.ts`: `getPerformance(userId)`. Uses `marketing_spend`, `lead_sources.marketing_channel_id`, and deals to compute per-channel metrics. |
| Channels list | `marketing_channels` table; seeded in migrations. Channel `slug` must match `marketing_integrations.provider` (e.g. `zillow`, `google_ads`) so “connected” and allocation UI line up. |

---

## 4. Connecting a new lead source to funding (implementation)

1. **Ensure the channel exists**  
   - `marketing_channels` must have a row with the right `slug` (e.g. `zillow`, `google_ads`). Add via migration if you introduce a new channel.

2. **When creating or editing a lead source**  
   - Set `marketing_channel_id` to the `marketing_channels.id` for the channel this source represents (e.g. “Zillow Premier Agent” → Zillow channel).  
   - If the UI lets users pick “Marketing channel” or “Source type”, map that choice to `marketing_channels.id` and save it on `lead_sources`.

3. **User flow**  
   - User connects the integration in Settings → Integrations (e.g. Zillow). That creates a row in `marketing_integrations` with `provider = 'zillow'`.  
   - User optionally creates a lead source linked to Zillow (e.g. “Zillow Premier” with `marketing_channel_id` = Zillow channel).  
   - In Growth Engine, the user sees Zillow in Channel Allocation (because it’s connected), sets a monthly budget, and optionally uses Luma’s suggestion.  
   - That allocation is the shared “funding” for all lead sources with that `marketing_channel_id`. Deals from those lead sources are attributed to that channel for performance.

4. **Optional: “Create lead source?” after connect**  
   - Already implemented in `MarketingConnectionsSection`: after connecting a channel (e.g. Zillow), the app can prompt to create a lead source with a prefilled name and `marketing_channel_id` set to the channel for that provider. That ties the new source to the channel so it participates in allocation and ROI.

---

## 5. Channel slug and integration provider

- **Allocation and “connected” state** use `marketing_integrations.provider` (e.g. `google_ads`, `zillow`).  
- **Channels** are identified by `marketing_channels.slug`.  
- These must match: the UI treats a channel as “connected” when `integrations.some(i => i.provider === ch.slug)`, and allocation is stored by `channel_id` (marketing_channels.id).  
- So when adding a new integration provider, add a matching `marketing_channels` row with the same `slug` as the provider (see migration that adds zillow, realtor_com, etc.).

---

## 6. Per–lead-source funding (future)

Today, budget is set **per channel**; multiple lead sources can share one channel. If you need **per–lead-source** funding (e.g. “$500 for Lead Source A”, “$300 for Lead Source B”):

- Option A: Add a `monthly_budget_cents` (or similar) column on `lead_sources` and enforce that total per-channel across lead sources does not exceed the channel allocation (or treat lead-source budget as a sub-allocation).  
- Option B: Introduce a table like `lead_source_allocations` (e.g. `lead_source_id`, `wallet_id`, `monthly_budget_cents`) and drive spend/attribution from that.  
- In both cases, you’d need to update Growth Engine UI and `getPerformance`/spend logic to respect per–lead-source budgets and attribution.

---

## 7. Checklist for “funding connected to lead source”

- [ ] Lead source has `marketing_channel_id` set to the correct `marketing_channels.id`.  
- [ ] That channel has a row in `marketing_channels` with `slug` matching the integration provider.  
- [ ] User has connected the integration (Settings → Integrations) so the channel appears in Channel Allocation.  
- [ ] User has set a monthly budget for that channel in Growth Engine (or applied Luma’s suggestion).  
- [ ] Deals use that lead source (`lead_source_id`) so performance and ROI attribute to the channel and show in Growth Engine.
