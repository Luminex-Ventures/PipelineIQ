-- Create user_status_color_overrides table for persisting personal color preferences
CREATE TABLE IF NOT EXISTS user_status_color_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pipeline_status_id UUID NOT NULL REFERENCES pipeline_statuses(id) ON DELETE CASCADE,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, pipeline_status_id)
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_user_status_color_overrides_user_id 
  ON user_status_color_overrides(user_id);

-- Enable RLS
ALTER TABLE user_status_color_overrides ENABLE ROW LEVEL SECURITY;

-- Users can only read their own overrides
CREATE POLICY "Users can view own color overrides"
  ON user_status_color_overrides
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own overrides
CREATE POLICY "Users can insert own color overrides"
  ON user_status_color_overrides
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own overrides
CREATE POLICY "Users can update own color overrides"
  ON user_status_color_overrides
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own overrides
CREATE POLICY "Users can delete own color overrides"
  ON user_status_color_overrides
  FOR DELETE
  USING (user_id = auth.uid());

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_user_status_color_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_status_color_overrides_updated_at
  BEFORE UPDATE ON user_status_color_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_user_status_color_overrides_updated_at();
