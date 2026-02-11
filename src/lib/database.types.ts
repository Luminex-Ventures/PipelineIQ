export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type DealType = 'buyer' | 'seller' | 'buyer_and_seller' | 'renter' | 'landlord';
export type DealStatus = 'new' | 'in_progress' | 'closed' | 'dead' | 'new_lead' | 'contacted' | 'showing_scheduled' | 'offer_submitted' | 'under_contract' | 'pending';
export type GlobalRole = 'agent' | 'team_lead' | 'sales_manager' | 'admin';
export type TeamRole = 'agent' | 'team_lead';

// Tiered split configuration for lead sources (e.g., Zillow varying by deal amount)
export interface TieredSplit {
  id: string;
  min_amount: number;       // Minimum deal amount for this tier (inclusive)
  max_amount: number | null; // Maximum deal amount (null = no upper limit)
  split_rate: number;       // Split rate as decimal (e.g., 0.35 for 35%)
}

// Custom deductions for lead sources (e.g., admin fees, E&O insurance)
export interface CustomDeduction {
  id: string;
  name: string;             // e.g., "Admin Fee", "E&O Insurance", "Desk Fee"
  type: 'percentage' | 'flat'; // Percentage of commission or flat dollar amount
  value: number;            // The percentage (as decimal) or dollar amount
  apply_order: number;      // Order in which deductions are applied (lower = first)
}

// Percentage basis: which dollar amount the % is applied against
//   'gross'     = Gross Commission (sale × rate) — counts toward GCI
//   'total_gci' = Total GCI (gross ± GCI items) — does NOT count toward GCI
//   'net'       = Net to Agent — does NOT count toward GCI
export type PercentBasis = 'gross' | 'total_gci' | 'net';

// Deal-level deduction override (allows agents to waive, reduce, or add fees)
export interface DealDeduction {
  id: string;
  deduction_id: string;     // References the workspace default deduction ID (or 'custom' for deal-specific)
  name: string;             // Display name
  type: 'percentage' | 'flat';
  value: number;            // The actual value for this deal (can be modified from default)
  apply_order: number;
  is_waived: boolean;       // If true, this deduction is skipped for this deal
  include_in_gci?: boolean; // If true (flat fees only), factored into reported GCI
  percent_of?: PercentBasis; // For percentage type: which base to apply against (default: 'gross')
}

// Additional contact on a deal (spouse, co-buyer, attorney, lender, etc.)
export interface AdditionalContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  relationship: string;   // e.g., "Spouse", "Co-Buyer", "Attorney", "Lender"
}

// Deal-level credit (bonus, referral credit, etc.)
export interface DealCredit {
  id: string;
  name: string;             // Display name (e.g., "Referral Bonus", "Volume Credit")
  type: 'percentage' | 'flat';
  value: number;            // The dollar amount or percentage
  include_in_gci?: boolean; // If true (flat credits only), factored into reported GCI
  percent_of?: PercentBasis; // For percentage type: which base to apply against (default: 'gross')
}

export interface Database {
  public: {
    Tables: {
      lead_sources: {
        Row: {
          id: string;
          user_id: string;
          team_id: string | null;
          name: string;
          category: string | null;
          sort_order: number;
          brokerage_split_rate: number;
          payout_structure: 'standard' | 'partnership' | 'tiered';
          partnership_split_rate: number | null;
          partnership_notes: string | null;
          // Tiered splits: array of { min_amount, max_amount, split_rate }
          tiered_splits: TieredSplit[] | null;
          // Custom deductions: array of { name, type: 'percentage' | 'flat', value, apply_order }
          custom_deductions: CustomDeduction[] | null;
          created_at: string;
          updated_at: string;
          workspace_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          team_id?: string | null;
          name: string;
          category?: string | null;
          sort_order?: number;
          brokerage_split_rate?: number;
          payout_structure?: 'standard' | 'partnership' | 'tiered';
          partnership_split_rate?: number | null;
          partnership_notes?: string | null;
          tiered_splits?: TieredSplit[] | null;
          custom_deductions?: CustomDeduction[] | null;
          created_at?: string;
          updated_at?: string;
          workspace_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          team_id?: string | null;
          name?: string;
          category?: string | null;
          sort_order?: number;
          brokerage_split_rate?: number;
          payout_structure?: 'standard' | 'partnership' | 'tiered';
          partnership_split_rate?: number | null;
          partnership_notes?: string | null;
          tiered_splits?: TieredSplit[] | null;
          custom_deductions?: CustomDeduction[] | null;
          created_at?: string;
          updated_at?: string;
          workspace_id?: string | null;
        };
      };
      deals: {
        Row: {
          id: string;
          user_id: string;
          client_name: string;
          client_phone: string | null;
          client_email: string | null;
          property_address: string;
          city: string | null;
          state: string | null;
          zip: string | null;
          deal_type: DealType;
          lead_source_id: string | null;
          pipeline_status_id: string | null;
          status: DealStatus;
          stage_entered_at: string;
          expected_sale_price: number;
          actual_sale_price: number | null;
          gross_commission_rate: number;
          brokerage_split_rate: number;
          referral_out_rate: number | null;
          referral_in_rate: number | null;
          transaction_fee: number;
          closed_at: string | null;
          close_date: string | null;
          next_task_description: string | null;
          next_task_due_date: string | null;
          archived_reason: string | null;
          created_at: string;
          updated_at: string;
          // Deal-level deduction overrides (agents can waive/modify defaults)
          deal_deductions: DealDeduction[] | null;
          deal_credits: DealCredit[] | null;
          additional_contacts: AdditionalContact[] | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_name: string;
          client_phone?: string | null;
          client_email?: string | null;
          property_address: string;
          city?: string | null;
          state?: string | null;
          zip?: string | null;
          deal_type: DealType;
          lead_source_id?: string | null;
          pipeline_status_id?: string | null;
          status?: DealStatus;
          stage_entered_at?: string;
          expected_sale_price: number;
          actual_sale_price?: number | null;
          gross_commission_rate?: number;
          brokerage_split_rate?: number;
          referral_out_rate?: number | null;
          referral_in_rate?: number | null;
          transaction_fee?: number;
          closed_at?: string | null;
          close_date?: string | null;
          next_task_description?: string | null;
          next_task_due_date?: string | null;
          archived_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          deal_deductions?: DealDeduction[] | null;
          deal_credits?: DealCredit[] | null;
          additional_contacts?: AdditionalContact[] | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_name?: string;
          client_phone?: string | null;
          client_email?: string | null;
          property_address?: string;
          city?: string | null;
          state?: string | null;
          zip?: string | null;
          deal_type?: DealType;
          lead_source_id?: string | null;
          pipeline_status_id?: string | null;
          status?: DealStatus;
          stage_entered_at?: string;
          expected_sale_price?: number;
          actual_sale_price?: number | null;
          gross_commission_rate?: number;
          brokerage_split_rate?: number;
          referral_out_rate?: number | null;
          referral_in_rate?: number | null;
          transaction_fee?: number;
          closed_at?: string | null;
          close_date?: string | null;
          next_task_description?: string | null;
          next_task_due_date?: string | null;
          archived_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          deal_deductions?: DealDeduction[] | null;
          deal_credits?: DealCredit[] | null;
          additional_contacts?: AdditionalContact[] | null;
        };
      };
      // Workspace-level default deductions (set by admins, applied to all deals)
      workspace_deductions: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          type: 'percentage' | 'flat';
          value: number;
          apply_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          type: 'percentage' | 'flat';
          value: number;
          apply_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          type?: 'percentage' | 'flat';
          value?: number;
          apply_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      // Personal color overrides for pipeline statuses (per user)
      user_status_color_overrides: {
        Row: {
          id: string;
          user_id: string;
          pipeline_status_id: string;
          color: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          pipeline_status_id: string;
          color: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          pipeline_status_id?: string;
          color?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      activity_events: {
        Row: {
          id: string;
          actor_id: string;
          target_user_id: string;
          event_type: 'deal_status_change' | 'deal_deleted' | 'task_created';
          deal_id: string | null;
          task_id: string | null;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id: string;
          target_user_id: string;
          event_type: 'deal_status_change' | 'deal_deleted' | 'task_created';
          deal_id?: string | null;
          task_id?: string | null;
          payload?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string;
          target_user_id?: string;
          event_type?: 'deal_status_change' | 'deal_deleted' | 'task_created';
          deal_id?: string | null;
          task_id?: string | null;
          payload?: Json | null;
          created_at?: string;
        };
      };
      deal_notes: {
        Row: {
          id: string;
          deal_id: string;
          user_id: string;
          content: string;
          task_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          deal_id: string;
          user_id: string;
          content: string;
          task_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          deal_id?: string;
          user_id?: string;
          content?: string;
          task_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      tasks: {
        Row: {
          id: string;
          deal_id: string;
          user_id: string;
          title: string;
          description: string | null;
          due_date: string | null;
          completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          deal_id: string;
          user_id: string;
          title: string;
          description?: string | null;
          due_date?: string | null;
          completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          deal_id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          due_date?: string | null;
          completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_settings: {
        Row: {
          id: string;
          user_id: string;
          annual_gci_goal: number;
          annual_gross_sales_goal: number;
          default_tax_rate: number;
          default_brokerage_split_rate: number;
          global_role: GlobalRole;
          workspace_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          annual_gci_goal?: number;
          annual_gross_sales_goal?: number;
          default_tax_rate?: number;
          default_brokerage_split_rate?: number;
          global_role?: GlobalRole;
          workspace_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          annual_gci_goal?: number;
          annual_gross_sales_goal?: number;
          default_tax_rate?: number;
          default_brokerage_split_rate?: number;
          global_role?: GlobalRole;
          workspace_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      workspace_settings: {
        Row: {
          id: string;
          owner_user_id: string | null;
          name: string | null;
          company_name: string | null;
          timezone: string | null;
          locale: string | null;
          default_pipeline_view: string | null;
          integration_settings: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_user_id?: string | null;
          name?: string | null;
          company_name?: string | null;
          timezone?: string | null;
          locale?: string | null;
          default_pipeline_view?: string | null;
          integration_settings?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_user_id?: string | null;
          name?: string | null;
          company_name?: string | null;
          timezone?: string | null;
          locale?: string | null;
          default_pipeline_view?: string | null;
          integration_settings?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      teams: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_teams: {
        Row: {
          id: string;
          user_id: string;
          team_id: string;
          role: TeamRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          team_id: string;
          role?: TeamRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          team_id?: string;
          role?: TeamRole;
          created_at?: string;
          updated_at?: string;
        };
      };
      pipeline_templates: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      pipeline_statuses: {
        Row: {
          id: string;
          user_id: string | null;
          team_id: string | null;
          template_id: string | null;
          name: string;
          slug: string;
          sort_order: number;
          color: string | null;
          is_default: boolean;
          lifecycle_stage: 'new' | 'in_progress' | 'closed' | 'dead';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          team_id?: string | null;
          template_id?: string | null;
          name: string;
          slug: string;
          sort_order?: number;
          color?: string | null;
          is_default?: boolean;
          lifecycle_stage?: 'new' | 'in_progress' | 'closed' | 'dead';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          team_id?: string | null;
          template_id?: string | null;
          name?: string;
          slug?: string;
          sort_order?: number;
          color?: string | null;
          is_default?: boolean;
          lifecycle_stage?: 'new' | 'in_progress' | 'closed' | 'dead';
          created_at?: string;
          updated_at?: string;
        };
      };
      workspace_invitations: {
        Row: {
          id: string;
          workspace_id: string;
          team_id: string | null;
          email: string;
          intended_role: GlobalRole;
          invited_by: string | null;
          token: string;
          status: 'pending' | 'accepted' | 'canceled' | 'expired';
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          team_id?: string | null;
          email: string;
          intended_role?: GlobalRole;
          invited_by?: string | null;
          token?: string;
          status?: 'pending' | 'accepted' | 'canceled' | 'expired';
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          team_id?: string | null;
          email?: string;
          intended_role?: GlobalRole;
          invited_by?: string | null;
          token?: string;
          status?: 'pending' | 'accepted' | 'canceled' | 'expired';
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}
