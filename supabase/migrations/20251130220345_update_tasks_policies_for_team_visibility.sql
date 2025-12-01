-- Expand task visibility and management for managers/team leads
alter table public.tasks enable row level security;

-- Allow selects for owners and accessible agents
drop policy if exists tasks_select_policy on public.tasks;
create policy tasks_select_policy
on public.tasks
for select
using (
  auth.uid() = user_id
  or auth.uid() in (select user_id from get_accessible_agents())
);

-- Allow updates for owners and accessible agents
drop policy if exists tasks_update_policy on public.tasks;
create policy tasks_update_policy
on public.tasks
for update
using (
  auth.uid() = user_id
  or auth.uid() in (select user_id from get_accessible_agents())
)
with check (
  auth.uid() = user_id
  or auth.uid() in (select user_id from get_accessible_agents())
);

-- Allow inserts scoped to accessible users (so managers can add tasks for their agents)
drop policy if exists tasks_insert_policy on public.tasks;
create policy tasks_insert_policy
on public.tasks
for insert
with check (
  auth.uid() = user_id
  or user_id in (select user_id from get_accessible_agents())
);
