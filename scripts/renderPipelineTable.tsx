import React from 'react';
import { renderToString } from 'react-dom/server';
import PipelineTable from '../src/components/PipelineTable';
import type { Database } from '../src/lib/database.types';

const now = new Date().toISOString();

type Deal = Database['public']['Tables']['deals']['Row'] & {
  lead_sources?: Database['public']['Tables']['lead_sources']['Row'] | null;
  pipeline_statuses?: Database['public']['Tables']['pipeline_statuses']['Row'] | null;
};

type PipelineStatus = Database['public']['Tables']['pipeline_statuses']['Row'];

const mockDeal: Deal = {
  id: '1',
  user_id: 'u1',
  client_name: 'Alice',
  client_email: 'alice@example.com',
  client_phone: '123',
  property_address: '123 Main St',
  city: 'SF',
  state: 'CA',
  zip: '94105',
  deal_type: 'buyer',
  pipeline_status_id: 'status1',
  status: 'new',
  lead_source_id: null,
  lead_source_name: 'Zillow',
  expected_sale_price: 500000,
  actual_sale_price: null,
  gross_commission_rate: 0.03,
  brokerage_split_rate: 0.2,
  referral_out_rate: null,
  referral_in_rate: null,
  transaction_fee: 0,
  stage_entered_at: now,
  close_date: null,
  closed_at: null,
  next_task_description: null,
  next_task_due_date: null,
  created_at: now,
  updated_at: now,
  lead_sources: null,
  pipeline_statuses: null
};

const statuses: PipelineStatus[] = [
  { id: 'status1', user_id: 'u1', name: 'Prospecting', slug: 'prospecting', sort_order: 1, color: 'blue', created_at: now, updated_at: now, description: null, is_default: false }
];

const html = renderToString(
  <PipelineTable
    deals={[mockDeal]}
    statuses={statuses}
    onDealClick={() => {}}
    calculateNetCommission={() => 1000}
    getDaysInStage={() => 1}
  />
);

console.log('Rendered length:', html.length);
