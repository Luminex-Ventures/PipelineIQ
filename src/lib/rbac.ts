import { supabase } from './supabase';
import type { GlobalRole } from './database.types';

export interface UserRoleInfo {
  userId: string;
  globalRole: GlobalRole;
  teamId: string | null;
  teamRole: 'agent' | 'team_lead' | null;
  workspaceId: string | null;
  isActive: boolean;
}

export async function getUserRoleInfo(userId: string): Promise<UserRoleInfo | null> {
  const { data: settings } = await supabase
    .from('user_settings')
    .select('global_role, workspace_id')
    .eq('user_id', userId)
    .maybeSingle();

  const { data: teamData } = await supabase
    .from('user_teams')
    .select('team_id, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (!settings) return null;

  return {
    userId,
    globalRole: (settings as any).global_role,
    teamId: (teamData as any)?.team_id || null,
    teamRole: (teamData as any)?.role || null,
    workspaceId: (settings as any).workspace_id || null,
    isActive: (settings as any).is_active ?? true
  };
}

export async function getVisibleUserIds(roleInfo: UserRoleInfo): Promise<string[]> {
  // Always mirror backend rules via RPC; fall back to user_settings if RPC fails
  const { data, error } = await supabase.rpc('get_accessible_agents');
  if (!error && data) {
    const ids = (data as { user_id: string }[]).map(row => row.user_id);
    if (ids.length) return ids;
  }

  // Fallback: admins/managers try direct user_settings; otherwise self
  if (roleInfo.globalRole === 'admin' || roleInfo.globalRole === 'sales_manager') {
    const { data: allUsers } = await supabase.from('user_settings').select('user_id');
    const ids = (allUsers as any)?.map((u: any) => u.user_id).filter(Boolean);
    if (ids && ids.length) return ids;
  }

  return [roleInfo.userId];
}

export function canManageTeams(roleInfo?: UserRoleInfo | null): boolean {
  return roleInfo?.globalRole === 'admin';
}

export function canViewAllTeams(roleInfo?: UserRoleInfo | null): boolean {
  return roleInfo?.globalRole === 'admin' || roleInfo?.globalRole === 'sales_manager';
}

export function canViewTeamAnalytics(roleInfo?: UserRoleInfo | null): boolean {
  if (!roleInfo) return false;
  return roleInfo.globalRole !== 'agent' || roleInfo.teamRole === 'team_lead';
}

export function isTeamLead(roleInfo?: UserRoleInfo | null): boolean {
  return roleInfo?.teamRole === 'team_lead' || roleInfo?.globalRole === 'team_lead';
}

export function isSalesManagerOrAdmin(roleInfo?: UserRoleInfo | null): boolean {
  return roleInfo?.globalRole === 'sales_manager' || roleInfo?.globalRole === 'admin';
}

export function isAdmin(roleInfo: UserRoleInfo | null | undefined): roleInfo is UserRoleInfo {
  return !!roleInfo && roleInfo.globalRole === 'admin';
}

export function getRoleLabel(role?: GlobalRole): string {
  if (!role) return '—';
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'sales_manager':
      return 'Sales Manager';
    case 'team_lead':
      return 'Team Lead';
    case 'agent':
      return 'Agent';
    default:
      return '—';
  }
}

export function canInviteAgents(roleInfo?: UserRoleInfo | null): boolean {
  if (!roleInfo) return false;
  return ['admin', 'sales_manager', 'team_lead'].includes(roleInfo.globalRole);
}

export function canInviteElevatedRoles(roleInfo?: UserRoleInfo | null): boolean {
  return roleInfo?.globalRole === 'admin';
}

export function canManageWorkspaceMembers(roleInfo?: UserRoleInfo | null): boolean {
  return roleInfo?.globalRole === 'admin';
}
