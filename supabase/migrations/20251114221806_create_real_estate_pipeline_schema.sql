/*
  # Real Estate Pipeline Management Schema

  ## Overview
  This migration creates the complete database schema for a real estate pipeline management system
  where agents can track deals, lead sources, commissions, and yearly performance.

  ## Tables Created

  ### 1. lead_sources
  Tracks where leads come from (Zillow, referrals, open houses, etc.)
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `name` (text) - e.g., "Zillow", "Past Client Referral"
  - `category` (text) - e.g., "online", "referral", "event", "farming"
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. deals
  Core table tracking every real estate deal through the pipeline
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `client_name` (text)
  - `client_phone` (text, nullable)
  - `client_email` (text, nullable)
  - `property_address` (text)
  - `city` (text, nullable)
  - `state` (text, nullable)
  - `zip` (text, nullable)
  - `deal_type` (enum: buyer, seller, buyer_and_seller)
  - `lead_source_id` (uuid, references lead_sources)
  - `status` (enum: new_lead, contacted, showing_scheduled, offer_submitted, under_contract, pending, closed, dead)
  - `stage_entered_at` (timestamptz) - when deal entered current stage
  - `expected_sale_price` (numeric)
  - `actual_sale_price` (numeric, nullable)
  - `gross_commission_rate` (numeric) - percentage as decimal (e.g., 0.03 for 3%)
  - `brokerage_split_rate` (numeric) - percentage broker keeps (e.g., 0.2 for 80/20 split)
  - `referral_out_rate` (numeric, nullable)
  - `referral_in_rate` (numeric, nullable)
  - `transaction_fee` (numeric, default 0)
  - `closed_at` (timestamptz, nullable)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 3. tasks
  Follow-up tasks and deadlines associated with deals
  - `id` (uuid, primary key)
  - `deal_id` (uuid, references deals)
  - `user_id` (uuid, references auth.users)
  - `title` (text)
  - `description` (text, nullable)
  - `due_date` (date, nullable)
  - `completed` (boolean, default false)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 4. user_settings
  User-specific settings for goals and defaults
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users, unique)
  - `annual_gci_goal` (numeric, default 0)
  - `default_tax_rate` (numeric, default 0.25) - 25% default
  - `default_brokerage_split_rate` (numeric, default 0.2) - 20% to broker, 80% to agent
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Users can only access their own data
  - Policies for SELECT, INSERT, UPDATE, DELETE operations

  ## Indexes
  - Performance indexes on foreign keys and frequently queried columns
  - Index on deals(user_id, status) for pipeline queries
  - Index on deals(user_id, closed_at) for analytics queries
*/

-- Create custom types
CREATE TYPE deal_type AS ENUM ('buyer', 'seller', 'buyer_and_seller');
CREATE TYPE deal_status AS ENUM ('new_lead', 'contacted', 'showing_scheduled', 'offer_submitted', 'under_contract', 'pending', 'closed', 'dead');

-- Create lead_sources table
CREATE TABLE IF NOT EXISTS lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  category text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create deals table
CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_name text NOT NULL,
  client_phone text,
  client_email text,
  property_address text NOT NULL,
  city text,
  state text,
  zip text,
  deal_type deal_type NOT NULL,
  lead_source_id uuid REFERENCES lead_sources(id) ON DELETE SET NULL,
  status deal_status DEFAULT 'new_lead' NOT NULL,
  stage_entered_at timestamptz DEFAULT now() NOT NULL,
  expected_sale_price numeric NOT NULL,
  actual_sale_price numeric,
  gross_commission_rate numeric NOT NULL DEFAULT 0.03,
  brokerage_split_rate numeric NOT NULL DEFAULT 0.2,
  referral_out_rate numeric,
  referral_in_rate numeric,
  transaction_fee numeric DEFAULT 0 NOT NULL,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  due_date date,
  completed boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  annual_gci_goal numeric DEFAULT 0 NOT NULL,
  default_tax_rate numeric DEFAULT 0.25 NOT NULL,
  default_brokerage_split_rate numeric DEFAULT 0.2 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lead_sources_user_id ON lead_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_deals_user_id ON deals(user_id);
CREATE INDEX IF NOT EXISTS idx_deals_user_status ON deals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_deals_user_closed ON deals(user_id, closed_at) WHERE closed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_lead_source ON deals(lead_source_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deal_id ON tasks(deal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Enable Row Level Security
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lead_sources
CREATE POLICY "Users can view own lead sources"
  ON lead_sources FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own lead sources"
  ON lead_sources FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lead sources"
  ON lead_sources FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own lead sources"
  ON lead_sources FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for deals
CREATE POLICY "Users can view own deals"
  ON deals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own deals"
  ON deals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own deals"
  ON deals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own deals"
  ON deals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for tasks
CREATE POLICY "Users can view own tasks"
  ON tasks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tasks"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks"
  ON tasks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tasks"
  ON tasks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for user_settings
CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_lead_sources_updated_at BEFORE UPDATE ON lead_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
