# Dotloop integration – developer implementation guide

This guide explains how to connect your Luma-IQ environment to Dotloop so users can link their Dotloop account from **Settings → Integrations → Transaction & E-sign**.

---

## 1. Overview

- **Auth:** Dotloop Public API v2 uses **OAuth 2.0 (3-legged)**. Users authorize the app; we store access and refresh tokens in `transaction_integrations`.
- **Flow:** User clicks **Connect** on the Dotloop card → redirect to Dotloop → user approves → redirect back to our callback → we exchange the code for tokens and optionally call `GET /account` for display name → redirect to Integrations with success/error.
- **Tokens:** Access tokens expire in ~12 hours; refresh with `grant_type=refresh_token`. Only one valid token per user/client at a time.

**Official docs:** [Dotloop Public API v2](https://dotloop.github.io/public-api/)

---

## 2. Register your application

1. Go to **[http://info.dotloop.com/developers](http://info.dotloop.com/developers)** and request API access.
2. Complete the registration (you may need to describe your product and that you have Dotloop end users).
3. After approval, Dotloop will issue:
   - **Client ID** (UUID)
   - **Client Secret**

Keep these secure; they are used only in Edge Functions (server-side), never in the frontend.

---

## 3. Redirect URI

Dotloop requires you to register a **Redirect URI** for your app. Use your Supabase Edge Function callback URL:

- **Production:**  
  `https://<your-supabase-project-ref>.supabase.co/functions/v1/transaction-dotloop-callback`

- **Local (Supabase CLI):**  
  `http://127.0.0.1:54321/functions/v1/transaction-dotloop-callback`  
  (or the URL your local functions use)

Register this exact URL in the Dotloop developer portal. The redirect must match character-for-character.

---

## 4. Supabase Edge Function secrets

Set these in **Supabase Dashboard → Project Settings → Edge Functions → Secrets** (or via `supabase secrets set`).

| Secret | Required | Description |
|--------|----------|-------------|
| `DOTLOOP_CLIENT_ID` | Yes | Client ID (UUID) from Dotloop. |
| `DOTLOOP_CLIENT_SECRET` | Yes | Client secret from Dotloop. |
| `DOTLOOP_REDIRECT_URI` | No (recommended for prod) | Callback URL. Default if unset: `https://<project-ref>.supabase.co/functions/v1/transaction-dotloop-callback`. Set explicitly in production so it stays correct. |
| `APP_ORIGIN` | Yes (for redirects) | Frontend origin, e.g. `https://app.luma-iq.com` or `http://localhost:5173`. Used to send the user back to Integrations after OAuth. |

Example (CLI):

```bash
supabase secrets set DOTLOOP_CLIENT_ID=<your-client-id-uuid>
supabase secrets set DOTLOOP_CLIENT_SECRET=<your-client-secret>
supabase secrets set DOTLOOP_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/transaction-dotloop-callback
supabase secrets set APP_ORIGIN=https://app.luma-iq.com
```

---

## 5. Edge Functions and code locations

| Piece | Location | Purpose |
|-------|----------|--------|
| OAuth start | `supabase/functions/transaction-dotloop-start/index.ts` | Builds Dotloop authorize URL; returns `auth_url` for frontend redirect. |
| OAuth callback | `supabase/functions/transaction-dotloop-callback/index.ts` | Exchanges `code` for tokens, optionally calls `GET /account`, upserts `transaction_integrations`, redirects to app. |
| Frontend service | `src/services/transactionIntegrations.service.ts` | `startDotloopOAuth()`, `listTransactionIntegrations()`, `disconnectTransactionIntegration()`. |
| UI | `src/components/integrations/TransactionConnectionsSection.tsx` | Dotloop card with Connect / Disconnect. |

**Database:** Rows are stored in `transaction_integrations` with `provider = 'dotloop'`, one row per user (unique on `user_id`, `provider`). Columns include `token_ref`, `refresh_token_ref`, `external_account_id`, `external_account_name` (from `GET /account` when available).

---

## 6. OAuth flow (reference)

1. **Authorize (user is sent here):**  
   `GET https://auth.dotloop.com/oauth/authorize?response_type=code&client_id=<DOTLOOP_CLIENT_ID>&redirect_uri=<DOTLOOP_REDIRECT_URI>&state=<state>`  
   - `state` format: `{user_id}:dotloop:{uuid}` so the callback can identify the user.

2. **Token exchange (callback does this):**  
   `POST https://auth.dotloop.com/oauth/token?grant_type=authorization_code&code=<code>&redirect_uri=<DOTLOOP_REDIRECT_URI>&state=<state>`  
   - Header: `Authorization: Basic base64(ClientID:ClientSecret)`  
   - Response: `access_token`, `refresh_token`, `expires_in`, `scope`.

3. **Optional – get account for display:**  
   `GET https://api-gateway.dotloop.com/public/v2/account`  
   - Header: `Authorization: Bearer <access_token>`  
   - Requires `account:read` scope if you requested it; we use response for `external_account_id` and `external_account_name`.

4. **Token refresh (for background jobs or API usage later):**  
   `POST https://auth.dotloop.com/oauth/token?grant_type=refresh_token&refresh_token=<refresh_token>`  
   - Same Basic auth header.  
   - Only one valid access/refresh pair per user at a time; refreshing invalidates the previous access token.

5. **Revoke (on Disconnect):**  
   `POST https://auth.dotloop.com/oauth/token/revoke?token=<access_token>`  
   - Optional: call this when the user clicks Disconnect, then set `status = 'disconnected'` in `transaction_integrations`.

---

## 7. Deploy and test

1. Deploy Edge Functions:
   ```bash
   supabase functions deploy transaction-dotloop-start
   supabase functions deploy transaction-dotloop-callback
   ```
2. Ensure all secrets are set and `APP_ORIGIN` matches your frontend.
3. In the app, go to **Settings → Integrations → Transaction & E-sign** and click **Connect** on Dotloop.
4. You should be redirected to Dotloop, then back to Integrations with “Dotloop connected.” If you see `oauth_not_configured` or `token_exchange_failed`, check secrets and redirect URI.

---

## 8. Using the stored token (optional – sync loops, etc.)

To call Dotloop APIs on behalf of a connected user:

1. Load the row from `transaction_integrations` where `user_id = <user>` and `provider = 'dotloop'` and `status = 'connected'`.
2. Decode `token_ref` (current implementation stores a base64-encoded JSON with `access_token` and `refresh_token`). Use the access token in the `Authorization: Bearer <access_token>` header.
3. Base URL for API: `https://api-gateway.dotloop.com/public/v2/` (e.g. `GET /account`, `GET /profile`, `GET /profile/:profile_id/loop`, etc.). See the [Public API docs](https://dotloop.github.io/public-api/).
4. If you get `401`, refresh the token using `refresh_token` and update `token_ref` (and optionally `refresh_token_ref`) in the same row, then retry.

Rate limits (from Dotloop): e.g. 100 requests per minute per user; check response headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

---

## 9. Checklist

- [ ] Application registered at [info.dotloop.com/developers](http://info.dotloop.com/developers); Client ID and Client Secret obtained.
- [ ] Redirect URI registered with Dotloop: `https://<project-ref>.supabase.co/functions/v1/transaction-dotloop-callback` (or your local URL for testing).
- [ ] `DOTLOOP_CLIENT_ID`, `DOTLOOP_CLIENT_SECRET`, and `APP_ORIGIN` set in Supabase Edge Function secrets.
- [ ] `transaction-dotloop-start` and `transaction-dotloop-callback` deployed.
- [ ] Connect flow tested from Settings → Integrations → Dotloop; success and error redirects work.
- [ ] (Optional) Implement token refresh and/or revoke on Disconnect when building sync or API features.
