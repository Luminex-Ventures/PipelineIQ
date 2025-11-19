/*
  # Add Brokerage Split Rate to Lead Sources

  ## Overview
  This migration adds a brokerage_split_rate column to the lead_sources table.
  Different lead sources may have different brokerage split agreements (e.g., Zillow might be 50%, SOI might be 30%).

  ## Changes
  
  ### 1. Schema Changes
  - Add `brokerage_split_rate` column to `lead_sources` table
    - Type: numeric (percentage as decimal, e.g., 0.5 for 50%)
    - Default: 0.2 (20% split, 80/20 arrangement)
    - Not null

  ## Notes
  - This allows agents to track different brokerage splits per lead source
  - When creating a deal, the split rate from the lead source can be auto-populated
*/

-- Add brokerage_split_rate column to lead_sources
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_sources' AND column_name = 'brokerage_split_rate'
  ) THEN
    ALTER TABLE lead_sources ADD COLUMN brokerage_split_rate numeric DEFAULT 0.2 NOT NULL;
  END IF;
END $$;
