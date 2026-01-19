import type { DealStatus } from '../lib/database.types';

export const STATUS_LABELS: Record<DealStatus, string> = {
  new: 'New',
  in_progress: 'In Progress',
  closed: 'Closed',
  dead: 'Lost',
  new_lead: 'New Lead',
  contacted: 'Contacted',
  showing_scheduled: 'Showing Scheduled',
  offer_submitted: 'Offer Submitted',
  under_contract: 'Under Contract',
  pending: 'Pending'
};
