# Transaction & E-sign integrations: Dotloop, DocuSign

Internal notes for Dotloop and DocuSign. **DocuSign** and **Dotloop** are both implemented (OAuth, Connect/Disconnect in UI). See [DEVELOPER_SETUP.md](./DEVELOPER_SETUP.md) for secrets and [DOTLOOP_IMPLEMENTATION.md](./DOTLOOP_IMPLEMENTATION.md) for the full Dotloop developer guide.

---

## DocuSign

### Where to get credentials (when implementing)

- [DocuSign Developer](https://developers.docusign.com/) – create an **Integration** (app).
- **Integration Key** (client ID) and **Secret** (or use JWT / OAuth 2.0).
- **Redirect URI:** add your Supabase Edge Function callback (e.g. `https://<project-ref>.supabase.co/functions/v1/transaction-docusign-callback`).
- **Implicit Grant** or **Authorization Code** depending on whether you need long-lived refresh tokens (recommended: Authorization Code).

### Secrets to add (Supabase Edge Functions)

| Secret | Purpose |
|--------|--------|
| `DOCUSIGN_INTEGRATION_KEY` | Integration Key (client ID). |
| `DOCUSIGN_SECRET` | OAuth secret or equivalent. |
| `DOCUSIGN_REDIRECT_URI` | Callback URL. |
| Optional: `DOCUSIGN_ACCOUNT_ID` | If using a single account; otherwise per-user after OAuth. |

### Infrastructure

- **Edge Functions:** e.g. `transaction-docusign-start`, `transaction-docusign-callback` for OAuth; optional `transaction-docusign-webhook` for envelope events (signed, voided, etc.).
- **Webhook (Connect):** DocuSign Connect can send events to a public URL; validate with a shared secret or HMAC if supported.
- **Storage:** New table or columns to link Luma-IQ deals to DocuSign envelope IDs and status; store tokens per user in a `transaction_integrations` or reuse a generic integrations table.

### Scopes / permissions

- Typical: `signature`, `impersonation` (if using JWT). For OAuth, request the scopes needed for sending envelopes and reading status.

### Codebase (when implemented)

- **UI:** `src/components/integrations/TransactionConnectionsSection.tsx` – replace “Coming soon” for DocuSign with Connect and optional “Link to deal” flow.
- **Service:** New `src/services/transaction.service.ts` or similar; call Edge Functions for OAuth and sending envelopes.
- **Deals:** Optionally link `deals.id` to envelope id and show status in pipeline or deal detail.

---

## Dotloop

### Where to get credentials

- [Dotloop developers](http://info.dotloop.com/developers) – request access; you receive **Client ID** (UUID) and **Client Secret**.
- [Public API v2 docs](https://dotloop.github.io/public-api/) – OAuth and API reference.

### Secrets (Supabase Edge Functions)

| Secret | Purpose |
|--------|--------|
| `DOTLOOP_CLIENT_ID` | OAuth client ID from Dotloop. |
| `DOTLOOP_CLIENT_SECRET` | OAuth client secret. |
| `DOTLOOP_REDIRECT_URI` | Callback URL (default: `.../functions/v1/transaction-dotloop-callback`). |

### Infrastructure

- **Edge Functions:** `transaction-dotloop-start`, `transaction-dotloop-callback`.
- **Storage:** `transaction_integrations` (provider `dotloop`); optional `GET /account` for display name.
- **Developer guide:** Full step-by-step: [DOTLOOP_IMPLEMENTATION.md](./DOTLOOP_IMPLEMENTATION.md).

### Data model / next steps

- Map Dotloop "loop" to Luma-IQ deal when building sync; store loop id in metadata or a link table.
- Token refresh: access tokens expire ~12 hours; use `grant_type=refresh_token` and update `token_ref`.
- Optional: call `/oauth/token/revoke` when user clicks Disconnect.


---

## Checklist (before go-live per provider)

- [ ] Developer account and app created (DocuSign / Dotloop).
- [ ] Redirect URIs and webhook URLs (if any) registered.
- [ ] All required secrets set in Supabase.
- [ ] Edge Functions implemented and deployed.
- [ ] Mapping from provider entities (envelopes, loops) to Luma-IQ deals documented and implemented.
- [ ] Rate limits and error handling documented.
