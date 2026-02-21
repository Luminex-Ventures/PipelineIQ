# Developer setup: Integrations infrastructure

Use this as the single checklist to get the system ready so each integration works for users. All secrets are **Supabase Edge Function secrets** unless noted.

---

## 1. Where secrets live

- **Supabase Dashboard** → Project → Settings → Edge Functions → Secrets (or `supabase secrets set KEY=value`).
- **Local `.env`** – only for app env (e.g. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Never put provider API keys in frontend env.
- **Never** commit real keys; use `.env.example` only for variable names and placeholders.

---

## 2. Global / app config

| Variable | Where | Purpose |
|----------|--------|---------|
| `VITE_SUPABASE_URL` | App `.env` | Supabase project URL (client). |
| `VITE_SUPABASE_ANON_KEY` | App `.env` | Supabase anon key (client). |
| `SUPABASE_URL` | Auto-injected in Edge Functions | Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected in Edge Functions | Service role for server-side DB and auth. |
| `APP_ORIGIN` | Supabase secrets | Frontend origin for OAuth redirects (e.g. `https://app.luma-iq.com` or `http://localhost:5173`). |

---

## 3. Messaging & Inbox (Gmail, Microsoft, Twilio)

### 3.1 Gmail / Google Workspace

| Secret | Required | Where to get it | Notes |
|--------|----------|------------------|--------|
| `GOOGLE_CLIENT_ID` | Yes | [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application) | Use the same project for Gmail and (if needed) Google Ads later. |
| `GOOGLE_CLIENT_SECRET` | Yes | Same credentials page | Keep server-side only. |
| `GOOGLE_REDIRECT_URI` | Optional | Same credentials → Authorized redirect URIs | Must match callback URL. Default if unset: `https://<project-ref>.supabase.co/functions/v1/conversations-oauth-callback`. |

**Redirect URI to register in Google Console:**

- Production: `https://<your-supabase-project-ref>.supabase.co/functions/v1/conversations-oauth-callback`
- Local (if testing): same, or use Supabase’s local functions URL.

**OAuth scopes used:** `gmail.readonly`, `gmail.send`, `gmail.modify`, `userinfo.email`.

**Edge Functions:** `conversations-oauth-start`, `conversations-oauth-callback`, `conversations-sync-email`, `conversations-send-email`, `conversations-disconnect`.

---

### 3.2 Microsoft 365 / Outlook

| Secret | Required | Where to get it | Notes |
|--------|----------|------------------|--------|
| `MICROSOFT_CLIENT_ID` | Yes | [Azure Portal](https://portal.azure.com/) → Azure Active Directory → App registrations → New registration | Application (client) ID. |
| `MICROSOFT_CLIENT_SECRET` | Yes | Same app → Certificates & secrets → New client secret | Value (not Secret ID). |
| `MICROSOFT_REDIRECT_URI` | Optional | Same app → Authentication → Add redirect URI (Web) | Must match callback URL. Default if unset: `https://<project-ref>.supabase.co/functions/v1/conversations-oauth-callback`. |

**Redirect URI to register:** Same as Gmail (Supabase Edge Function callback URL).

**Scopes used:** `openid`, `email`, `Mail.Read`, `Mail.Send`, `User.Read`.

**Edge Functions:** Same as Gmail (shared OAuth start/callback).

---

### 3.3 Twilio (SMS)

| Secret | Required | Where to get it | Notes |
|--------|----------|------------------|--------|
| `TWILIO_AUTH_TOKEN` | Yes (for webhook) | [Twilio Console](https://console.twilio.com/) → Account → Auth Token | Used to validate incoming webhook requests. User’s own SID/Token/From are sent from client to `conversations-twilio-connect`. |

**User-provided (not secrets):** Account SID, Auth Token, From number – stored per user in DB via `conversations-twilio-connect`.

**Webhook URL to set in Twilio:** For the “From” number’s webhook (incoming SMS): point to your deployed `conversations-twilio-webhook` (e.g. `https://<project-ref>.supabase.co/functions/v1/conversations-twilio-webhook`). Optional: `DEFAULT_TWILIO_USER_ID` if you need to associate inbound SMS to a user when no account is found.

**Edge Functions:** `conversations-twilio-connect`, `conversations-twilio-webhook`, `conversations-send-sms`, `conversations-disconnect`.

---

### 3.4 Optional: token encryption (Messaging)

| Secret | Required | Where to get it | Notes |
|--------|----------|------------------|--------|
| `CONVERSATIONS_TOKEN_ENCRYPTION_KEY` | No | Generate a 32-byte key (e.g. `openssl rand -base64 32`) | If set, OAuth tokens are encrypted at rest; if not set, a reference-only storage may be used. |

---

## 4. CRM (Follow Up Boss)

Currently a **workspace-level toggle** only; no external API or secrets. When you implement the real integration:

- Get API credentials from [Follow Up Boss](https://followupboss.com/) (developer/API section).
- Add secrets (e.g. `FOLLOWUPBOSS_API_KEY` or OAuth client id/secret) and an Edge Function to sync contacts/deals.
- See [crm.md](./crm.md) for planned flow and tables.

---

## 5. Marketing (Growth Engine)

### 5.1 Google Ads / Meta Ads (OAuth implemented)

| Secret | Required | Where to get it | Notes |
|--------|----------|------------------|--------|
| `GOOGLE_ADS_CLIENT_ID` | Yes (or reuse `GOOGLE_CLIENT_ID`) | [Google Cloud Console](https://console.cloud.google.com/) → Credentials → OAuth 2.0 Client ID | Same or separate app as Gmail. |
| `GOOGLE_ADS_CLIENT_SECRET` | Yes (or reuse `GOOGLE_CLIENT_SECRET`) | Same | Server-side only. |
| `GOOGLE_ADS_REDIRECT_URI` | Optional | Authorized redirect URI | Default: `https://<project-ref>.supabase.co/functions/v1/marketing-oauth-callback`. |
| `META_ADS_APP_ID` | Yes (or `META_APP_ID`) | [Meta for Developers](https://developers.facebook.com/) → App → Settings → Basic | App ID. |
| `META_ADS_APP_SECRET` | Yes (or `META_APP_SECRET`) | Same app | App Secret. |
| `META_ADS_REDIRECT_URI` | Optional | Facebook Login → Settings → Valid OAuth Redirect URIs | Default: `.../functions/v1/marketing-oauth-callback`. |

**Edge Functions:** `marketing-oauth-start`, `marketing-oauth-callback`. Tokens stored in `marketing_integrations` (token_ref, refresh_token_ref).

### 5.2 Zillow, Realtor.com, Homes.com, Redfin

- **Manual connect** today: users “connect” and we create a row in `marketing_integrations` (no external API yet). When you add real APIs, add provider-specific secrets and document in [marketing.md](./marketing.md).

### 5.3 Zapier

- **Coming soon.** Typically: webhook URL for “Push new leads into Luma-IQ” and optionally a Zapier API key or app credentials. Document in [marketing.md](./marketing.md) when implemented.

---

## 6. Transaction & E-sign (DocuSign, Dotloop)

### 6.1 DocuSign (OAuth implemented)

| Secret | Required | Where to get it | Notes |
|--------|----------|------------------|--------|
| `DOCUSIGN_INTEGRATION_KEY` | Yes | [DocuSign Developer](https://developers.docusign.com/) → App → Integration Key | Client ID. |
| `DOCUSIGN_SECRET_KEY` | Yes | Same app → Secret Key | Used in token exchange. |
| `DOCUSIGN_REDIRECT_URI` | Optional | Same app → Redirect URI | Default: `https://<project-ref>.supabase.co/functions/v1/transaction-docusign-callback`. |
| `DOCUSIGN_BASE_URL` | Optional | — | Default `https://account-d.docusign.com` (demo); use `https://account.docusign.com` for production. |

**Edge Functions:** `transaction-docusign-start`, `transaction-docusign-callback`. Tokens stored in `transaction_integrations`.

### 6.2 Dotloop (OAuth implemented)

| Secret | Required | Where to get it | Notes |
|--------|----------|------------------|--------|
| `DOTLOOP_CLIENT_ID` | Yes | [Dotloop developers](http://info.dotloop.com/developers) – request access; issued as UUID | OAuth client ID. |
| `DOTLOOP_CLIENT_SECRET` | Yes | Same | OAuth client secret. |
| `DOTLOOP_REDIRECT_URI` | Optional | Register in Dotloop app | Default: `https://<project-ref>.supabase.co/functions/v1/transaction-dotloop-callback`. |

**Edge Functions:** `transaction-dotloop-start`, `transaction-dotloop-callback`. Tokens stored in `transaction_integrations`.

**Full developer guide:** [DOTLOOP_IMPLEMENTATION.md](./DOTLOOP_IMPLEMENTATION.md) – registration, redirect URI, secrets, deploy, and optional API usage.

---

## 7. Other Edge Function secrets (reference)

Not integration-specific but used by the product:

- **OpenAI:** `OPENAI_API_KEY` (e.g. for Luma insights).
- **Resend (invites):** `RESEND_API_KEY`, `APP_ORIGIN`, `INVITE_FROM_EMAIL`.
- **MapKit (Market Intelligence):** `APPLE_MAPKIT_TEAM_ID`, `APPLE_MAPKIT_KEY_ID`, `APPLE_MAPKIT_PRIVATE_KEY`.
- **Market data:** `ATTOM_API_KEY`, `REAL_ESTATE_API_URL`, `REAL_ESTATE_API_KEY` (if used).

---

## 8. Integration data model (no duplication)

Integration state is split by **domain**; each store has a single purpose. Do not merge these into one table.

| Store | Purpose | Scope | Contents |
|-------|---------|--------|----------|
| **connected_accounts** | Messaging & Inbox (Gmail, Microsoft, Twilio) | Per user | OAuth tokens, provider, external_account_id. UNIQUE(user_id, provider). |
| **marketing_integrations** | Marketing / Growth Engine (Google Ads, Meta, Zillow, etc.) | Per user (optional team_id, workspace_id) | OAuth or manual rows; token_ref, provider, external_account_id. UNIQUE(user_id, provider, external_account_id). |
| **transaction_integrations** | Transaction & E-sign (DocuSign, Dotloop) | Per user | OAuth tokens, provider. UNIQUE(user_id, provider). |
| **workspace_settings.integration_settings** | Workspace-level toggles (e.g. CRM “on/off”) | Per workspace | JSONB: feature flags only (e.g. `{ crm: { status: 'connected' } }`). No OAuth or tokens. |

- **CRM** (Follow Up Boss): today only a toggle in `integration_settings`; when you add real API, add a `crm_integrations` (or similar) table for tokens and link from UI.
- **Campaigns** are not duplicated: `conversation_campaigns` = email/SMS campaigns; `marketing_campaigns` = ad-platform campaigns linked to `marketing_integrations`; `messaging_sequences` = sequence flows.

---

## 9. Codebase map (integrations)

| Area | Path | Notes |
|------|------|--------|
| Integrations UI (tabs) | `src/pages/WorkspaceSettings.tsx` (case `workspace.integrations`) | Tabs: CRM, Messaging, Marketing, Transaction. |
| CRM block | `src/components/integrations/CrmConnectionsSection.tsx` | Follow Up Boss toggle; uses `workspace.integration_settings`. |
| Messaging block | `src/components/integrations/MessagingConnectionsSection.tsx` | Gmail, Microsoft, Twilio; calls `conversationsApi`. |
| Marketing block | `src/components/integrations/MarketingConnectionsSection.tsx` | Ad + real estate providers; uses `marketing.service` + `marketing_integrations`. |
| Transaction block | `src/components/integrations/TransactionConnectionsSection.tsx` | DocuSign and Dotloop Connect/Disconnect. Uses `transactionIntegrations.service`. |
| Transaction service | `src/services/transactionIntegrations.service.ts` | `listTransactionIntegrations`, `disconnectTransactionIntegration`, `startDocuSignOAuth`, `startDotloopOAuth`. |
| Messaging API client | `src/services/conversationsApi.ts` | Invokes Edge Functions for OAuth start, sync, send, Twilio connect, disconnect. |
| Marketing service | `src/services/marketing.service.ts` | `listIntegrations`, `createIntegration`, `disconnectIntegration`, `getChannels`, `startMarketingOAuth`. |
| OAuth start | `supabase/functions/conversations-oauth-start/index.ts` | Builds Google/Microsoft auth URL. |
| OAuth callback | `supabase/functions/conversations-oauth-callback/index.ts` | Exchanges code, stores tokens, redirects to app. |
| Marketing OAuth | `supabase/functions/marketing-oauth-start/index.ts`, `marketing-oauth-callback/index.ts` | Google Ads & Meta Ads; tokens in `marketing_integrations`. |
| DocuSign OAuth | `supabase/functions/transaction-docusign-start/index.ts`, `transaction-docusign-callback/index.ts` | DocuSign; tokens in `transaction_integrations`. |
| Dotloop OAuth | `supabase/functions/transaction-dotloop-start/index.ts`, `transaction-dotloop-callback/index.ts` | Dotloop; tokens in `transaction_integrations`. |
| Twilio webhook | `supabase/functions/conversations-twilio-webhook/index.ts` | Incoming SMS handler; validate with `TWILIO_AUTH_TOKEN`. |

---

## 10. Checklist before go-live (per integration)

- [ ] Provider app created (Google Cloud, Azure, Twilio, etc.).
- [ ] Redirect URIs and (if needed) webhook URLs registered with provider.
- [ ] All required secrets set in Supabase Edge Functions.
- [ ] `APP_ORIGIN` set to production frontend URL for OAuth redirects.
- [ ] Edge Functions deployed and callback URL tested (e.g. run through connect flow once).
- [ ] If tokens are stored: encryption key set or storage method documented and secure.
