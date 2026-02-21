# Luma Conversations – Phase 1 Setup & Architecture

## Overview

Phase 1 delivers:

- **Connected accounts**: Gmail and Microsoft 365 (OAuth), Twilio (SMS) with agent-owned or provisioned number
- **Unified inbox**: Thread list + thread detail with email/SMS, filters, search, reply composer
- **Drip campaigns**: Time-based sequences (steps with delay_days, subject, body); enroll contacts; campaign runner sends on schedule; reply pauses enrollment
- **Luma Suggestions**: Rule-based “next action” and template drafts (Warm / Direct / Professional)

Messages are sent from the agent’s connected accounts. Luma stores message history for analysis and timeline views.

---

## Architecture

- **Feature folder**: `src/features/conversations/` (ConnectedAccountsPage, InboxPage, ThreadList, ThreadDetail, Composer, SuggestionsPanel, CampaignsPage, CampaignEditor, EnrollmentsTable)
- **Services**: `conversations.service.ts`, `campaigns.service.ts`, `connectedAccounts.service.ts`, `conversationsApi.ts` (Edge Function client)
- **Hooks**: `useConversations.ts` (useThreads, useThread, useThreadMessages, useSendEmail, useSendSms, useCampaigns, useEnrollments, etc.)
- **Types**: `src/types/conversations.ts`
- **Backend**: Supabase migrations `20260220120000_luma_conversations_schema.sql` (tables + RLS)
- **Edge Functions**: `conversations-oauth-start`, `conversations-oauth-callback`, `conversations-sync-email`, `conversations-send-email`, `conversations-send-sms`, `conversations-twilio-connect`, `conversations-twilio-webhook`, `conversations-disconnect`, `conversations-campaign-runner`

---

## Database

Tables: `connected_accounts`, `conversation_contacts`, `conversation_threads`, `conversation_messages`, `conversation_campaigns`, `conversation_campaign_steps`, `conversation_campaign_enrollments`, `conversation_webhook_events`.

RLS: all tables enforce `user_id = (SELECT auth.uid())`. Webhook handlers resolve provider identity to `user_id` server-side.

---

## Provider Setup

### Gmail (Google Workspace)

1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application).
2. Authorized redirect URI:  
   `https://<project-ref>.supabase.co/functions/v1/conversations-oauth-callback`  
   (or your custom domain for the Edge Function).
3. Env for Edge Functions:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - Optional: `GOOGLE_REDIRECT_URI` (defaults to the Supabase function URL above).

### Microsoft 365 / Outlook

1. **Azure Portal** → App registrations → New registration.  
   Redirect URI: Web → `https://<project-ref>.supabase.co/functions/v1/conversations-oauth-callback`.
2. API permissions: Mail.Read, Mail.Send, User.Read, openid, email.
3. Create a client secret under Certificates & secrets.
4. Env:
   - `MICROSOFT_CLIENT_ID`
   - `MICROSOFT_CLIENT_SECRET`
   - Optional: `MICROSOFT_REDIRECT_URI`.

### Twilio (SMS)

**MVP option**: Agent-owned Twilio number. Agent provides Account SID, Auth Token, and From number; these are validated and stored server-side (metadata/token_ref). No Luma-owned number.

1. Twilio Console: get Account SID and Auth Token. Buy a number (or use existing) for the “From” number.
2. Webhook for inbound SMS:  
   `https://<project-ref>.supabase.co/functions/v1/conversations-twilio-webhook`  
   Set this in Twilio → Phone Numbers → your number → “A MESSAGE COMES IN” Webhook.
3. Env (optional for webhook signature verification): `TWILIO_AUTH_TOKEN`.

---

## Local / Environment

- **App**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (existing).
- **Edge Functions** (Supabase secrets or `.env` in functions):
  - OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`
  - Optional: `APP_ORIGIN` (e.g. `http://localhost:5173`) for OAuth redirect after connect
  - Optional: `CONVERSATIONS_TOKEN_ENCRYPTION_KEY` for encrypting stored OAuth tokens (callback stores token_ref)

---

## Running Migrations

From project root:

```bash
npx supabase db push
```

Or apply the migration file manually in Supabase SQL editor:  
`supabase/migrations/20260220120000_luma_conversations_schema.sql`

---

## Campaign Runner (Cron)

Schedule the campaign runner every 5 minutes (e.g. Supabase cron or external scheduler):

- **URL**: `POST https://<project-ref>.supabase.co/functions/v1/conversations-campaign-runner`
- **Headers**: `Authorization: Bearer <SUPABASE_ANON_OR_SERVICE_ROLE_KEY>`

The function finds active enrollments with `next_send_at <= now`, skips opted-out/unsubscribed, sends the current step (email or SMS), advances the step, and pauses enrollment if the contact has replied after the last outbound (MVP rule).

---

## Phase 1 Completion Checklist

Use this to verify end-to-end:

- [ ] **Connect Gmail**: Click Connect Gmail → OAuth → redirect back → account shows connected.
- [ ] **Sync messages**: Click Sync on Gmail account → sync runs (MVP may return 0; ensure no error).
- [ ] **Send email**: Open a thread (or create one with a contact) → compose → send email → message appears in thread.
- [ ] **Connect Twilio**: Enter Account SID, Auth Token, From number → Connect SMS → account shows connected.
- [ ] **Receive SMS**: Send an SMS to the Twilio number → webhook receives it → message appears in inbox (thread created if needed).
- [ ] **Send SMS**: From thread detail, send SMS → message appears in thread.
- [ ] **Create campaign**: Campaigns → New campaign → name, channel (Email or SMS), add steps (delay_days, subject for email, body) → Create.
- [ ] **Enroll contact**: Select campaign → Enroll contacts → pick contacts → Enroll.
- [ ] **Campaign sends step**: Wait for `next_send_at` or trigger campaign runner manually → enrollment advances; message recorded.
- [ ] **Reply pauses campaign**: Contact replies in that thread → run campaign runner (or wait for cron) → enrollment for that contact pauses (MVP rule).

---

## Unsubscribe / Opt-out

- **Email**: MVP can store `unsubscribed_email` on contacts and suppress campaign sends; unsubscribe header handling can be added in send path.
- **SMS**: Inbound webhook checks body for STOP/STOPALL/UNSUBSCRIBE (case-insensitive), sets `opted_out_sms` on the contact and stops active enrollments for that contact.
