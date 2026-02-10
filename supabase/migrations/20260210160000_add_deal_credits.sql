/*
  Add deal_credits JSONB column to deals table.
  Stores an array of credit objects (bonuses, referral credits, etc.)
  that are added back to the agent's net commission.
  
  Structure mirrors deal_deductions:
  [{ "id": "...", "name": "Referral Bonus", "type": "flat", "value": 500 }]
*/

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS deal_credits JSONB DEFAULT NULL;

COMMENT ON COLUMN deals.deal_credits IS 'Array of credit objects (bonuses, referral credits) added to net commission';
