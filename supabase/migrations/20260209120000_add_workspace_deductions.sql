-- Create workspace_deductions table for default fees set by admins
CREATE TABLE IF NOT EXISTS workspace_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspace_settings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percentage', 'flat')),
  value NUMERIC NOT NULL DEFAULT 0,
  apply_order INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for faster lookups by workspace
CREATE INDEX IF NOT EXISTS idx_workspace_deductions_workspace_id ON workspace_deductions(workspace_id);

-- Add deal_deductions column to deals table for per-deal overrides
ALTER TABLE deals 
ADD COLUMN IF NOT EXISTS deal_deductions JSONB DEFAULT NULL;

-- Enable RLS
ALTER TABLE workspace_deductions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workspace_deductions

-- Anyone in the workspace can view deductions
CREATE POLICY "Users can view workspace deductions"
  ON workspace_deductions
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT us.workspace_id FROM user_settings us WHERE us.user_id = auth.uid()
    )
  );

-- Only admins and sales managers can insert
CREATE POLICY "Admins can insert workspace deductions"
  ON workspace_deductions
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT us.workspace_id 
      FROM user_settings us 
      WHERE us.user_id = auth.uid() 
        AND us.global_role IN ('admin', 'sales_manager')
    )
  );

-- Only admins and sales managers can update
CREATE POLICY "Admins can update workspace deductions"
  ON workspace_deductions
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT us.workspace_id 
      FROM user_settings us 
      WHERE us.user_id = auth.uid() 
        AND us.global_role IN ('admin', 'sales_manager')
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT us.workspace_id 
      FROM user_settings us 
      WHERE us.user_id = auth.uid() 
        AND us.global_role IN ('admin', 'sales_manager')
    )
  );

-- Only admins and sales managers can delete
CREATE POLICY "Admins can delete workspace deductions"
  ON workspace_deductions
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT us.workspace_id 
      FROM user_settings us 
      WHERE us.user_id = auth.uid() 
        AND us.global_role IN ('admin', 'sales_manager')
    )
  );

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_workspace_deductions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_workspace_deductions_updated_at ON workspace_deductions;
CREATE TRIGGER trigger_update_workspace_deductions_updated_at
  BEFORE UPDATE ON workspace_deductions
  FOR EACH ROW
  EXECUTE FUNCTION update_workspace_deductions_updated_at();
