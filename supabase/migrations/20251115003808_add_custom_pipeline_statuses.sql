/*
  # Add Custom Pipeline Statuses System

  ## Overview
  This migration implements fully customizable pipeline statuses per user/team with:
  - Template-based status configuration
  - User-specific pipeline customization
  - Backward compatibility with existing deals
  - Team-level sharing support

  ## New Tables
  
  ### pipeline_templates
  - `id` (uuid, primary key)
  - `name` (text) - Template display name
  - `description` (text) - Template description
  - `is_system` (boolean) - Whether it's a built-in template
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  
  ### pipeline_statuses
  - `id` (uuid, primary key)
  - `user_id` (uuid, nullable) - Owner of this status set
  - `team_id` (uuid, nullable) - Team-level shared pipeline
  - `template_id` (uuid, nullable) - Source template reference
  - `name` (text) - Status display name
  - `slug` (text) - URL-safe identifier
  - `sort_order` (integer) - Display order
  - `color` (text) - Hex color or color class
  - `is_default` (boolean) - Part of original template
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## Changes
  1. Created pipeline_templates table for template definitions
  2. Created pipeline_statuses table for user/team custom statuses
  3. Added system templates (Basic, Advanced, Buyer/Seller, Minimalist)
  4. Updated deals table to support new status reference
  5. Created migration path for existing deals
  6. Set up RLS policies for secure access

  ## Security
  - RLS enabled on all new tables
  - Users can only see/edit their own statuses
  - Team members can see team-level statuses
  - Admins can manage system templates
*/

-- Create pipeline_templates table
CREATE TABLE IF NOT EXISTS pipeline_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create pipeline_statuses table
CREATE TABLE IF NOT EXISTS pipeline_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  template_id uuid REFERENCES pipeline_templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  color text DEFAULT 'gray',
  is_default boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_user_slug UNIQUE (user_id, slug),
  CONSTRAINT unique_team_slug UNIQUE (team_id, slug),
  CONSTRAINT user_or_team_required CHECK (user_id IS NOT NULL OR team_id IS NOT NULL)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_pipeline_statuses_user_id ON pipeline_statuses(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_statuses_team_id ON pipeline_statuses(team_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_statuses_sort_order ON pipeline_statuses(sort_order);

-- Add new column to deals table for custom status reference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'pipeline_status_id'
  ) THEN
    ALTER TABLE deals ADD COLUMN pipeline_status_id uuid REFERENCES pipeline_statuses(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_deals_pipeline_status_id ON deals(pipeline_status_id);

-- Enable RLS
ALTER TABLE pipeline_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_statuses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pipeline_templates
CREATE POLICY "Anyone can view system templates"
  ON pipeline_templates FOR SELECT
  TO authenticated
  USING (is_system = true);

CREATE POLICY "Admins can manage templates"
  ON pipeline_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = (SELECT auth.uid())
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = (SELECT auth.uid())
      AND global_role = 'admin'
    )
  );

-- RLS Policies for pipeline_statuses
CREATE POLICY "Users can view own statuses"
  ON pipeline_statuses FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR team_id IN (
      SELECT team_id FROM user_teams WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can insert own statuses"
  ON pipeline_statuses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own statuses"
  ON pipeline_statuses FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own statuses"
  ON pipeline_statuses FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Team leads can manage team statuses"
  ON pipeline_statuses FOR ALL
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM user_teams
      WHERE user_id = (SELECT auth.uid()) AND role = 'team_lead'
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM user_teams
      WHERE user_id = (SELECT auth.uid()) AND role = 'team_lead'
    )
  );

-- Add triggers
CREATE TRIGGER update_pipeline_templates_updated_at
  BEFORE UPDATE ON pipeline_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pipeline_statuses_updated_at
  BEFORE UPDATE ON pipeline_statuses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert system templates
INSERT INTO pipeline_templates (name, description, is_system) VALUES
  ('Basic Pipeline', 'Simple 6-stage pipeline ideal for new agents', true),
  ('Advanced Transaction Pipeline', 'Comprehensive 13-stage pipeline covering all transaction phases', true),
  ('Buyer/Seller Split Pipeline', 'Separate workflows for buyer and seller transactions', true),
  ('Minimalist', 'Streamlined 4-stage pipeline for quick deal tracking', true)
ON CONFLICT DO NOTHING;

-- Create function to apply template to user
CREATE OR REPLACE FUNCTION apply_pipeline_template(
  p_user_id uuid,
  p_template_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template_id uuid;
BEGIN
  -- Get template ID
  SELECT id INTO v_template_id
  FROM pipeline_templates
  WHERE name = p_template_name AND is_system = true
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Template not found: %', p_template_name;
  END IF;

  -- Delete existing statuses for user
  DELETE FROM pipeline_statuses WHERE user_id = p_user_id;

  -- Apply template based on name
  IF p_template_name = 'Basic Pipeline' THEN
    INSERT INTO pipeline_statuses (user_id, template_id, name, slug, sort_order, color, is_default)
    VALUES
      (p_user_id, v_template_id, 'New Lead', 'new_lead', 1, 'gray', true),
      (p_user_id, v_template_id, 'Contacted', 'contacted', 2, 'blue', true),
      (p_user_id, v_template_id, 'Showing Scheduled', 'showing_scheduled', 3, 'cyan', true),
      (p_user_id, v_template_id, 'Offer Submitted', 'offer_submitted', 4, 'yellow', true),
      (p_user_id, v_template_id, 'Under Contract', 'under_contract', 5, 'orange', true),
      (p_user_id, v_template_id, 'Closed', 'closed', 6, 'green', true);

  ELSIF p_template_name = 'Advanced Transaction Pipeline' THEN
    INSERT INTO pipeline_statuses (user_id, template_id, name, slug, sort_order, color, is_default)
    VALUES
      (p_user_id, v_template_id, 'New Lead', 'new_lead', 1, 'gray', true),
      (p_user_id, v_template_id, 'Warm Lead', 'warm_lead', 2, 'slate', true),
      (p_user_id, v_template_id, 'Hot Lead', 'hot_lead', 3, 'red', true),
      (p_user_id, v_template_id, 'Showing Scheduled', 'showing_scheduled', 4, 'cyan', true),
      (p_user_id, v_template_id, 'Offer Submitted', 'offer_submitted', 5, 'yellow', true),
      (p_user_id, v_template_id, 'Inspection', 'inspection', 6, 'amber', true),
      (p_user_id, v_template_id, 'Appraisal', 'appraisal', 7, 'lime', true),
      (p_user_id, v_template_id, 'Under Contract', 'under_contract', 8, 'orange', true),
      (p_user_id, v_template_id, 'Financing', 'financing', 9, 'teal', true),
      (p_user_id, v_template_id, 'Title Review', 'title_review', 10, 'indigo', true),
      (p_user_id, v_template_id, 'Clear to Close', 'clear_to_close', 11, 'emerald', true),
      (p_user_id, v_template_id, 'Closed', 'closed', 12, 'green', true),
      (p_user_id, v_template_id, 'Lost', 'lost', 13, 'rose', true);

  ELSIF p_template_name = 'Buyer/Seller Split Pipeline' THEN
    INSERT INTO pipeline_statuses (user_id, template_id, name, slug, sort_order, color, is_default)
    VALUES
      (p_user_id, v_template_id, 'New Buyer Inquiry', 'new_buyer_inquiry', 1, 'blue', true),
      (p_user_id, v_template_id, 'Pre-Approval', 'pre_approval', 2, 'sky', true),
      (p_user_id, v_template_id, 'Home Search', 'home_search', 3, 'cyan', true),
      (p_user_id, v_template_id, 'Tours Scheduled', 'tours_scheduled', 4, 'teal', true),
      (p_user_id, v_template_id, 'Offer In Progress', 'offer_in_progress', 5, 'yellow', true),
      (p_user_id, v_template_id, 'Buyer Under Contract', 'buyer_under_contract', 6, 'amber', true),
      (p_user_id, v_template_id, 'Closed Buyer', 'closed_buyer', 7, 'green', true),
      (p_user_id, v_template_id, 'New Listing Lead', 'new_listing_lead', 8, 'violet', true),
      (p_user_id, v_template_id, 'CMA Complete', 'cma_complete', 9, 'purple', true),
      (p_user_id, v_template_id, 'Listing Signed', 'listing_signed', 10, 'fuchsia', true),
      (p_user_id, v_template_id, 'Active Listing', 'active_listing', 11, 'pink', true),
      (p_user_id, v_template_id, 'Buyer Offer Received', 'buyer_offer_received', 12, 'orange', true),
      (p_user_id, v_template_id, 'Seller Under Contract', 'seller_under_contract', 13, 'lime', true),
      (p_user_id, v_template_id, 'Closed Seller', 'closed_seller', 14, 'emerald', true);

  ELSIF p_template_name = 'Minimalist' THEN
    INSERT INTO pipeline_statuses (user_id, template_id, name, slug, sort_order, color, is_default)
    VALUES
      (p_user_id, v_template_id, 'Lead', 'lead', 1, 'gray', true),
      (p_user_id, v_template_id, 'In Progress', 'in_progress', 2, 'blue', true),
      (p_user_id, v_template_id, 'Pending', 'pending', 3, 'yellow', true),
      (p_user_id, v_template_id, 'Closed', 'closed', 4, 'green', true);
  END IF;
END;
$$;

-- Create function to migrate existing deals to user's pipeline statuses
CREATE OR REPLACE FUNCTION migrate_user_deals_to_pipeline_statuses(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_mapping jsonb;
BEGIN
  -- Build mapping of old status to new pipeline_status_id
  v_status_mapping := jsonb_object_agg(
    ps.slug,
    ps.id
  )
  FROM pipeline_statuses ps
  WHERE ps.user_id = p_user_id;

  -- Update deals with pipeline_status_id based on current status
  UPDATE deals d
  SET pipeline_status_id = (v_status_mapping->>(d.status::text))::uuid
  WHERE d.user_id = p_user_id
    AND d.pipeline_status_id IS NULL
    AND v_status_mapping ? d.status::text;
END;
$$;
