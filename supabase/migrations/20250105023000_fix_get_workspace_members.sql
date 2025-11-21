-- Replace get_workspace_members so column types/order match exactly
DROP FUNCTION IF EXISTS public.get_workspace_members(uuid);
DROP FUNCTION IF EXISTS get_workspace_members(uuid);

CREATE OR REPLACE FUNCTION public.get_workspace_members(p_workspace_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  global_role text,
  team_role text,
  team_id uuid,
  is_active boolean,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
declare
  viewer record;
begin
  select us.user_id, us.workspace_id, us.global_role
  into viewer
  from public.user_settings us
  where us.user_id = auth.uid();

  if viewer.user_id is null then
    raise exception 'Not authorized';
  end if;
  if viewer.workspace_id is distinct from p_workspace_id then
    raise exception 'Different workspace';
  end if;
  if viewer.global_role <> 'admin' then
    raise exception 'Admin access required';
  end if;

  return query
    select
      us.user_id,
      au.email::text,
      coalesce(au.raw_user_meta_data->>'name', au.email)::text as full_name,
      us.global_role::text,
      ut.role::text,
      ut.team_id,
      coalesce(us.is_active, true) as is_active,
      au.last_sign_in_at
    from public.user_settings us
    left join public.user_teams ut on ut.user_id = us.user_id
    left join auth.users au on au.id = us.user_id
    where us.workspace_id = p_workspace_id
    order by au.created_at desc;
end;
$$;

REVOKE ALL ON FUNCTION public.get_workspace_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_members(uuid) TO authenticated;
