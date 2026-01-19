import { supabase } from './supabase';
import { getUserRoleInfo, getVisibleUserIds } from './rbac';

/**
 * Debug helper to check RAG permissions
 * Call this in the browser console: window.debugRAGPermissions()
 */
export async function debugRAGPermissions() {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('❌ User not authenticated');
      return;
    }

    console.log('🔍 RAG Permissions Debug');
    console.log('========================\n');

    // Get user role info
    const roleInfo = await getUserRoleInfo(user.id);
    if (!roleInfo) {
      console.error('❌ User role not found');
      return;
    }

    console.log('👤 User Info:');
    console.log('  User ID:', user.id);
    console.log('  Email:', user.email);
    console.log('  Global Role:', roleInfo.globalRole);
    console.log('  Team Role:', roleInfo.teamRole || 'None');
    console.log('  Team ID:', roleInfo.teamId || 'None');
    console.log('  Workspace ID:', roleInfo.workspaceId || 'None');
    console.log('  Is Active:', roleInfo.isActive);
    console.log('\n');

    // Get visible user IDs
    console.log('🔐 Testing Permission Levels...\n');

    // Test RPC call
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_accessible_agents');
    if (rpcError) {
      console.error('❌ RPC Error:', rpcError);
    } else {
      console.log('✅ RPC Call Success');
      const rpcRows = (rpcData ?? []) as Array<{ user_id: string }>;
      console.log('  Accessible users from RPC:', rpcRows.length);
      console.log('  RPC Data:', rpcData);
    }
    console.log('\n');

    // Test getVisibleUserIds
    const visibleUserIds = await getVisibleUserIds(roleInfo);
    console.log('✅ Visible User IDs:', visibleUserIds);
    console.log('  Count:', visibleUserIds.length);
    console.log('\n');

    // Test deals query
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select('id, client_name, user_id, status')
      .in('user_id', visibleUserIds)
      .limit(10);

    if (dealsError) {
      console.error('❌ Deals Query Error:', dealsError);
    } else {
      console.log('✅ Deals Query Success');
      const dealRows = deals ?? [];
      console.log('  Sample deals returned:', dealRows.length);
      console.log('  Unique user_ids in deals:', [...new Set(dealRows.map((d) => d.user_id))]);
    }
    console.log('\n');

    // Test user_settings query
    const { data: allUsers, error: usersError } = await supabase
      .from('user_settings')
      .select('user_id, global_role, workspace_id');

    if (usersError) {
      console.error('❌ User Settings Query Error:', usersError);
    } else {
      console.log('✅ User Settings Query');
      console.log('  Total users in workspace:', allUsers?.length || 0);
      console.log('  Users by role:',
        (allUsers ?? []).reduce((acc: Record<string, number>, u) => {
          const role = u.global_role || 'unknown';
          acc[role] = (acc[role] || 0) + 1;
          return acc;
        }, {})
      );
    }
    console.log('\n');

    // Summary
    console.log('📊 Summary');
    console.log('========================');
    if (roleInfo.globalRole === 'admin' || roleInfo.globalRole === 'sales_manager') {
      console.log('✅ You should have FULL ACCESS to all workspace data');
      if (visibleUserIds.length > 1) {
        console.log('✅ Permission check PASSED - You can see', visibleUserIds.length, 'users');
      } else {
        console.warn('⚠️  Permission check FAILED - You should see more than 1 user');
        console.warn('   Check that workspace_id is set correctly in user_settings');
      }
    } else if (roleInfo.globalRole === 'team_lead') {
      console.log('✅ You should have TEAM ACCESS');
      console.log('   Team members visible:', visibleUserIds.length);
    } else {
      console.log('✅ You have PERSONAL ACCESS (agent)');
      console.log('   You should only see your own data');
    }

  } catch (error) {
    console.error('❌ Debug Error:', error);
  }
}

// Make it available globally for browser console debugging
declare global {
  interface Window {
    debugRAGPermissions?: () => void;
  }
}

if (typeof window !== 'undefined') {
  window.debugRAGPermissions = debugRAGPermissions;
}
