/*
  # Ensure team leads can read team deals

  Some environments still lacked an explicit policy granting team leads
  SELECT access to deals owned by users on their team. This migration adds
  a dedicated policy to guarantee parity with the intended access rules.
*/

-- Drop any previous version of this policy to avoid duplicates
drop policy if exists "Team lead can view team deals" on deals;

-- Explicit policy: team leads can read deals owned by members of their teams
create policy "Team lead can view team deals"
  on deals for select
  to authenticated
  using (
    exists (
      select 1
      from user_teams me
      join user_teams them on them.team_id = me.team_id
      where me.user_id = auth.uid()
        and me.role = 'team_lead'
        and them.user_id = deals.user_id
    )
  );
