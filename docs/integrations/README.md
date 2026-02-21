# Integrations – Internal Documentation

This directory contains **internal** instructions for setting up and maintaining each integration in Luma-IQ. It is intended for developers and ops.

## Overview

| Category | Integrations | Status | Setup doc |
|----------|--------------|--------|-----------|
| **CRM** | Follow Up Boss | Placeholder (workspace toggle) | [crm.md](./crm.md) |
| **Messaging & Inbox** | Gmail / Google Workspace, Microsoft 365 / Outlook, Twilio (SMS) | Live (OAuth + API) | [messaging.md](./messaging.md) |
| **Marketing** | Google Ads, Meta Ads, Zillow, Realtor.com, Homes.com, Redfin, Zapier | Partial (manual connect for real estate; OAuth coming for ads) | [marketing.md](./marketing.md) |
| **Transaction & E-sign** | Dotloop, DocuSign | Coming soon | [transaction.md](./transaction.md) |

## For developers

- **[DEVELOPER_SETUP.md](./DEVELOPER_SETUP.md)** – Master checklist: where to get APIs, which secrets to set, infrastructure (Supabase, Edge Functions), and codebase locations. Use this to prepare the system so integrations work for users.

## Doc conventions

- **Secrets** = values stored in Supabase Edge Function secrets (or env), never committed.
- **Redirect URIs** = must be registered in each provider’s developer console and match the deployed callback URL.
- **Scopes** = OAuth scopes requested; document any changes when adding features.
