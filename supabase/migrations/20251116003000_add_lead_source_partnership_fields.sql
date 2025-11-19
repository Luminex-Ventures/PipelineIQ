/*
  # Add partnership payout fields to lead_sources

  ## Overview
  Lead sources now support partnership programs (e.g., Zillow Flex, Redfin),
  where the partner takes their fee before the brokerage split. We need schema
  fields to store the payout structure, partner split rate, and any notes.

  ## Changes
  - Add `payout_structure` text column with values `standard` or `partnership`.
    Defaults to `standard` for existing rows.
  - Add optional `partnership_split_rate` numeric column (stored as decimal,
    e.g., 0.35 for 35%).
  - Add optional `partnership_notes` text column for program details.
  - Ensure the new enum-like constraint only allows the supported values.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_sources' AND column_name = 'payout_structure'
  ) THEN
    ALTER TABLE lead_sources
      ADD COLUMN payout_structure text NOT NULL DEFAULT 'standard';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_sources_payout_structure_check'
  ) THEN
    ALTER TABLE lead_sources
      ADD CONSTRAINT lead_sources_payout_structure_check
      CHECK (payout_structure IN ('standard', 'partnership'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_sources' AND column_name = 'partnership_split_rate'
  ) THEN
    ALTER TABLE lead_sources
      ADD COLUMN partnership_split_rate numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_sources' AND column_name = 'partnership_notes'
  ) THEN
    ALTER TABLE lead_sources
      ADD COLUMN partnership_notes text;
  END IF;
END $$;
