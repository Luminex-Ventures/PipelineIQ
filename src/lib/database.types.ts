export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type DealType = 'buyer' | 'seller' | 'buyer_and_seller' | 'renter' | 'landlord';
export type DealStatus = 'new_lead' | 'contacted' | 'showing_scheduled' | 'offer_submitted' | 'under_contract' | 'pending' | 'closed' | 'dead';
export type GlobalRole = 'agent' | 'team_lead' | 'sales_manager' | 'admin';
export type TeamRole = 'agent' | 'team_lead';

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
          payout_structure: 'standard' | 'partnership';
          partnership_split_rate: number | null;
          partnership_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          team_id?: string | null;
          name: string;
          category?: string | null;
          sort_order?: number;
          brokerage_split_rate?: number;
          payout_structure?: 'standard' | 'partnership';
          partnership_split_rate?: number | null;
          partnership_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          team_id?: string | null;
          name?: string;
          category?: string | null;
          sort_order?: number;
          brokerage_split_rate?: number;
          payout_structure?: 'standard' | 'partnership';
          partnership_split_rate?: number | null;
          partnership_notes?: string | null;
          created_at?: string;
          updated_at?: string;
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
        };
      };
      deal_notes: {
        Row: {
          id: string;
          deal_id: string;
          user_id: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          deal_id: string;
          user_id: string;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          deal_id?: string;
          user_id?: string;
          content?: string;
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
