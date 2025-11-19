/*
  # Add Renter and Landlord Deal Types

  ## Overview
  This migration adds 'renter' and 'landlord' as valid deal types to support rental transactions
  in addition to the existing buyer/seller types.

  ## Changes
  
  ### 1. Schema Changes
  - Add 'renter' and 'landlord' to the deal_type enum
  
  ## Notes
  - Agents can now track rental deals alongside sales
  - Existing deals remain unchanged (buyer, seller, buyer_and_seller)
*/

-- Add new values to the deal_type enum
ALTER TYPE deal_type ADD VALUE IF NOT EXISTS 'renter';
ALTER TYPE deal_type ADD VALUE IF NOT EXISTS 'landlord';
