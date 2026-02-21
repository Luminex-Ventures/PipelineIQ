/*
  Fix lead_sources table: add missing columns (workspace_id, tiered_splits,
  custom_deductions) and update the payout_structure check constraint to
  accept 'tiered' in addition to 'standard' and 'partnership'.

  These columns are referenced by LeadSourcesSettings.tsx but were never
  added via a migration, causing all inserts to fail.
*/

DO $$
BEGIN
  -- Add workspace_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_sources' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE lead_sources
      ADD COLUMN workspace_id uuid REFERENCES workspace_settings(id) ON DELETE SET NULL;
  END IF;

  -- Add tiered_splits JSONB column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_sources' AND column_name = 'tiered_splits'
  ) THEN
    ALTER TABLE lead_sources
      ADD COLUMN tiered_splits jsonb DEFAULT NULL;
  END IF;

  -- Add custom_deductions JSONB column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_sources' AND column_name = 'custom_deductions'
  ) THEN
    ALTER TABLE lead_sources
      ADD COLUMN custom_deductions jsonb DEFAULT NULL;
  END IF;

  -- Update payout_structure check constraint to include 'tiered'
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_sources_payout_structure_check'
  ) THEN
    ALTER TABLE lead_sources
      DROP CONSTRAINT lead_sources_payout_structure_check;
  END IF;

  ALTER TABLE lead_sources
    ADD CONSTRAINT lead_sources_payout_structure_check
    CHECK (payout_structure IN ('standard', 'partnership', 'tiered'));
END $$;
