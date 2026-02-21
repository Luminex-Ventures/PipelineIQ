/*
  # Marketing: Add Zillow, Realtor.com, and other real estate platforms

  - Add new values to marketing_integration_provider enum.
  - Add matching rows to marketing_channels so allocation UI shows them.
*/

-- Add enum values (one at a time for compatibility)
DO $$ BEGIN
  ALTER TYPE marketing_integration_provider ADD VALUE 'zillow';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE marketing_integration_provider ADD VALUE 'realtor_com';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE marketing_integration_provider ADD VALUE 'homes_com';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE marketing_integration_provider ADD VALUE 'redfin';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add channels so they appear in allocation (slug must match provider for connection check)
INSERT INTO marketing_channels (slug, name) VALUES
  ('zillow', 'Zillow'),
  ('realtor_com', 'Realtor.com'),
  ('homes_com', 'Homes.com'),
  ('redfin', 'Redfin')
ON CONFLICT (slug) DO NOTHING;
