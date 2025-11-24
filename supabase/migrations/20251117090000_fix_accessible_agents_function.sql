/*
  # Fix get_accessible_agents function

  - Replace the existing function that was throwing 400s in production
  - Harden null handling for viewers without settings/team rows
  - Keep security definer and explicitly set search_path
*/

drop function if exists get_accessible_agents();

create or replace function get_accessible_agents()
returns table (
  user_id uuid,
  display_name text,
  email text,
  team_id uuid,
  team_role team_role,
  global_role global_role
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  viewer_workspace uuid;
  viewer_role global_role;
begin
  if viewer_id is null then
    return;
  end if;

  select us.workspace_id, us.global_role
  into viewer_workspace, viewer_role
  from user_settings us
  where us.user_id = viewer_id;

  -- If the viewer has no role record, return just their own row
  if viewer_role is null then
    return query
      select
        u.id as user_id,
        coalesce(u.raw_user_meta_data->>'name', u.email) as display_name,
        u.email,
        null::uuid as team_id,
        null::team_role as team_role,
        'agent'::global_role as global_role
      from auth.users u
      where u.id = viewer_id;
    return;
  end if;

  return query
    with my_teams as (
      select team_id
      from user_teams
      where user_id = viewer_id
    )
    select
      us.user_id,
      coalesce(u.raw_user_meta_data->>'name', u.email)::text as display_name,
      u.email::text as email,
      ut.team_id,
      ut.role as team_role,
      us.global_role
    from user_settings us
    left join user_teams ut on ut.user_id = us.user_id
    left join auth.users u on u.id = us.user_id
    where
      -- always include self
      us.user_id = viewer_id
      -- admins/sales managers can see workspace users
      or (
        viewer_role in ('admin', 'sales_manager')
        and (viewer_workspace is null or us.workspace_id = viewer_workspace)
      )
      -- team leads can see users on the same team
      or (
        viewer_role = 'team_lead'
        and exists (
          select 1
          from my_teams mt
          where mt.team_id = ut.team_id
        )
      )
    order by display_name nulls last, email nulls last;
end;
$$;

revoke all on function get_accessible_agents() from public;
grant execute on function get_accessible_agents() to authenticated;
