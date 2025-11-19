/*
  # Update Pipeline Status Colors

  Updates the colors for specific pipeline statuses to better match the Apple-inspired theme:
  - "In Progress" statuses: Changed to teal/cyan for active work indication
  - "Under Contract" statuses: Changed to blue/purple for commitment phase
  
  These colors align better with the application's primary blue accent color (rgb(0,122,255))
  and create a more cohesive visual experience.
*/

-- Update "In Progress" status color to teal (active/working state)
UPDATE pipeline_statuses 
SET color = 'teal' 
WHERE slug = 'in_progress' OR name ILIKE '%in progress%';

-- Update "Under Contract" status color to purple (commitment state)
UPDATE pipeline_statuses 
SET color = 'purple' 
WHERE slug = 'under_contract' 
   OR slug = 'buyer_under_contract' 
   OR slug = 'seller_under_contract'
   OR name ILIKE '%under contract%';

-- Update "Offer In Progress" to match In Progress color
UPDATE pipeline_statuses 
SET color = 'teal' 
WHERE slug = 'offer_in_progress' OR name ILIKE '%offer in progress%';
