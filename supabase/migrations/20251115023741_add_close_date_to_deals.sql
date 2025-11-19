/*
  # Add Close Date to Deals

  1. Changes
    - Add `close_date` column to `deals` table
    - This represents the scheduled closing date for the deal
    - Column is nullable (not all deals will have a close date scheduled)
    - Uses date type (without time component)

  2. Notes
    - This is different from `closed_at` which is when the deal status changed to closed
    - `close_date` is the planned/scheduled closing date
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'close_date'
  ) THEN
    ALTER TABLE deals ADD COLUMN close_date date;
  END IF;
END $$;
