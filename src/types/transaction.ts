/**
 * Transaction & E-sign integrations (DocuSign, Dotloop).
 */

export type TransactionIntegrationProvider = 'docusign' | 'dotloop';

export type TransactionIntegrationStatus = 'connected' | 'disconnected' | 'error' | 'expired';

export interface TransactionIntegration {
  id: string;
  user_id: string;
  provider: TransactionIntegrationProvider;
  external_account_id: string;
  external_account_name: string | null;
  token_ref: string | null;
  refresh_token_ref: string | null;
  status: TransactionIntegrationStatus;
  last_sync_at: string | null;
  last_sync_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
