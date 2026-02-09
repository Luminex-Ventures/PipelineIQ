-- Add annual_gross_sales_goal column to user_settings
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS annual_gross_sales_goal NUMERIC DEFAULT 0 NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN user_settings.annual_gross_sales_goal IS 'User personal annual gross sales volume goal';
