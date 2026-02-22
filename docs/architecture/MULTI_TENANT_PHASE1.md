# Multi-Tenant Architecture – Phase 1

**Goal:** Scalable multi-tenant foundation for Luma-IQ supporting independent agents, brokerages, and teams with strong data isolation and flexible ownership. No shortcuts; clean foundation for future AI marketing optimization and enterprise scale.

---

## 1. Core Principles

- **Luma-IQ is a SaaS platform**, not a single CRM. Multiple organizations (agents, brokerages, teams) coexist.
- **Every critical object** has ownership and visibility defined at the database level.
- **Agents inside teams** have isolation: they see only their private data, assigned leads, and intentionally shared team data. They never see brokerage ROI or other agents’ personal marketing.
- **Security** is enforced in the backend, database, and API—not only in the UI.
- **Design supports** large brokerages, multi-office teams, franchises, and enterprise accounts.

---

## 2. Organization Model

### 2.1 Organizations Table

Each **organization** is the top-level tenant. It represents one of:

- **Independent agent** – one user (owner); “my business.”
- **Brokerage** – many users; org owns shared config, billing, and org-level data.
- **Team** – a team within a brokerage or a standalone team; has its own org for isolation.

| Column | Type | Purpose |
|--------|------|--------|
| `id` | uuid | PK |
| `name` | text | Display name |
| `organization_type` | enum | `independent`, `brokerage`, `team` |
| `owner_id` | uuid | FK → auth.users; the org owner (one per org) |
| `subscription_tier` | text | e.g. `starter`, `growth`, `enterprise`; for future billing |
| `agent_limit` | int | Max active agents (for tier/overage) |
| `active_user_count` | int | Current count (maintained by app or trigger) |
| `billing_metadata` | jsonb | Stripe/customer ids, plan info; no sensitive secrets |
| `created_at`, `updated_at` | timestamptz | |

Independent agents are simply organizations with one user (the owner). No separate “single-user” path.

### 2.2 Linking Existing Concepts

- **Workspace** – Today `workspace_settings` is the shared config (name, timezone, integrations). Phase 1: add `organization_id` to `workspace_settings`; one workspace per organization. Backfill: one org per existing workspace (type `independent`, owner = workspace `owner_user_id`).
- **Teams** – Today `teams` are free-standing. Phase 1: add `organization_id` to `teams` so each team belongs to an organization. A brokerage org can have multiple teams; each team can have its own org if we model “team” as org type, or teams are children of one brokerage org.

---

## 3. User and Role System (Organization-Scoped)

### 3.1 Organization Members

| Table | Purpose |
|-------|--------|
| `organization_members` | user ↔ organization membership with **org-scoped role** |

| Column | Type | Purpose |
|--------|------|--------|
| `id` | uuid | PK |
| `organization_id` | uuid | FK → organizations |
| `user_id` | uuid | FK → auth.users |
| `role` | enum | `owner`, `admin`, `agent` |
| `created_at`, `updated_at` | timestamptz | |
| UNIQUE(organization_id, user_id) | | One membership per user per org |

### 3.2 Org Roles (Phase 1)

| Role | Capabilities |
|------|--------------|
| **Owner** | Full control: billing, subscription, user management, delete org. Single owner per org. |
| **Admin** | Team management, lead routing config, marketing budget allocation, automation setup. No billing. |
| **Agent** | Access only to **assigned** leads and **private** data. Can add personal lead sources and spend. Cannot view team-level or org-level performance/ROI. |

Roles are flexible and extendable (e.g. add `billing_admin` later). Permission checks use role + resource (e.g. “admin can manage teams”) and are enforced in RLS and API.

---

## 4. Data Ownership Layer

Every major object in Phase 1 must include:

- **organization_id** – which org owns or scopes this row
- **created_by** – user_id who created it (optional but recommended)
- **visibility_scope** – who can see it: `organization` | `team` | `private`

### 4.1 Phase 1 Objects and Columns

| Object | organization_id | created_by | visibility_scope | Notes |
|--------|-----------------|------------|-------------------|--------|
| **Deals** (leads) | ✅ | ✅ | N/A (access via assignment + org) | assigned_to_id = agent who owns the lead |
| **Lead sources** | ✅ | ✅ | ✅ | private = agent only; team = team; organization = org-wide |
| **Contacts** (conversation_contacts) | ✅ | ✅ | ✅ | Same pattern |
| **Conversations** (threads) | ✅ | ✅ | ✅ | Same pattern |
| **Marketing spend** | ✅ (via wallet or direct) | ✅ | ✅ | Owner + scope per record |
| **Marketing wallets** | ✅ | ✅ | ✅ | One wallet per (user, org) or org-level wallet |
| **Campaigns** (marketing_campaigns) | Via integration → wallet → org | ✅ | Implied by wallet scope | |
| **Tasks** | Via deal → org | ✅ | Inherit from deal | |
| **Automations** | ✅ | ✅ | ✅ | private / team / organization |

All enforced at the **database** level (NOT NULL where required, FK, RLS).

---

## 5. Visibility Scope System

### 5.1 Enum

```sql
visibility_scope: 'organization' | 'team' | 'private'
```

- **organization** – visible to all members of the organization (e.g. brokerage Zillow spend).
- **team** – visible to members of a specific team (and admins/owners). Requires `team_id` when scope = team.
- **private** – visible only to the **created_by** user (e.g. agent’s personal Facebook ads).

### 5.2 Rules

- **Agents** see:
  - Their **private** data.
  - **Leads assigned to them** (deals where assigned_to_id = auth.uid() or created_by = auth.uid() and org allows).
  - **Team** data only for teams they belong to.
  - **Organization** data only if org policy allows (e.g. org-level reports for admins/owners; agents may be restricted).
- **Agents must never see:**
  - Other agents’ **private** data.
  - **Brokerage ROI** or org-level financials (unless role = admin/owner).
  - **Sensitive team metrics** for teams they are not in.

RLS policies implement these rules using `organization_members.role`, `visibility_scope`, `team_id`, and `created_by`.

---

## 6. Marketing Spend Foundation

Each marketing spend–related record must support:

- **Owner** – user or org (via organization_id + created_by)
- **Scope** – visibility_scope (organization | team | private)
- **Budget** – allocation/budget (existing marketing_allocations)
- **Cost** – actual spend (marketing_spend)
- **Source** – channel/source (existing channel_id, etc.)
- **Leads generated** – attribution (existing lead_sources + deals)
- **Attribution hooks** – for future ROI (existing pipeline_value, lead_source_id on deals)

Phase 1: ensure `marketing_wallets` and `marketing_spend` (or allocation) have `organization_id`, `created_by`, and `visibility_scope` so that:
- Org-level spend is visible to org admins/owners.
- Private spend is visible only to the creating user.
- Team-level spend is visible to that team’s members and org admins.

---

## 7. Subscription and Tiering Foundation

- **organizations** table has: `subscription_tier`, `agent_limit`, `active_user_count`, `billing_metadata`.
- No full billing logic in Phase 1. Structure supports:
  - Tiered pricing by active agents.
  - Limits per subscription.
  - Automatic upgrade triggers (app logic later).
  - Overage tracking (app or background job).

Optional: `subscription_plans` table (id, name, agent_limit, features jsonb) for reference. Not required for Phase 1.

---

## 8. Lead Assignment

- **Deals** (leads):
  - **organization_id** – org that owns the lead.
  - **assigned_to_id** – user (agent) assigned to work the lead; NULL = unassigned.
  - **created_by** – who created the deal.
- Leads can be reassigned (UPDATE assigned_to_id). Manual assignment in Phase 1; routing logic later.
- RLS: agents see deals where assigned_to_id = auth.uid() or they are admin/owner in the org; admins/owners see all deals in the org.

---

## 9. Security and Trust

- **Backend** – All APIs and services use the same RLS; no “admin override” that bypasses RLS for normal operations.
- **Database** – RLS on every table in scope; policies use organization_members, visibility_scope, and assignment.
- **API** – Supabase client is authenticated; RLS applies. No raw SQL that bypasses RLS.
- **Frontend** – Hides actions the user cannot perform, but enforcement is not relied on for security.

---

## 10. Scalability

- **Indexes** – organization_id, assigned_to_id, visibility_scope, team_id on all Phase 1 tables.
- **No single-tenant assumptions** – no global “current org” in DB; every row is org-scoped.
- **Large brokerages** – org can have many teams and many members; RLS uses indexes and minimal subqueries.
- **Multi-office / franchises** – model as multiple organizations or org type + hierarchy later; Phase 1 stays flat (one org per tenant).

---

## 11. Implementation Order (Phase 1)

1. **Organizations and members** – Create `organizations`, `organization_members`, enums. Backfill one org per workspace; add organization_id to workspace_settings and teams.
2. **Visibility and ownership columns** – Add organization_id, created_by, visibility_scope (and team_id where needed) to deals, lead_sources, tasks, marketing_wallets, conversation_contacts, conversation_threads, automations; extend marketing_spend/allocations as needed.
3. **Lead assignment** – Add assigned_to_id to deals; backfill from existing user_id where appropriate.
4. **RLS helpers** – Functions: e.g. `is_org_member(org_id, user_id)`, `get_org_role(org_id, user_id)`, `can_see_record(org_id, scope, team_id, created_by, user_id)`.
5. **RLS policies** – Replace or extend existing policies to use org + visibility + assignment. Agents restricted to assigned + private; admins/owners see org/team as designed.
6. **Subscription foundation** – Already on organizations; optional subscription_plans table.
7. **Onboarding and UI** – Organization onboarding flow, create teams, invite users (organization_members with role). Agents see only their data and assigned leads.

---

## 12. Glossary

- **Organization** – Top-level tenant (independent agent, brokerage, or team).
- **Organization member** – User belonging to an org with a role (owner, admin, agent).
- **Visibility scope** – Who can see a row: organization, team, or private.
- **Assigned lead** – Deal with assigned_to_id set to an agent; that agent (and admins/owners) can access it.
