-- Backfill team_id for lead_sources and pipeline_statuses
-- Strategy:
-- 1) If a user has exactly one team, assign that team to all their lead_sources and pipeline_statuses without a team.
-- 2) For remaining records without team_id, optionally set a default team manually after running.

-- Step 1: assign team when user has exactly one team membership
WITH single_team_users AS (
  SELECT ut.user_id, ut.team_id
  FROM user_teams ut
  GROUP BY ut.user_id, ut.team_id
  HAVING COUNT(*) = 1
)
UPDATE lead_sources ls
SET team_id = stu.team_id
FROM single_team_users stu
WHERE ls.team_id IS NULL
  AND ls.user_id = stu.user_id;

WITH single_team_users AS (
  SELECT ut.user_id, ut.team_id
  FROM user_teams ut
  GROUP BY ut.user_id, ut.team_id
  HAVING COUNT(*) = 1
)
UPDATE pipeline_statuses ps
SET team_id = stu.team_id
FROM single_team_users stu
WHERE ps.team_id IS NULL
  AND ps.user_id = stu.user_id;

-- Report counts remaining without team assignment so we can handle manually if needed
DO $$
DECLARE
  remaining_sources bigint;
  remaining_statuses bigint;
BEGIN
  SELECT COUNT(*) INTO remaining_sources FROM lead_sources WHERE team_id IS NULL;
  SELECT COUNT(*) INTO remaining_statuses FROM pipeline_statuses WHERE team_id IS NULL;

  RAISE NOTICE 'Remaining lead_sources without team: %', remaining_sources;
  RAISE NOTICE 'Remaining pipeline_statuses without team: %', remaining_statuses;
END $$;
