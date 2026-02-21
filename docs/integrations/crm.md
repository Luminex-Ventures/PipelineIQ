# CRM integration: Follow Up Boss

Internal notes for the Follow Up Boss integration.

---

## Current state

- **UI:** Workspace Settings → Integrations → **CRM** tab. Single card “Follow Up Boss” with Connect/Disconnect.
- **Backend:** Connect/Disconnect only toggle a value in `workspace_settings.integration_settings` (key `crm`). No external API calls yet.
- **Tables:** No Follow Up Boss–specific tables; workspace `integration_settings` is JSON (e.g. `{ crm: { provider: 'Follow Up Boss', status: 'connected' | 'not_connected', ... } }`).

---

## When implementing the real integration

### Where to get API access

- Follow Up Boss has an [API](https://followupboss.com/api/) for contacts and deals.
- You’ll need a **partner/API** relationship or account that provides API keys or OAuth.
- Document the exact URL (e.g. `https://api.followupboss.com/v1/`) and auth method (API key in header vs OAuth).

### Secrets to add (Supabase Edge Functions)

Plan for one of:

- **API key:** e.g. `FOLLOWUPBOSS_API_KEY` (if one key per workspace or per environment).
- **OAuth:** `FOLLOWUPBOSS_CLIENT_ID`, `FOLLOWUPBOSS_CLIENT_SECRET`, `FOLLOWUPBOSS_REDIRECT_URI` (if per-user connect).

### Infrastructure

- **Edge Function(s):** e.g. `crm-followupboss-sync` to pull contacts/deals and map to Luma-IQ leads/deals.
- **Webhooks (if offered):** Follow Up Boss may support webhooks for new leads; add an Edge Function and document the webhook URL and secret.
- **Redirect URI:** If OAuth, register the Supabase callback URL (e.g. `.../functions/v1/crm-followupboss-callback`) in Follow Up Boss app settings.

### Data model (to define)

- Where to store Follow Up Boss contact/deal IDs and last sync time (e.g. new columns on `deals` / contacts, or a `crm_sync_state` table).
- How to map Follow Up Boss “lead”/“contact” to Luma-IQ `deals` and pipeline status.

### Codebase

- **UI:** `src/components/integrations/CrmConnectionsSection.tsx` – replace or extend the toggle with real “Connect” (OAuth or API key form) and sync status.
- **Service:** New `src/services/crm.service.ts` or similar to call Edge Functions that talk to Follow Up Boss.
- **Workspace settings:** Keep or migrate `integration_settings.crm` to point to a real connected account id once you have a `crm_connected_accounts` (or similar) table.

---

## Checklist (when going live)

- [ ] API or OAuth credentials obtained and documented.
- [ ] Secrets set in Supabase.
- [ ] Edge Function(s) implemented and deployed.
- [ ] Redirect URI / webhook URL registered with Follow Up Boss.
- [ ] Sync logic and mapping documented; conflicts and rate limits handled.
