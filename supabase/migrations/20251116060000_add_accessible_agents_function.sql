/*
  # Accessible Agents helper

  Exposes a security-definer function that returns the list of agents the
  current user can view. Team leads get everyone on their team, sales managers
  and admins get the whole workspace, and agents only see themselves.
*/

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
  viewer_id uuid := (select auth.uid());
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

  if viewer_workspace is null then
    viewer_workspace := '00000000-0000-0000-0000-000000000000'::uuid;
  end if;

  return query
    select
      us.user_id,
      coalesce(u.raw_user_meta_data->>'name', u.email) as display_name,
      u.email,
      ut.team_id,
      ut.role as team_role,
      us.global_role
    from user_settings us
    left join user_teams ut on ut.user_id = us.user_id
    left join auth.users u on u.id = us.user_id
    where
      us.user_id = viewer_id
      or (
        viewer_role in ('sales_manager', 'admin')
        and us.workspace_id = viewer_workspace
      )
      or (
        (
          viewer_role = 'team_lead'
          or exists (
            select 1
            from user_teams my_team
            where my_team.user_id = viewer_id and my_team.role = 'team_lead'
          )
        )
        and us.user_id in (
          select team_members.user_id
          from user_teams team_members
          join user_teams my_team on my_team.team_id = team_members.team_id
          where my_team.user_id = viewer_id and my_team.role = 'team_lead'
        )
      )
    order by display_name nulls last;
end;
$$;

revoke all on function get_accessible_agents() from public;
grant execute on function get_accessible_agents() to authenticated;
