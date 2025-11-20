-- Add sort_order column to lead_sources for manual ordering
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'lead_sources'
      AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE lead_sources ADD COLUMN sort_order integer;
  END IF;
END $$;

-- Backfill sort_order per user if null
WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, name) AS row_num
  FROM lead_sources
)
UPDATE lead_sources AS ls
SET sort_order = ordered.row_num
FROM ordered
WHERE ls.id = ordered.id
  AND ls.sort_order IS NULL;

ALTER TABLE lead_sources
  ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE lead_sources
  ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_sources_user_sort_order
  ON lead_sources(user_id, sort_order);
