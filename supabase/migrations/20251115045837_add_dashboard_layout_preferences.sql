/*
  # Dashboard Layout Preferences

  1. New Tables
    - `dashboard_layouts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `widget_order` (jsonb array of widget identifiers)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
  
  2. Security
    - Enable RLS on `dashboard_layouts` table
    - Add policy for users to read their own layout
    - Add policy for users to update their own layout
*/

CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  widget_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE dashboard_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dashboard layout"
  ON dashboard_layouts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dashboard layout"
  ON dashboard_layouts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dashboard layout"
  ON dashboard_layouts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_user_id ON dashboard_layouts(user_id);
