/**
 * Luma Conversations – hooks for threads, messages, send, campaigns, enrollments, connected accounts.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import type { ThreadChannel, CampaignEnrollmentStatus } from '../types/conversations';
import * as conversationsService from '../services/conversations.service';
import * as campaignsService from '../services/campaigns.service';
import * as connectedAccountsService from '../services/connectedAccounts.service';
import * as conversationsApi from '../services/conversationsApi';

// ---------------------------------------------------------------------------
// Connected accounts
// ---------------------------------------------------------------------------

export function useConnectedAccounts() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey: ['conversations', 'connected-accounts', userId],
    queryFn: () => connectedAccountsService.listConnectedAccounts(userId),
    enabled: !!userId,
  });
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export function useThreads(
  filters: { channel?: ThreadChannel; unreadOnly?: boolean; search?: string } = {}
) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey: ['conversations', 'threads', userId, filters],
    queryFn: () => conversationsService.listThreads(userId, filters),
    enabled: !!userId,
  });
}

export function useThread(threadId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['conversations', 'thread', threadId],
    queryFn: () => (threadId ? conversationsService.getThread(threadId) : null),
    enabled: !!threadId,
  });
}

export function useThreadMessages(threadId: string | null) {
  return useQuery({
    queryKey: ['conversations', 'messages', threadId],
    queryFn: () => (threadId ? conversationsService.listMessages(threadId) : []),
    enabled: !!threadId,
  });
}

export function useMarkThreadRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => conversationsService.markThreadRead(threadId),
    onSuccess: (_, threadId) => {
      qc.invalidateQueries({ queryKey: ['conversations', 'thread', threadId] });
      qc.invalidateQueries({ queryKey: ['conversations', 'threads'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Send message (calls Edge Function then persists via function or client)
// For MVP we assume Edge Function persists the message; we invalidate and refetch.
// ---------------------------------------------------------------------------

export function useSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: conversationsApi.SendEmailPayload) =>
      conversationsApi.sendEmailViaApi(payload),
    onSuccess: (_, payload) => {
      if (payload.thread_id) {
        qc.invalidateQueries({ queryKey: ['conversations', 'messages', payload.thread_id] });
        qc.invalidateQueries({ queryKey: ['conversations', 'thread', payload.thread_id] });
      }
      qc.invalidateQueries({ queryKey: ['conversations', 'threads'] });
    },
  });
}

export function useSendSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: conversationsApi.SendSmsPayload) =>
      conversationsApi.sendSmsViaApi(payload),
    onSuccess: (_, payload) => {
      if (payload.thread_id) {
        qc.invalidateQueries({ queryKey: ['conversations', 'messages', payload.thread_id] });
        qc.invalidateQueries({ queryKey: ['conversations', 'thread', payload.thread_id] });
      }
      qc.invalidateQueries({ queryKey: ['conversations', 'threads'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export function useContacts() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey: ['conversations', 'contacts', userId],
    queryFn: () => conversationsService.listContacts(userId),
    enabled: !!userId,
  });
}

export function useCreateContact() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; email?: string; phone?: string; tags?: string[] }) =>
      conversationsService.createContact(user?.id ?? '', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations', 'contacts'] }),
  });
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export function useCampaigns() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey: ['conversations', 'campaigns', userId],
    queryFn: () => campaignsService.listCampaigns(userId),
    enabled: !!userId,
  });
}

export function useCampaign(campaignId: string | null) {
  return useQuery({
    queryKey: ['conversations', 'campaign', campaignId],
    queryFn: () => (campaignId ? campaignsService.getCampaign(campaignId) : null),
    enabled: !!campaignId,
  });
}

export function useCampaignSteps(campaignId: string | null) {
  return useQuery({
    queryKey: ['conversations', 'campaign-steps', campaignId],
    queryFn: () => (campaignId ? campaignsService.listCampaignSteps(campaignId) : []),
    enabled: !!campaignId,
  });
}

export function useEnrollments(campaignId: string | null, status?: CampaignEnrollmentStatus) {
  return useQuery({
    queryKey: ['conversations', 'enrollments', campaignId, status],
    queryFn: () =>
      campaignId ? campaignsService.listEnrollments(campaignId, status) : Promise.resolve([]),
    enabled: !!campaignId,
  });
}

export function useCreateCampaign() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; channel: ThreadChannel }) =>
      campaignsService.createCampaign(user?.id ?? '', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations', 'campaigns'] }),
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<{ name: string; is_active: boolean }>;
    }) => campaignsService.updateCampaign(id, updates),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['conversations', 'campaigns'] });
      qc.invalidateQueries({ queryKey: ['conversations', 'campaign', id] });
    },
  });
}

export function useUpsertCampaignSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
      steps,
    }: {
      campaignId: string;
      steps: { step_order: number; delay_days: number; subject?: string | null; body_template: string }[];
    }) => campaignsService.upsertCampaignSteps(campaignId, steps),
    onSuccess: (_, { campaignId }) => {
      qc.invalidateQueries({ queryKey: ['conversations', 'campaign-steps', campaignId] });
    },
  });
}

export function useEnrollContacts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
      contactIds,
      steps,
    }: {
      campaignId: string;
      contactIds: string[];
      steps: { delay_days: number }[];
    }) =>
      campaignsService.enrollContacts(user?.id ?? '', campaignId, contactIds, steps),
    onSuccess: (_, { campaignId }) => {
      qc.invalidateQueries({ queryKey: ['conversations', 'enrollments', campaignId] });
    },
  });
}

export function usePauseEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => campaignsService.pauseEnrollment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations', 'enrollments'] }),
  });
}

export function useResumeEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => campaignsService.resumeEnrollment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations', 'enrollments'] }),
  });
}
