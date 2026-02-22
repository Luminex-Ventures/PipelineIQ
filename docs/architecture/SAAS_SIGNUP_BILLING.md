# SaaS Signup + Billing + Tenant Provisioning

**Goal:** Self-serve signup, payment-confirmed provisioning, and subdomain-based tenancy.

---

## Flow Summary

1. **Pricing** (`/pricing`) – Public; 4 tiers (Independent, Small Team, Large Team, Enterprise). Config-driven from `src/config/plans.ts`; DB plans in `saas_plans`.
2. **Signup** (`/signup?plan=`) – User enters workspace name, subdomain, email, password. Subdomain validated via `saas_subdomain_available` RPC (format + blocklist + uniqueness). User signs up with Supabase Auth; `tenant_reservations` row created (state `reserved`, `expires_at` = now + 30 min). Frontend calls Edge Function `saas_create_checkout` with JWT; function creates Stripe Checkout session and returns URL; user redirected to Stripe.
3. **Payment** – Stripe Checkout; success redirect to `/setup?session_id={CHECKOUT_SESSION_ID}`.
4. **Webhook** – Stripe sends `checkout.session.completed`. Edge Function `stripe_webhook`:
   - Verifies signature (raw body + `STRIPE_WEBHOOK_SECRET`).
   - Idempotency: if `idempotency_event_id` already set for this event, return 200.
   - Finds reservation by `client_reference_id` (reservation_id), updates to `payment_pending`, creates `provisioning_jobs` row, invokes `saas_provisioning_run`.
5. **Provisioning** – `saas_provisioning_run`: creates `organizations` (with `subdomain`), `workspace_settings`, `organization_members` (owner), updates `user_settings`, creates `saas_subscriptions`, sets reservation `state = active` and `organization_id`. On failure: job and reservation marked failed; audit log.
6. **Setup page** (`/setup`) – Polls `saas_provisioning_status?session_id=` (no auth). When `state === 'active'`, redirects to `https://<subdomain>.luma-iq.ai` (or local `/t/<subdomain>`).
7. **Enterprise** – `/contact-sales`; form writes to `enterprise_leads`; no checkout.

---

## Tables

| Table | Purpose |
|-------|---------|
| `saas_plans` | Plan codes, names, `provider_price_id`, limits. Seed in migration. |
| `tenant_reservations` | Signup lifecycle: subdomain, plan, owner_email, owner_user_id, state, expires_at, checkout_session_id, provider_* ids, organization_id (after provision), idempotency_event_id. |
| `provisioning_jobs` | One per reservation after webhook; status queued/running/succeeded/failed; attempts, error_message. |
| `saas_subscriptions` | organization_id, provider_customer_id, provider_subscription_id, plan_code, status, current_period_end. |
| `subdomain_blocklist` | Reserved words (admin, api, www, …). |
| `saas_audit_log` | event_type, entity_type, entity_id, payload. |
| `enterprise_leads` | Contact-sales form: name, email, company, team_size, notes. |

`organizations.subdomain` added (unique). Resolution: Host `*.luma-iq.ai` → subdomain → `organizations.subdomain`; local dev: path `/t/<subdomain>`.

---

## Edge Functions

| Function | Purpose | Auth |
|----------|---------|------|
| `stripe_webhook` | Verify signature; on `checkout.session.completed` idempotent update reservation, create job, call provisioning. On `customer.subscription.updated/deleted` update `saas_subscriptions`. | None (webhook secret only). Deploy with `--no-verify-jwt`. |
| `saas_create_checkout` | Create Stripe Checkout session for reservation_id; return URL. | JWT required; reservation.owner_user_id must equal auth.uid(). |
| `saas_provisioning_run` | Process one job: create org, workspace, members, subscription; mark active. | Service role (invoked by stripe_webhook or cron). |
| `saas_provisioning_status` | GET ?session_id= or ?reservation_id=; return { state, subdomain, ready }. No PII. | None. Deploy with `--no-verify-jwt` for polling. |

---

## Env (Supabase Edge + App)

- `STRIPE_SECRET_KEY` – Stripe API key (create_checkout, subscription update).
- `STRIPE_WEBHOOK_SECRET` – Webhook signing secret (stripe_webhook).
- `SAAS_APP_URL` – Base URL for success/cancel redirects (e.g. `https://app.luma-iq.ai`).

App: `VITE_SUPABASE_URL` (for provisioning_status polling URL if needed; Supabase client uses it for `functions.invoke`).

---

## Security

- Tenant is **never** created from redirect alone; only after webhook confirms payment.
- Webhook signature verified; idempotency by `event.id` stored on reservation.
- Subdomain: blocklist, format 3–30 chars a-z 0-9 hyphen, no hyphen start/end; reservation expires 30 min.
- Create-checkout: only reservation owner (JWT + owner_user_id check).
- RLS: reservations insert anon for draft/reserved; subscriptions read by org members; audit/jobs service role.

---

## Local Dev

- Subdomain fallback: use path `/t/<subdomain>` (e.g. `http://localhost:5173/t/acme`). `getSubdomainFromLocation()` in `src/lib/tenant.ts` returns `acme`.
- Stripe: use CLI webhook forwarding and test mode keys.
- Provisioning status: call `http://localhost:54321/functions/v1/saas_provisioning_status?session_id=...` or use Supabase project URL.

---

## Next Steps (not in scope here)

- Stripe Customer Portal link on Billing page (backend creates portal session, redirect).
- Subscription status enforcement: `past_due` → show billing recovery and restrict core actions; `canceled` → read-only or lock.
- Admin view for provisioning_jobs and audit log (internal only).
- Rate limit subdomain check and reserve (e.g. per-IP at gateway or in RPC).
- Wildcard DNS and TLS for `*.luma-iq.ai`.
