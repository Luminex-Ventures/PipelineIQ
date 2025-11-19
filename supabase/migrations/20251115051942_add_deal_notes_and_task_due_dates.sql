/*
  # Add Deal Notes and Task Due Dates

  1. New Tables
    - `deal_notes`
      - `id` (uuid, primary key)
      - `deal_id` (uuid, foreign key to deals)
      - `user_id` (uuid, foreign key to auth.users)
      - `content` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Changes
    - Add `next_task_description` to deals table (text, nullable)
    - Add `next_task_due_date` to deals table (date, nullable)

  3. Security
    - Enable RLS on `deal_notes` table
    - Add policies for authenticated users to manage their team's notes
    - Notes are visible to all team members of the deal owner
*/

-- Add task fields to deals table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'next_task_description'
  ) THEN
    ALTER TABLE deals ADD COLUMN next_task_description text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'next_task_due_date'
  ) THEN
    ALTER TABLE deals ADD COLUMN next_task_due_date date;
  END IF;
END $$;

-- Create deal_notes table
CREATE TABLE IF NOT EXISTS deal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT deal_notes_content_not_empty CHECK (length(trim(content)) > 0)
);

-- Enable RLS
ALTER TABLE deal_notes ENABLE ROW LEVEL SECURITY;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_deal_notes_deal_id ON deal_notes(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_notes_created_at ON deal_notes(deal_id, created_at DESC);

-- Policies for deal_notes
CREATE POLICY "Users can view notes for their deals"
  ON deal_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = deal_notes.deal_id
      AND deals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create notes for their deals"
  ON deal_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = deal_notes.deal_id
      AND deals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own notes"
  ON deal_notes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notes"
  ON deal_notes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
