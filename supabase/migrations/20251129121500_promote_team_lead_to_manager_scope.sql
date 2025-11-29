/*
  # Promote team lead to manager scope

  Team leads should have the same access as sales managers. This migration:
  - Recreates deals policies so team leads can see/update all workspace deals (not just their team).
  - Extends lead_sources and pipeline_statuses admin/manager policies to include team leads.
*/

-- Deals policies
drop policy if exists "Users can view accessible deals" on deals;
drop policy if exists "Users can update accessible deals" on deals;

create policy "Users can view accessible deals"
  on deals for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from user_settings
      where user_id = (select auth.uid())
      and global_role in ('admin', 'sales_manager', 'team_lead')
    )
  );

create policy "Users can update accessible deals"
  on deals for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from user_settings
      where user_id = (select auth.uid())
      and global_role in ('admin', 'sales_manager', 'team_lead')
    )
  )
  with check (user_id = (select auth.uid()));

-- Lead sources policies (manager scope)
drop policy if exists "Admins and sales managers can manage all lead sources" on lead_sources;

create policy "Admins and managers can manage all lead sources"
  on lead_sources for all
  to authenticated
  using (
    exists (
      select 1 from user_settings
      where user_id = (select auth.uid())
      and global_role in ('admin', 'sales_manager', 'team_lead')
    )
  )
  with check (
    exists (
      select 1 from user_settings
      where user_id = (select auth.uid())
      and global_role in ('admin', 'sales_manager', 'team_lead')
    )
  );

-- Pipeline statuses policies (manager scope)
drop policy if exists "Admins and sales managers can manage all statuses" on pipeline_statuses;

create policy "Admins and managers can manage all statuses"
  on pipeline_statuses for all
  to authenticated
  using (
    exists (
      select 1 from user_settings
      where user_id = (select auth.uid())
      and global_role in ('admin', 'sales_manager', 'team_lead')
    )
  )
  with check (
    exists (
      select 1 from user_settings
      where user_id = (select auth.uid())
      and global_role in ('admin', 'sales_manager', 'team_lead')
    )
  );
