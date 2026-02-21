# Marketing (Growth Engine) integrations

Internal setup for ad platforms, real estate portals, and Zapier.

---

## Current state

| Integration | UI | Backend | Notes |
|-------------|----|---------|--------|
| **Google Ads** | Connect button | Toast “OAuth coming soon” | No secrets or API yet. |
| **Meta Ads** | Connect button | Toast “OAuth coming soon” | No secrets or API yet. |
| **Zillow, Realtor.com, Homes.com, Redfin** | Connect (modal: optional account name) | Row in `marketing_integrations` with `provider` and `external_account_id` (e.g. `manual-<uuid>`). Optional lead source creation linked to `marketing_channels`. | No external API; “manual” connect for attribution. |
| **Zapier** | Coming soon card | None | Planned: webhook or API to receive leads. |

---

## Google Ads (when implementing)

### Where to get credentials

- [Google Ads API](https://developers.google.com/google-ads/api/docs/start) – use a Google Cloud project (can be same as Gmail).
- Enable **Google Ads API**; create OAuth 2.0 credentials (Web application) for “Application” or “User” flow depending on whether you link one account per user or a single manager account.
- **Developer token** from Google Ads (may require approval for production).

### Secrets to add (Supabase Edge Functions)

| Secret | Purpose |
|--------|--------|
| `GOOGLE_ADS_CLIENT_ID` | OAuth client ID (can reuse Gmail client or create a separate one). |
| `GOOGLE_ADS_CLIENT_SECRET` | OAuth client secret. |
| `GOOGLE_ADS_REDIRECT_URI` | Callback URL for Edge Function (e.g. `.../functions/v1/marketing-google-ads-callback`). |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | From Google Ads API center. |

### Infrastructure

- New Edge Functions: e.g. `marketing-google-ads-start`, `marketing-google-ads-callback`; optional `marketing-google-ads-sync` for campaigns/spend.
- Store tokens in `marketing_integrations` (e.g. `token_ref`, `refresh_token_ref`); link to `user_id` and optionally `external_account_id` (customer id).

### Codebase

- `src/services/marketing.service.ts` – `createIntegration` already exists; add or call Edge Function for OAuth flow.
- `src/components/integrations/MarketingConnectionsSection.tsx` – wire Connect for `google_ads` to OAuth start instead of toast.

---

## Meta Ads (when implementing)

### Where to get credentials

- [Meta for Developers](https://developers.facebook.com/) – create an App; add **Marketing API** product.
- **App ID** and **App Secret**; OAuth redirect URI for “Facebook Login” or “Instagram” depending on product.

### Secrets to add (Supabase Edge Functions)

| Secret | Purpose |
|--------|--------|
| `META_ADS_APP_ID` | Facebook App ID. |
| `META_ADS_APP_SECRET` | Facebook App Secret. |
| `META_ADS_REDIRECT_URI` | Callback URL (e.g. `.../functions/v1/marketing-meta-ads-callback`). |

### Infrastructure

- Edge Functions for OAuth start and callback; optional sync for ad accounts and spend.
- Store in `marketing_integrations`; map ad account id to channel (e.g. `meta_ads`).

### Codebase

- Same as Google Ads: marketing service + MarketingConnectionsSection; add provider `meta_ads` OAuth flow.

---

## Zillow, Realtor.com, Homes.com, Redfin (current + future)

### Current (manual connect)

- No external API. Users click Connect, optionally enter an account name; we insert into `marketing_integrations` with `provider` = `zillow` | `realtor_com` | `homes_com` | `redfin` and `external_account_id` = `manual-<uuid>`.
- **Channels:** `marketing_channels` has matching slugs; lead sources can link via `marketing_channel_id` for ROI.
- **Secrets:** None required for manual connect.

### When adding real APIs

- Each portal has different partner/developer programs (e.g. Zillow Premier Agent API, Realtor.com API). Document per provider:
  - Where to apply for API access.
  - Auth (API key vs OAuth), base URL, rate limits.
  - Which endpoints map to “leads” or “spend” for attribution.
- Add provider-specific secrets (e.g. `ZILLOW_API_KEY`, `REALTOR_API_KEY`) and Edge Functions to sync; keep `marketing_integrations` and `marketing_channels` as the source of truth for “connected” and ROI.

---

## Zapier (when implementing)

### Typical setup

- **Inbound:** “Push new leads into Luma-IQ” = a **Webhook** trigger in Zapier that POSTs to your endpoint. You expose an Edge Function URL (e.g. `.../functions/v1/marketing-zapier-webhook`) and optionally secure it with a secret (e.g. `ZAPIER_WEBHOOK_SECRET` or a query token).
- **Secrets:** Optional `ZAPIER_WEBHOOK_SECRET` to verify payloads.

### Infrastructure

- Edge Function: `marketing-zapier-webhook` – validate body, map to lead/deal, insert into your DB and optionally create a deal in the earliest pipeline status.
- Document the webhook URL and expected payload shape for internal or Zapier template docs.

### Codebase

- When Zapier is “live,” move it from “Coming soon” in `MarketingConnectionsSection` to a connectable option (e.g. “Connect” copies webhook URL and optional token for the user to paste in Zapier).

---

## Database reference

- **Tables:** `marketing_integrations`, `marketing_channels`, `marketing_allocations`, `marketing_spend`, `lead_sources` (optional `marketing_channel_id`).
- **Enum:** `marketing_integration_provider` includes `google_ads`, `meta_ads`, `zillow`, `realtor_com`, `homes_com`, `redfin`. Add `zapier` when implemented.
- **Migrations:** `supabase/migrations/20260220220000_*`, `20260220230000_*`.
