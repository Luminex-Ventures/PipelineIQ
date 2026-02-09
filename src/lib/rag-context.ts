import { supabase } from './supabase';
import { getUserRoleInfo, getVisibleUserIds } from './rbac';
import { calculateActualGCI, calculateExpectedGCI } from './commission';
import type { UserRoleInfo } from './rbac';
import type { Database } from './database.types';

type DealRow = Database['public']['Tables']['deals']['Row'] & {
  lead_sources?: { id: string; name: string | null } | null;
};

type TaskRow = Database['public']['Tables']['tasks']['Row'] & {
  deals?: { client_name: string | null; status: string | null } | null;
};

type LeadSourceRow = Database['public']['Tables']['lead_sources']['Row'];

export interface RAGContext {
  deals: DealRow[];
  tasks: TaskRow[];
  leadSources: LeadSourceRow[];
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

export interface RAGContextResult {
  context: string;
  meta: {
    dealCount?: number;
    taskCount?: number;
  };
}

/**
 * Calculate GCI for a deal
 */
function calculateDealGCI(deal: DealRow): number {
  return deal.status === 'closed' ? calculateActualGCI(deal) : calculateExpectedGCI(deal);
}

/**
 * Build comprehensive context for RAG
 */
export async function buildRAGContext(): Promise<RAGContextResult> {
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

    const now = new Date();
    const recentYears = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    const yearlyClosedCounts = await Promise.all(
      recentYears.map(async (year) => {
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
        const { count } = await supabase
          .from('deals')
          .select('id', { count: 'exact', head: true })
          .in('user_id', visibleUserIds)
          .eq('status', 'closed')
          .gte('closed_at', yearStart.toISOString())
          .lte('closed_at', yearEnd.toISOString());
        return { year, count: count ?? 0 };
      })
    );

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
    const dealList = (deals ?? []) as DealRow[];
    const taskList = (tasks ?? []) as TaskRow[];
    const closedDeals = dealList.filter((d) => d.status === 'closed');
    const activeDeals = dealList.filter((d) => d.status !== 'closed' && d.status !== 'dead');
    const inProgressDeals = dealList.filter((d) => d.status === 'in_progress');
    
    const totalGCI = closedDeals.reduce((sum, deal) => sum + calculateDealGCI(deal), 0);
    const avgDealValue = closedDeals.length > 0 
      ? closedDeals.reduce((sum, d) => sum + (d.actual_sale_price || d.expected_sale_price || 0), 0) / closedDeals.length
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

=== RECENT YEAR SUMMARY ===
${yearlyClosedCounts
  .map((entry) => `Closed Deals (${entry.year}): ${entry.count}`)
  .join('\n')}

=== RECENT DEALS (Last 20) ===
`;

    dealList.slice(0, 20).forEach((deal, idx) => {
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
    if (taskList.length > 0) {
      taskList.forEach((task, idx) => {
        const dueFormatted = (() => {
          if (!task.due_date) return 'No due date';
          const [year, month, day] = task.due_date.split('-').map(Number);
          if (!year || !month || !day) return 'No due date';
          return new Date(year, month - 1, day).toLocaleDateString();
        })();
        context += `${idx + 1}. ${task.title}
   Due: ${dueFormatted}
   ${task.deals?.client_name ? `Deal: ${task.deals.client_name} (${task.deals.status})` : ''}

`;
      });
    } else {
      context += 'No upcoming tasks.\n\n';
    }

    context += `=== LEAD SOURCES ===
`;
    const leadSourceList = (leadSources ?? []) as LeadSourceRow[];
    if (leadSourceList.length > 0) {
      leadSourceList.forEach((source, idx) => {
        const sourceDeals = dealList.filter((d) => d.lead_source_id === source.id);
        const sourceClosedDeals = sourceDeals.filter((d) => d.status === 'closed');
        const sourceGCI = sourceClosedDeals.reduce((sum, d) => sum + calculateDealGCI(d), 0);
        
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
      const monthDeals = closedDeals.filter((d) => {
        if (!d.closed_at) return false;
        const closeDate = new Date(d.closed_at);
        return closeDate.getFullYear() === currentYear && closeDate.getMonth() === idx;
      });
      const monthGCI = monthDeals.reduce((sum, d) => sum + calculateDealGCI(d), 0);
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

    return {
      context,
      meta: {
        dealCount: dealList.length,
        taskCount: taskList.length
      }
    };
  } catch (error) {
    console.error('Error building RAG context:', error);
    throw error;
  }
}
