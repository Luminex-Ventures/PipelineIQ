/*
  # Make lead_source_id required in deals table

  1. Changes
    - Alter `deals` table to make `lead_source_id` NOT NULL
    - This ensures every deal has a lead source for proper tracking
  
  2. Notes
    - Any existing deals without a lead source will need to be updated first
    - This change enforces better data quality and analytics
*/

-- First, let's check if there are any deals without a lead source and handle them
-- We'll create a default "Unknown" lead source for any existing deals without one

DO $$
DECLARE
  default_source_id UUID;
  user_record RECORD;
BEGIN
  -- For each user who has deals without a lead source
  FOR user_record IN 
    SELECT DISTINCT user_id 
    FROM deals 
    WHERE lead_source_id IS NULL
  LOOP
    -- Check if they have an "Unknown" lead source already
    SELECT id INTO default_source_id
    FROM lead_sources
    WHERE user_id = user_record.user_id
    AND LOWER(name) = 'unknown'
    LIMIT 1;

    -- If not, create one
    IF default_source_id IS NULL THEN
      INSERT INTO lead_sources (user_id, name, brokerage_split_rate)
      VALUES (user_record.user_id, 'Unknown', 0.2)
      RETURNING id INTO default_source_id;
    END IF;

    -- Update all deals without a lead source for this user
    UPDATE deals
    SET lead_source_id = default_source_id
    WHERE user_id = user_record.user_id
    AND lead_source_id IS NULL;
  END LOOP;
END $$;

-- Now make the column NOT NULL
ALTER TABLE deals 
ALTER COLUMN lead_source_id SET NOT NULL;
