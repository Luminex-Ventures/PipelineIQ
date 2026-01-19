import { supabase } from './supabase';
import { getUserRoleInfo, getVisibleUserIds } from './rbac';
import type { UserRoleInfo } from './rbac';

export interface RAGContext {
  deals: any[];
  tasks: any[];
  leadSources: any[];
  userRole: UserRoleInfo;
  stats: {
    totalDeals: number;
    closedDeals: number;
    activeDeals: number;
    underContract: number;
    totalGCI: number;
    avgDealValue: number;
  };
}

/**
 * Calculate GCI for a deal
 */
function calculateDealGCI(deal: any): number {
  const salePrice = deal.actual_sale_price || deal.expected_sale_price || 0;
  const grossCommission = salePrice * (deal.gross_commission_rate || 0);
  const afterBrokerageSplit = grossCommission * (1 - (deal.brokerage_split_rate || 0));
  const afterReferral = deal.referral_out_rate
    ? afterBrokerageSplit * (1 - deal.referral_out_rate)
    : afterBrokerageSplit;
  const netCommission = afterReferral - (deal.transaction_fee || 0);
  return netCommission;
}

/**
 * Build comprehensive context for RAG
 */
export async function buildRAGContext(): Promise<string> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Get user role info using existing RBAC system
    const roleInfo = await getUserRoleInfo(user.id);
    if (!roleInfo) {
      throw new Error('User role not found');
    }

    // Get visible user IDs based on role (uses RPC call to backend)
    const visibleUserIds = await getVisibleUserIds(roleInfo);
    
    console.log('RAG Context Debug:', {
      userId: user.id,
      role: roleInfo.globalRole,
      workspaceId: roleInfo.workspaceId,
      visibleUserCount: visibleUserIds.length,
      visibleUserIds: visibleUserIds
    });

    // Fetch deals with related data
    const { data: deals } = await supabase
      .from('deals')
      .select(`
        *,
        lead_sources(id, name)
      `)
      .in('user_id', visibleUserIds)
      .order('updated_at', { ascending: false })
      .limit(100);

    // Fetch tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        due_date,
        completed,
        deals(client_name, status)
      `)
      .in('user_id', visibleUserIds)
      .eq('completed', false)
      .order('due_date', { ascending: true })
      .limit(20);

    // Fetch lead sources
    const { data: leadSources } = await supabase
      .from('lead_sources')
      .select('*')
      .order('name');

    // Calculate statistics
    const closedDeals = (deals as any)?.filter((d: any) => d.status === 'closed') || [];
    const activeDeals = (deals as any)?.filter((d: any) => d.status !== 'closed' && d.status !== 'dead') || [];
    const inProgressDeals = (deals as any)?.filter((d: any) => d.status === 'in_progress') || [];
    
    const totalGCI = closedDeals.reduce((sum: number, deal: any) => sum + calculateDealGCI(deal), 0);
    const avgDealValue = closedDeals.length > 0 
      ? closedDeals.reduce((sum: number, d: any) => sum + (d.actual_sale_price || d.expected_sale_price || 0), 0) / closedDeals.length
      : 0;

    // Build context string
    let context = `=== USER PROFILE & PERMISSIONS ===
Role: ${roleInfo.globalRole}
${roleInfo.teamRole ? `Team Role: ${roleInfo.teamRole}` : ''}
Workspace ID: ${roleInfo.workspaceId || 'N/A'}
Data Access: ${
  roleInfo.globalRole === 'admin' || roleInfo.globalRole === 'sales_manager' 
    ? `FULL ACCESS - All ${visibleUserIds.length} users in workspace (Sales Manager/Admin)`
    : roleInfo.globalRole === 'team_lead' && roleInfo.teamId
    ? `TEAM ACCESS - ${visibleUserIds.length} team member${visibleUserIds.length !== 1 ? 's' : ''} (Team Lead)`
    : `PERSONAL ACCESS - Own data only (Agent)`
}

IMPORTANT: All data below is filtered based on this user's role and permissions. 
Only answer questions about the data provided in this context.

=== CURRENT DATE ===
${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

=== STATISTICS OVERVIEW ===
Total Deals: ${deals?.length || 0}
Closed Deals: ${closedDeals.length}
Active Deals: ${activeDeals.length}
In Progress: ${inProgressDeals.length}
Total GCI (Closed): $${totalGCI.toLocaleString('en-US', { maximumFractionDigits: 2 })}
Average Deal Value: $${avgDealValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}

=== RECENT DEALS (Last 20) ===
`;

    (deals as any)?.slice(0, 20).forEach((deal: any, idx: number) => {
      const dealValue = deal.actual_sale_price || deal.expected_sale_price || 0;
      const gci = calculateDealGCI(deal);
      context += `${idx + 1}. ${deal.client_name || 'Unnamed Deal'}
   Status: ${deal.status}
   Value: $${dealValue.toLocaleString()}
   GCI: $${gci.toLocaleString('en-US', { maximumFractionDigits: 2 })}
   Lead Source: ${deal.lead_sources?.name || 'Unknown'}
   ${deal.expected_close_date ? `Expected Close: ${deal.expected_close_date}` : ''}
   ${deal.closed_at ? `Closed: ${deal.closed_at}` : ''}
   Days in Stage: ${deal.stage_entered_at ? Math.floor((Date.now() - new Date(deal.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)) : 'N/A'}
   ${deal.notes ? `Notes: ${deal.notes.substring(0, 100)}${deal.notes.length > 100 ? '...' : ''}` : ''}

`;
    });

    context += `=== UPCOMING TASKS ===
`;
    if (tasks && tasks.length > 0) {
      (tasks as any).forEach((task: any, idx: number) => {
        context += `${idx + 1}. ${task.title}
   Due: ${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date'}
   ${task.deals?.client_name ? `Deal: ${task.deals.client_name} (${task.deals.status})` : ''}

`;
      });
    } else {
      context += 'No upcoming tasks.\n\n';
    }

    context += `=== LEAD SOURCES ===
`;
    if (leadSources && leadSources.length > 0) {
      (leadSources as any).forEach((source: any, idx: number) => {
        const sourceDeals = (deals as any)?.filter((d: any) => d.lead_source_id === source.id) || [];
        const sourceClosedDeals = sourceDeals.filter((d: any) => d.status === 'closed');
        const sourceGCI = sourceClosedDeals.reduce((sum: number, d: any) => sum + calculateDealGCI(d), 0);
        
        context += `${idx + 1}. ${source.name}
   Total Deals: ${sourceDeals.length}
   Closed: ${sourceClosedDeals.length}
   GCI: $${sourceGCI.toLocaleString('en-US', { maximumFractionDigits: 2 })}

`;
      });
    } else {
      context += 'No lead sources configured.\n\n';
    }

    // Add monthly performance for current year
    const currentYear = new Date().getFullYear();
    const monthlyStats = new Array(12).fill(0).map((_, idx) => {
      const monthDeals = closedDeals.filter((d: any) => {
        if (!d.closed_at) return false;
        const closeDate = new Date(d.closed_at);
        return closeDate.getFullYear() === currentYear && closeDate.getMonth() === idx;
      });
      const monthGCI = monthDeals.reduce((sum: number, d: any) => sum + calculateDealGCI(d), 0);
      return {
        month: new Date(currentYear, idx, 1).toLocaleDateString('en-US', { month: 'short' }),
        deals: monthDeals.length,
        gci: monthGCI
      };
    }).filter(m => m.deals > 0);

    if (monthlyStats.length > 0) {
      context += `=== ${currentYear} MONTHLY PERFORMANCE ===
`;
      monthlyStats.forEach(stat => {
        context += `${stat.month}: ${stat.deals} deals, $${stat.gci.toLocaleString('en-US', { maximumFractionDigits: 2 })} GCI\n`;
      });
      context += '\n';
    }

    return context;
  } catch (error) {
    console.error('Error building RAG context:', error);
    throw error;
  }
}
