import { supabase } from './supabase';
import type { GlobalRole } from './database.types';

export interface UserRoleInfo {
  userId: string;
  globalRole: GlobalRole;
  teamId: string | null;
  teamRole: 'agent' | 'team_lead' | null;
  workspaceId: string | null;
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
    globalRole: settings.global_role,
    teamId: teamData?.team_id || null,
    teamRole: teamData?.role || null,
    workspaceId: settings.workspace_id || null
  };
}

export async function getVisibleUserIds(roleInfo: UserRoleInfo): Promise<string[]> {
  if (roleInfo.globalRole === 'admin' || roleInfo.globalRole === 'sales_manager') {
    const { data: allUsers } = await supabase
      .from('user_settings')
      .select('user_id');

    return allUsers?.map(u => u.user_id) || [];
  }

  if (roleInfo.globalRole === 'team_lead' && roleInfo.teamId) {
    const { data: teamMembers } = await supabase
      .from('user_teams')
      .select('user_id')
      .eq('team_id', roleInfo.teamId);

    return teamMembers?.map(m => m.user_id) || [roleInfo.userId];
  }

  return [roleInfo.userId];
}

export function canManageTeams(roleInfo: UserRoleInfo): boolean {
  return roleInfo.globalRole === 'admin';
}

export function canViewAllTeams(roleInfo: UserRoleInfo): boolean {
  return roleInfo.globalRole === 'admin' || roleInfo.globalRole === 'sales_manager';
}

export function canViewTeamAnalytics(roleInfo: UserRoleInfo): boolean {
  return roleInfo.globalRole !== 'agent' || roleInfo.teamRole === 'team_lead';
}

export function isTeamLead(roleInfo: UserRoleInfo): boolean {
  return roleInfo.teamRole === 'team_lead' || roleInfo.globalRole === 'team_lead';
}

export function isSalesManagerOrAdmin(roleInfo: UserRoleInfo): boolean {
  return roleInfo.globalRole === 'sales_manager' || roleInfo.globalRole === 'admin';
}

export function isAdmin(roleInfo: UserRoleInfo | null | undefined): roleInfo is UserRoleInfo {
  return !!roleInfo && roleInfo.globalRole === 'admin';
}

export function getRoleLabel(role?: GlobalRole): string {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'sales_manager':
      return 'Manager';
    case 'team_lead':
      return 'Team Lead';
    case 'agent':
    default:
      return 'Agent';
  }
}
