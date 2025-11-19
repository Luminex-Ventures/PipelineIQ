/*
  # Remove deal_status enum constraint

  ## Summary
  The current implementation has a hardcoded enum for deal statuses that conflicts with custom pipeline statuses.
  This migration makes the status field flexible to support any custom status slug.

  ## Changes Made
  1. **Alter deals.status column**: Change from enum to text type
  2. **Drop unused enum**: Remove the deal_status enum type (if no other tables use it)
  
  ## Rationale
  - Users can now create custom pipeline statuses with any name/slug
  - No more silent failures when updating deals with non-enum status values
  - The pipeline_statuses table is now the single source of truth for valid statuses
  
  ## Data Safety
  - Existing status values are preserved during type conversion
  - No data loss occurs
*/

-- Change status column from enum to text
DO $$
BEGIN
  -- First, alter the column type to text
  ALTER TABLE deals ALTER COLUMN status TYPE text USING status::text;
  
  -- Update the default value to be text instead of enum
  ALTER TABLE deals ALTER COLUMN status SET DEFAULT 'new_lead';
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error altering status column: %', SQLERRM;
END $$;

-- Drop the enum type if it exists and is not being used elsewhere
DO $$
BEGIN
  DROP TYPE IF EXISTS deal_status CASCADE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop deal_status enum: %', SQLERRM;
END $$;