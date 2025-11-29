/*
  # Allow admins to delete workspace members

  - Extend manage_workspace_member to support a `delete` action.
  - Prevent deleting the last admin.
  - Prevent admins from deleting themselves.
  - Deleting removes the user from auth.users, cascading to dependent rows.
*/

drop function if exists manage_workspace_member(uuid, text, global_role);

create or replace function manage_workspace_member(
  target_user uuid,
  action text,
  new_role global_role default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer record;
  target record;
  remaining_admins integer;
begin
  select user_id, workspace_id, global_role, is_active
  into viewer
  from user_settings
  where user_id = (select auth.uid());

  if viewer.user_id is null or viewer.workspace_id is null then
    raise exception 'Viewer not assigned to workspace';
  end if;

  if viewer.global_role <> 'admin' then
    raise exception 'Only admins can manage members';
  end if;

  select *
  into target
  from user_settings
  where user_id = target_user;

  if target.user_id is null then
    raise exception 'Target not found';
  end if;

  if target.workspace_id is distinct from viewer.workspace_id then
    raise exception 'Target belongs to a different workspace';
  end if;

  if action = 'update_role' then
    if new_role is null then
      raise exception 'New role required';
    end if;

    if target.global_role = 'admin' and new_role <> 'admin' then
      select count(*)
      into remaining_admins
      from user_settings
      where workspace_id = viewer.workspace_id
        and global_role = 'admin'
        and is_active = true
        and user_id <> target_user;

      if remaining_admins < 1 then
        raise exception 'Cannot remove the last admin in the workspace';
      end if;
    end if;

    if target_user = viewer.user_id and new_role <> 'admin' then
      raise exception 'Admins cannot demote themselves via this action';
    end if;

    update user_settings
    set global_role = new_role
    where user_id = target_user;
  elsif action = 'deactivate' then
    if target.global_role = 'admin' then
      select count(*)
      into remaining_admins
      from user_settings
      where workspace_id = viewer.workspace_id
        and global_role = 'admin'
        and is_active = true
        and user_id <> target_user;

      if remaining_admins < 1 then
        raise exception 'Cannot deactivate the final admin';
      end if;
    end if;

    update user_settings
    set is_active = false
    where user_id = target_user;
  elsif action = 'reactivate' then
    update user_settings
    set is_active = true
    where user_id = target_user;
  elsif action = 'delete' then
    if target_user = viewer.user_id then
      raise exception 'Admins cannot delete themselves';
    end if;

    if target.global_role = 'admin' then
      select count(*)
      into remaining_admins
      from user_settings
      where workspace_id = viewer.workspace_id
        and global_role = 'admin'
        and is_active = true
        and user_id <> target_user;

      if remaining_admins < 1 then
        raise exception 'Cannot delete the final admin';
      end if;
    end if;

    -- Deleting auth.users cascades to user_settings (ON DELETE CASCADE)
    delete from auth.users where id = target_user;
  else
    raise exception 'Unknown action %', action;
  end if;
end;
$$;

revoke all on function manage_workspace_member(uuid, text, global_role) from public;
grant execute on function manage_workspace_member(uuid, text, global_role) to authenticated;
