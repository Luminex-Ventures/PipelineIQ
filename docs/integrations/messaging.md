# Messaging & Inbox integrations

Internal setup for Gmail / Google Workspace, Microsoft 365 / Outlook, and Twilio (SMS).

---

## Gmail / Google Workspace

### Where to get credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
4. Application type: **Web application**.
5. **Authorized redirect URIs:** add exactly:
   - `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1/conversations-oauth-callback`
   - For local: e.g. `http://localhost:54321/functions/v1/conversations-oauth-callback` if using local Supabase.
6. Copy **Client ID** and **Client secret**.

### Secrets to set (Supabase Edge Functions)

| Secret | Example / format | Used by |
|--------|------------------|--------|
| `GOOGLE_CLIENT_ID` | `xxxxx.apps.googleusercontent.com` | `conversations-oauth-start`, `conversations-oauth-callback` |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | `conversations-oauth-callback` |
| `GOOGLE_REDIRECT_URI` | Same URL as in Google Console | Optional; default is Supabase callback URL |

### Scopes in use

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/userinfo.email`

### Flow

1. User clicks Connect in UI → client calls `conversations-oauth-start` with `{ provider: 'gmail' }`.
2. Edge Function returns `auth_url`; client redirects user to Google.
3. User consents; Google redirects to `conversations-oauth-callback` with `code` and `state`.
4. Callback exchanges `code` for tokens, stores in DB (e.g. `connected_accounts`), redirects to `APP_ORIGIN` with `?connected=gmail` or `?error=...`.

### Code references

- Client: `src/services/conversationsApi.ts` → `startOAuth('gmail')`.
- UI: `src/components/integrations/MessagingConnectionsSection.tsx`.
- Functions: `supabase/functions/conversations-oauth-start/index.ts`, `supabase/functions/conversations-oauth-callback/index.ts`, `conversations-sync-email`, `conversations-send-email`, `conversations-disconnect`.

---

## Microsoft 365 / Outlook

### Where to get credentials

1. Go to [Azure Portal](https://portal.azure.com/) → **Azure Active Directory** → **App registrations** → **New registration**.
2. Name the app; set supported account types (e.g. “Accounts in any organizational directory and personal Microsoft accounts”).
3. **Authentication** → **Add a platform** → **Web** → Redirect URI:
   - `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1/conversations-oauth-callback`
4. **Certificates & secrets** → **New client secret**; copy the **Value** (not Secret ID).
5. Copy **Application (client) ID** from Overview.

### Secrets to set (Supabase Edge Functions)

| Secret | Example / format | Used by |
|--------|------------------|--------|
| `MICROSOFT_CLIENT_ID` | GUID | `conversations-oauth-start`, `conversations-oauth-callback` |
| `MICROSOFT_CLIENT_SECRET` | From Azure “Value” | `conversations-oauth-callback` |
| `MICROSOFT_REDIRECT_URI` | Same as in Azure | Optional; default is Supabase callback URL |

### Scopes in use

- `openid`
- `email`
- `https://graph.microsoft.com/Mail.Read`
- `https://graph.microsoft.com/Mail.Send`
- `https://graph.microsoft.com/User.Read`

### Flow

Same as Gmail: OAuth start → user consents at Microsoft → callback exchanges code and stores tokens; redirect to app with `?connected=microsoft` or `?error=...`.

### Code references

- Same as Gmail (shared OAuth start/callback); provider `microsoft`.

---

## Twilio (SMS)

### Where to get credentials

1. [Twilio Console](https://console.twilio.com/) → **Account** → **API keys & tokens** (or use Account SID and Auth Token from dashboard).
2. For **incoming SMS webhook:** configure the phone number’s “A message comes in” webhook URL (see below).

### Secrets to set (Supabase Edge Functions)

| Secret | Example / format | Used by |
|--------|------------------|--------|
| `TWILIO_AUTH_TOKEN` | From Twilio Console | `conversations-twilio-webhook` (validates request signature) |

**Note:** Each user supplies their own **Account SID**, **Auth Token**, and **From** number in the UI; these are sent to `conversations-twilio-connect` and stored per user. The **global** `TWILIO_AUTH_TOKEN` is used only if you validate webhooks with a single token; otherwise the webhook may use the user-stored token for validation depending on implementation.

### Webhook URL (Twilio number config)

For each Twilio number used for inbound SMS, set:

- **A message comes in:** `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1/conversations-twilio-webhook`
- Method: **POST**.

### Optional

- `DEFAULT_TWILIO_USER_ID`: if inbound SMS can’t be matched to a connected account, this user id can be used (e.g. for a shared number). Set only if needed.

### Code references

- Client: `conversationsApi.ts` → `connectTwilioViaApi`, `conversations-send-sms`, `conversations-disconnect`.
- Functions: `conversations-twilio-connect`, `conversations-twilio-webhook`, `conversations-send-sms`.

---

## Token storage (optional encryption)

If you want to encrypt OAuth tokens at rest:

- Generate a key: `openssl rand -base64 32`.
- Set in Supabase secrets: `CONVERSATIONS_TOKEN_ENCRYPTION_KEY=<that-value>`.
- Used in `conversations-oauth-callback` when storing tokens.
