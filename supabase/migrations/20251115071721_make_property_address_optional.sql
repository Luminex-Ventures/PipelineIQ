/*
  # Make property_address optional in deals table

  1. Changes
    - Alter `deals` table to make `property_address` nullable
    - This allows importing deals without a property address specified
  
  2. Notes
    - Property address becomes optional for flexibility in data entry
    - Existing data is preserved
*/

ALTER TABLE deals 
ALTER COLUMN property_address DROP NOT NULL;
