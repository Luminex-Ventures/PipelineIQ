/*
  Add additional_contacts JSONB column to deals table.
  Stores an array of contact objects (spouse, co-buyer, attorney, lender, etc.)
  associated with the deal.
  
  Structure:
  [{ "id": "...", "name": "Jane Doe", "email": "jane@example.com", "phone": "555-1234", "relationship": "Spouse" }]
*/

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS additional_contacts JSONB DEFAULT NULL;

COMMENT ON COLUMN deals.additional_contacts IS 'Array of additional contact objects (spouse, co-buyer, attorney, etc.) on the deal';
