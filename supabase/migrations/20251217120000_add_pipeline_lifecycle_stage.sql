/*
  # Add lifecycle stage to pipeline statuses

  ## Summary
  Adds a required lifecycle_stage column to pipeline_statuses so every custom stage
  is mapped to one of four canonical statuses (new, in_progress, closed, dead).
  Backfills existing data, enforces a check constraint, refreshes template inserts,
  and realigns deals to the lifecycle stage of their assigned pipeline status.
*/

-- 1) Add column + constraint
ALTER TABLE pipeline_statuses
  ADD COLUMN IF NOT EXISTS lifecycle_stage text DEFAULT 'in_progress';

ALTER TABLE pipeline_statuses
  DROP CONSTRAINT IF EXISTS pipeline_statuses_lifecycle_stage_check;

ALTER TABLE pipeline_statuses
  ADD CONSTRAINT pipeline_statuses_lifecycle_stage_check
  CHECK (lifecycle_stage IN ('new', 'in_progress', 'closed', 'dead'));

-- 2) Backfill existing statuses using slug/name hints
UPDATE pipeline_statuses
SET lifecycle_stage = CASE
  WHEN lower(slug) IN ('closed', 'closed_won', 'close') THEN 'closed'
  WHEN lower(slug) IN ('dead', 'lost', 'archived', 'canceled', 'cancelled') THEN 'dead'
  WHEN lower(slug) IN ('new', 'new_lead', 'lead') THEN 'new'
  ELSE 'in_progress'
END
WHERE lifecycle_stage IS NULL;

ALTER TABLE pipeline_statuses
  ALTER COLUMN lifecycle_stage SET NOT NULL,
  ALTER COLUMN lifecycle_stage SET DEFAULT 'in_progress';

-- 3) Refresh template application to set lifecycle_stage
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
    INSERT INTO pipeline_statuses (user_id, template_id, name, slug, sort_order, color, is_default, lifecycle_stage)
    VALUES
      (p_user_id, v_template_id, 'New Lead', 'new_lead', 1, 'gray', true, 'new'),
      (p_user_id, v_template_id, 'Contacted', 'contacted', 2, 'blue', true, 'in_progress'),
      (p_user_id, v_template_id, 'Showing Scheduled', 'showing_scheduled', 3, 'cyan', true, 'in_progress'),
      (p_user_id, v_template_id, 'Offer Submitted', 'offer_submitted', 4, 'yellow', true, 'in_progress'),
      (p_user_id, v_template_id, 'Under Contract', 'under_contract', 5, 'orange', true, 'in_progress'),
      (p_user_id, v_template_id, 'Closed', 'closed', 6, 'green', true, 'closed');

  ELSIF p_template_name = 'Advanced Transaction Pipeline' THEN
    INSERT INTO pipeline_statuses (user_id, template_id, name, slug, sort_order, color, is_default, lifecycle_stage)
    VALUES
      (p_user_id, v_template_id, 'New Lead', 'new_lead', 1, 'gray', true, 'new'),
      (p_user_id, v_template_id, 'Warm Lead', 'warm_lead', 2, 'slate', true, 'new'),
      (p_user_id, v_template_id, 'Hot Lead', 'hot_lead', 3, 'red', true, 'new'),
      (p_user_id, v_template_id, 'Showing Scheduled', 'showing_scheduled', 4, 'cyan', true, 'in_progress'),
      (p_user_id, v_template_id, 'Offer Submitted', 'offer_submitted', 5, 'yellow', true, 'in_progress'),
      (p_user_id, v_template_id, 'Inspection', 'inspection', 6, 'amber', true, 'in_progress'),
      (p_user_id, v_template_id, 'Appraisal', 'appraisal', 7, 'lime', true, 'in_progress'),
      (p_user_id, v_template_id, 'Under Contract', 'under_contract', 8, 'orange', true, 'in_progress'),
      (p_user_id, v_template_id, 'Financing', 'financing', 9, 'teal', true, 'in_progress'),
      (p_user_id, v_template_id, 'Title Review', 'title_review', 10, 'indigo', true, 'in_progress'),
      (p_user_id, v_template_id, 'Clear to Close', 'clear_to_close', 11, 'emerald', true, 'in_progress'),
      (p_user_id, v_template_id, 'Closed', 'closed', 12, 'green', true, 'closed'),
      (p_user_id, v_template_id, 'Lost', 'lost', 13, 'rose', true, 'dead');

  ELSIF p_template_name = 'Buyer/Seller Split Pipeline' THEN
    INSERT INTO pipeline_statuses (user_id, template_id, name, slug, sort_order, color, is_default, lifecycle_stage)
    VALUES
      (p_user_id, v_template_id, 'Lead', 'lead', 1, 'gray', true, 'new'),
      (p_user_id, v_template_id, 'Buyer Under Contract', 'buyer_under_contract', 2, 'blue', true, 'in_progress'),
      (p_user_id, v_template_id, 'Seller Under Contract', 'seller_under_contract', 3, 'amber', true, 'in_progress'),
      (p_user_id, v_template_id, 'Closed', 'closed', 4, 'green', true, 'closed'),
      (p_user_id, v_template_id, 'Lost', 'lost', 5, 'rose', true, 'dead');

  ELSIF p_template_name = 'Minimalist' THEN
    INSERT INTO pipeline_statuses (user_id, template_id, name, slug, sort_order, color, is_default, lifecycle_stage)
    VALUES
      (p_user_id, v_template_id, 'Lead', 'lead', 1, 'gray', true, 'new'),
      (p_user_id, v_template_id, 'In Progress', 'in_progress', 2, 'blue', true, 'in_progress'),
      (p_user_id, v_template_id, 'Pending', 'pending', 3, 'yellow', true, 'in_progress'),
      (p_user_id, v_template_id, 'Closed', 'closed', 4, 'green', true, 'closed');
  END IF;
END;
$$;

-- 4) Keep deals and statuses in sync on migration runs
CREATE OR REPLACE FUNCTION migrate_user_deals_to_pipeline_statuses(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update deals that already have a pipeline_status_id to use the lifecycle stage
  UPDATE deals d
  SET status = ps.lifecycle_stage,
      closed_at = CASE WHEN ps.lifecycle_stage = 'closed' AND d.closed_at IS NULL THEN now() ELSE d.closed_at END
  FROM pipeline_statuses ps
  WHERE d.pipeline_status_id = ps.id
    AND d.user_id = p_user_id
    AND d.status IS DISTINCT FROM ps.lifecycle_stage;

  -- Map deals missing pipeline_status_id using slug or lifecycle_stage matches
  UPDATE deals d
  SET pipeline_status_id = ps.id,
      status = ps.lifecycle_stage,
      closed_at = CASE WHEN ps.lifecycle_stage = 'closed' AND d.closed_at IS NULL THEN now() ELSE d.closed_at END
  FROM pipeline_statuses ps
  WHERE ps.user_id = p_user_id
    AND d.user_id = p_user_id
    AND d.pipeline_status_id IS NULL
    AND (
      lower(d.status) = lower(ps.slug)
      OR lower(d.status) = ps.lifecycle_stage
    );
END;
$$;
