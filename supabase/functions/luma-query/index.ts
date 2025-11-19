import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface QueryRequest {
  query: string;
  conversation_history?: Array<{ role: string; content: string }>;
}

interface DateRange {
  start: string;
  end: string;
  label: string;
}

interface ConversationContext {
  lastDateRange?: DateRange;
  lastQueryType?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { query, conversation_history }: QueryRequest = await req.json();

    const roleInfo = await getUserRoleInfo(supabase, user.id);
    if (!roleInfo) {
      return new Response(JSON.stringify({ error: 'User role not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const visibleUserIds = await getVisibleUserIds(supabase, roleInfo);

    const context = extractContext(conversation_history || []);
    const queryLower = query.toLowerCase();
    const dateRange = extractDateRange(queryLower, context);

    let answer = '';
    let supportingData: any = null;

    if (queryLower.includes('gci') || queryLower.includes('commission') || queryLower.includes('earnings')) {
      const result = await handleGCIQuery(supabase, visibleUserIds, query, dateRange);
      answer = result.answer;
      supportingData = result.data;
    } else if (queryLower.includes('closed') || queryLower.includes('deals')) {
      const result = await handleDealsQuery(supabase, visibleUserIds, query, dateRange);
      answer = result.answer;
      supportingData = result.data;
    } else if (queryLower.includes('lead source')) {
      const result = await handleLeadSourceQuery(supabase, visibleUserIds, query, dateRange);
      answer = result.answer;
      supportingData = result.data;
    } else if (queryLower.includes('pipeline') || queryLower.includes('under contract')) {
      const result = await handlePipelineQuery(supabase, visibleUserIds, query);
      answer = result.answer;
      supportingData = result.data;
    } else if (queryLower.includes('task') || queryLower.includes('reminder')) {
      const result = await handleTaskQuery(supabase, visibleUserIds);
      answer = result.answer;
      supportingData = result.data;
    } else if (queryLower.includes('status of') || queryLower.includes('deal with')) {
      const result = await handleDealStatusQuery(supabase, visibleUserIds, query);
      answer = result.answer;
      supportingData = result.data;
    } else if ((queryLower.includes('highest') || queryLower.includes('largest') || queryLower.includes('biggest')) && queryLower.includes('deal')) {
      const result = await handleTopDealQuery(supabase, visibleUserIds, query, dateRange, 'highest');
      answer = result.answer;
      supportingData = result.data;
    } else if ((queryLower.includes('lowest') || queryLower.includes('smallest')) && queryLower.includes('deal')) {
      const result = await handleTopDealQuery(supabase, visibleUserIds, query, dateRange, 'lowest');
      answer = result.answer;
      supportingData = result.data;
    } else if (queryLower.includes('team')) {
      const result = await handleTeamQuery(supabase, roleInfo, visibleUserIds, query, dateRange);
      answer = result.answer;
      supportingData = result.data;
    } else {
      answer = "I can help you with questions about your deals, tasks, GCI, lead sources, pipeline status, and team performance. Try asking things like:\n\n• 'What is the status of my deal with Oscar Torres?'\n• 'What are my next upcoming tasks?'\n• 'Which is my highest upcoming deal?'\n• 'How many deals did I close in 2024?'\n• 'Which lead source performs best this month?'\n• 'Summarize my team's performance this quarter'";
    }

    return new Response(
      JSON.stringify({ answer, supporting_data: supportingData }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Luma query error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});

function extractContext(conversationHistory: Array<{ role: string; content: string }>): ConversationContext {
  const context: ConversationContext = {};

  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    if (msg.role === 'user') {
      const msgLower = msg.content.toLowerCase();

      const tempRange = extractDateRange(msgLower, {});
      if (tempRange.label !== new Date().getFullYear().toString() ||
          msgLower.includes('last year') ||
          msgLower.includes('this year') ||
          msgLower.includes('this month') ||
          msgLower.includes('last month') ||
          msgLower.includes('quarter') ||
          /\b20\d{2}\b/.test(msgLower)) {
        context.lastDateRange = tempRange;
      }

      if (msgLower.includes('gci') || msgLower.includes('commission')) {
        context.lastQueryType = 'gci';
      } else if (msgLower.includes('deals') || msgLower.includes('closed')) {
        context.lastQueryType = 'deals';
      } else if (msgLower.includes('lead source')) {
        context.lastQueryType = 'lead_source';
      } else if (msgLower.includes('pipeline')) {
        context.lastQueryType = 'pipeline';
      } else if (msgLower.includes('team')) {
        context.lastQueryType = 'team';
      }

      if (context.lastDateRange || context.lastQueryType) {
        break;
      }
    }
  }

  return context;
}

function extractDateRange(query: string, context: ConversationContext): DateRange {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  if (query.includes('last year')) {
    const lastYear = currentYear - 1;
    return {
      start: `${lastYear}-01-01`,
      end: `${lastYear}-12-31`,
      label: `${lastYear}`
    };
  }

  if (query.includes('this year') || query.includes('ytd') || query.includes('year to date')) {
    return {
      start: `${currentYear}-01-01`,
      end: `${currentYear}-12-31`,
      label: `${currentYear}`
    };
  }

  if (query.includes('this month')) {
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);
    return {
      start: monthStart.toISOString().split('T')[0],
      end: monthEnd.toISOString().split('T')[0],
      label: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    };
  }

  if (query.includes('last month')) {
    const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const monthStart = new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), 1);
    const monthEnd = new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, 0);
    return {
      start: monthStart.toISOString().split('T')[0],
      end: monthEnd.toISOString().split('T')[0],
      label: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    };
  }

  if (query.includes('this quarter') || query.includes('q')) {
    const quarter = Math.floor(currentMonth / 3);
    const quarterStart = new Date(currentYear, quarter * 3, 1);
    const quarterEnd = new Date(currentYear, (quarter + 1) * 3, 0);
    return {
      start: quarterStart.toISOString().split('T')[0],
      end: quarterEnd.toISOString().split('T')[0],
      label: `Q${quarter + 1} ${currentYear}`
    };
  }

  if (query.includes('last quarter')) {
    const lastQuarter = Math.floor(currentMonth / 3) - 1;
    const year = lastQuarter < 0 ? currentYear - 1 : currentYear;
    const quarter = lastQuarter < 0 ? 3 : lastQuarter;
    const quarterStart = new Date(year, quarter * 3, 1);
    const quarterEnd = new Date(year, (quarter + 1) * 3, 0);
    return {
      start: quarterStart.toISOString().split('T')[0],
      end: quarterEnd.toISOString().split('T')[0],
      label: `Q${quarter + 1} ${year}`
    };
  }

  const yearMatch = query.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    return {
      start: `${year}-01-01`,
      end: `${year}-12-31`,
      label: `${year}`
    };
  }

  if (context.lastDateRange &&
      !query.includes('year') &&
      !query.includes('month') &&
      !query.includes('quarter') &&
      query.length < 100) {
    return context.lastDateRange;
  }

  return {
    start: `${currentYear}-01-01`,
    end: `${currentYear}-12-31`,
    label: `${currentYear}`
  };
}

async function getUserRoleInfo(supabase: any, userId: string) {
  const { data: settings } = await supabase
    .from('user_settings')
    .select('global_role')
    .eq('user_id', userId)
    .single();

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
  };
}

async function getVisibleUserIds(supabase: any, roleInfo: any): Promise<string[]> {
  if (roleInfo.globalRole === 'admin' || roleInfo.globalRole === 'sales_manager') {
    const { data: allUsers } = await supabase
      .from('user_settings')
      .select('user_id');
    return allUsers?.map((u: any) => u.user_id) || [];
  }

  if (roleInfo.globalRole === 'team_lead' && roleInfo.teamId) {
    const { data: teamMembers } = await supabase
      .from('user_teams')
      .select('user_id')
      .eq('team_id', roleInfo.teamId);
    return teamMembers?.map((m: any) => m.user_id) || [roleInfo.userId];
  }

  return [roleInfo.userId];
}

async function handleGCIQuery(supabase: any, visibleUserIds: string[], query: string, dateRange: DateRange) {
  const { data: deals } = await supabase
    .from('deals')
    .select('*')
    .in('user_id', visibleUserIds)
    .eq('status', 'closed')
    .gte('closed_at', dateRange.start)
    .lte('closed_at', dateRange.end);

  let totalGCI = 0;
  let dealCount = 0;

  deals?.forEach((deal: any) => {
    const salePrice = deal.actual_sale_price || deal.expected_sale_price;
    const grossCommission = salePrice * deal.gross_commission_rate;
    const afterBrokerageSplit = grossCommission * (1 - deal.brokerage_split_rate);
    const afterReferral = deal.referral_out_rate
      ? afterBrokerageSplit * (1 - deal.referral_out_rate)
      : afterBrokerageSplit;
    const netCommission = afterReferral - deal.transaction_fee;
    totalGCI += netCommission;
    dealCount++;
  });

  const answer = `In ${dateRange.label}, you closed ${dealCount} deal${dealCount !== 1 ? 's' : ''} with a total GCI of $${totalGCI.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;

  return {
    answer,
    data: {
      period: dateRange.label,
      start_date: dateRange.start,
      end_date: dateRange.end,
      total_deals: dealCount,
      total_gci: totalGCI,
    },
  };
}

async function handleDealsQuery(supabase: any, visibleUserIds: string[], query: string, dateRange: DateRange) {
  const { data: deals } = await supabase
    .from('deals')
    .select('*, lead_sources(name)')
    .in('user_id', visibleUserIds)
    .gte('created_at', dateRange.start)
    .lte('created_at', dateRange.end);

  const closedDeals = deals?.filter((d: any) => d.status === 'closed') || [];
  const activeDeals = deals?.filter((d: any) => d.status !== 'closed' && d.status !== 'dead') || [];

  const answer = `For ${dateRange.label}, you have ${closedDeals.length} closed deal${closedDeals.length !== 1 ? 's' : ''} and ${activeDeals.length} active deal${activeDeals.length !== 1 ? 's' : ''} in your pipeline.`;

  return {
    answer,
    data: {
      period: dateRange.label,
      closed_deals: closedDeals.length,
      active_deals: activeDeals.length,
      total_deals: deals?.length || 0,
    },
  };
}

async function handleLeadSourceQuery(supabase: any, visibleUserIds: string[], query: string, dateRange: DateRange) {
  const { data: deals } = await supabase
    .from('deals')
    .select('*, lead_sources(name)')
    .in('user_id', visibleUserIds)
    .eq('status', 'closed')
    .gte('closed_at', dateRange.start)
    .lte('closed_at', dateRange.end);

  const sourceStats: { [key: string]: { count: number; gci: number } } = {};

  deals?.forEach((deal: any) => {
    const sourceName = deal.lead_sources?.name || 'Unknown';
    const salePrice = deal.actual_sale_price || deal.expected_sale_price;
    const grossCommission = salePrice * deal.gross_commission_rate;
    const afterBrokerageSplit = grossCommission * (1 - deal.brokerage_split_rate);
    const afterReferral = deal.referral_out_rate
      ? afterBrokerageSplit * (1 - deal.referral_out_rate)
      : afterBrokerageSplit;
    const netCommission = afterReferral - deal.transaction_fee;

    if (!sourceStats[sourceName]) {
      sourceStats[sourceName] = { count: 0, gci: 0 };
    }
    sourceStats[sourceName].count++;
    sourceStats[sourceName].gci += netCommission;
  });

  const sortedSources = Object.entries(sourceStats)
    .sort(([, a], [, b]) => b.gci - a.gci)
    .slice(0, 5);

  let answer = `Top performing lead sources for ${dateRange.label}:\n\n`;
  sortedSources.forEach(([name, stats], index) => {
    answer += `${index + 1}. ${name}: ${stats.count} deal${stats.count !== 1 ? 's' : ''}, $${stats.gci.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GCI\n`;
  });

  if (sortedSources.length === 0) {
    answer = `No closed deals found for ${dateRange.label}.`;
  }

  return {
    answer,
    data: {
      period: dateRange.label,
      lead_sources: sortedSources.map(([name, stats]) => ({
        name,
        deals: stats.count,
        gci: stats.gci,
      })),
    },
  };
}

async function handlePipelineQuery(supabase: any, visibleUserIds: string[], query: string) {
  const { data: deals } = await supabase
    .from('deals')
    .select('*')
    .in('user_id', visibleUserIds)
    .neq('status', 'closed')
    .neq('status', 'dead');

  const underContract = deals?.filter((d: any) => d.status === 'under_contract') || [];
  const pending = deals?.filter((d: any) => d.status === 'pending') || [];

  let answer = `Pipeline Summary:\n\n`;
  answer += `• ${underContract.length} deal${underContract.length !== 1 ? 's' : ''} under contract\n`;
  answer += `• ${pending.length} deal${pending.length !== 1 ? 's' : ''} pending\n`;
  answer += `• ${deals?.length || 0} total active deals`;

  return {
    answer,
    data: {
      under_contract: underContract.length,
      pending: pending.length,
      total_active: deals?.length || 0,
    },
  };
}

async function handleTeamQuery(supabase: any, roleInfo: any, visibleUserIds: string[], query: string, dateRange: DateRange) {
  if (roleInfo.globalRole === 'agent' && roleInfo.teamRole !== 'team_lead') {
    return {
      answer: "You don't have access to team analytics. This feature is available for Team Leads, Sales Managers, and Admins.",
      data: null,
    };
  }

  const { data: deals } = await supabase
    .from('deals')
    .select('user_id, status, actual_sale_price, expected_sale_price, gross_commission_rate, brokerage_split_rate, referral_out_rate, transaction_fee')
    .in('user_id', visibleUserIds)
    .eq('status', 'closed')
    .gte('closed_at', dateRange.start)
    .lte('closed_at', dateRange.end);

  const userStats: { [key: string]: { deals: number; gci: number } } = {};

  deals?.forEach((deal: any) => {
    const salePrice = deal.actual_sale_price || deal.expected_sale_price;
    const grossCommission = salePrice * deal.gross_commission_rate;
    const afterBrokerageSplit = grossCommission * (1 - deal.brokerage_split_rate);
    const afterReferral = deal.referral_out_rate
      ? afterBrokerageSplit * (1 - deal.referral_out_rate)
      : afterBrokerageSplit;
    const netCommission = afterReferral - deal.transaction_fee;

    if (!userStats[deal.user_id]) {
      userStats[deal.user_id] = { deals: 0, gci: 0 };
    }
    userStats[deal.user_id].deals++;
    userStats[deal.user_id].gci += netCommission;
  });

  const totalDeals = deals?.length || 0;
  const totalGCI = Object.values(userStats).reduce((sum, stats) => sum + stats.gci, 0);

  let answer = `Team Performance (${dateRange.label}):\n\n`;
  answer += `• Total Deals: ${totalDeals}\n`;
  answer += `• Total GCI: $${totalGCI.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
  answer += `• Active Team Members: ${Object.keys(userStats).length}`;

  return {
    answer,
    data: {
      period: dateRange.label,
      total_deals: totalDeals,
      total_gci: totalGCI,
      team_members: Object.keys(userStats).length,
    },
  };
}

async function handleTaskQuery(supabase: any, visibleUserIds: string[]) {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, due_date, deals(client_name, status)')
    .in('user_id', visibleUserIds)
    .eq('completed', false)
    .order('due_date', { ascending: true })
    .limit(5);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let overdue = 0;
  let dueToday = 0;
  let upcoming = 0;

  (tasks || []).forEach((task: any) => {
    if (!task.due_date) {
      upcoming += 1;
      return;
    }
    const due = new Date(task.due_date);
    due.setHours(0, 0, 0, 0);
    if (due < today) overdue += 1;
    else if (due.getTime() === today.getTime()) dueToday += 1;
    else upcoming += 1;
  });

  const nextTask = tasks && tasks.length > 0 ? tasks[0] : null;
  let answer = `You have ${tasks?.length || 0} upcoming task${tasks && tasks.length !== 1 ? 's' : ''}.`;
  answer += ` Overdue: ${overdue}, Due today: ${dueToday}, Upcoming: ${upcoming}.`;
  if (nextTask) {
    answer += ` Next up: "${nextTask.title}"${nextTask.deals?.client_name ? ` for ${nextTask.deals.client_name}` : ''}`;
    if (nextTask.due_date) {
      answer += ` due ${new Date(nextTask.due_date).toLocaleDateString()}.`;
    } else {
      answer += '.';
    }
  }

  return {
    answer,
    data: {
      total_open: tasks?.length || 0,
      overdue,
      due_today: dueToday,
      upcoming,
      next_tasks: (tasks || []).map((task: any) => ({
        title: task.title,
        due_date: task.due_date,
        client: task.deals?.client_name || null,
        status: task.deals?.status || null
      }))
    }
  };
}

async function handleDealStatusQuery(supabase: any, visibleUserIds: string[], query: string) {
  const clientName = extractClientName(query);
  if (!clientName) {
    return {
      answer: "Which client should I look up? Try asking 'What’s the status of my deal with Oscar Torres?'",
      data: null
    };
  }

  const { data: deal } = await supabase
    .from('deals')
    .select('*')
    .in('user_id', visibleUserIds)
    .ilike('client_name', `%${clientName}%`)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!deal) {
    return {
      answer: `I couldn't find a deal for ${clientName}. Double-check the name or try a different spelling.`,
      data: null
    };
  }

  const statusLabel = formatStatusLabel(deal.status);
  const daysInStage = Math.floor((Date.now() - new Date(deal.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24));
  const answer = `The deal with ${deal.client_name} is currently ${statusLabel} and has been in this stage for ${daysInStage} day${daysInStage !== 1 ? 's' : ''}. Expected price: $${getDealValue(deal).toLocaleString()}.`;

  return {
    answer,
    data: {
      client_name: deal.client_name,
      status: statusLabel,
      expected_sale_price: getDealValue(deal),
      stage_days: daysInStage
    }
  };
}

async function handleTopDealQuery(
  supabase: any,
  visibleUserIds: string[],
  query: string,
  dateRange: DateRange,
  mode: 'highest' | 'lowest'
) {
  const queryLower = query.toLowerCase();
  const upcoming = queryLower.includes('upcoming') || queryLower.includes('pipeline') || queryLower.includes('active');

  let dealsQuery = supabase
    .from('deals')
    .select('*')
    .in('user_id', visibleUserIds);

  if (upcoming) {
    dealsQuery = dealsQuery
      .neq('status', 'closed')
      .neq('status', 'dead');
  } else {
    dealsQuery = dealsQuery
      .eq('status', 'closed')
      .gte('closed_at', dateRange.start)
      .lte('closed_at', dateRange.end);
  }

  const { data: deals } = await dealsQuery;
  if (!deals || deals.length === 0) {
    return {
      answer: upcoming
        ? 'I could not find any active deals right now.'
        : `No closed deals found for ${dateRange.label}.`,
      data: null
    };
  }

  const sorted = deals
    .map((deal: any) => ({ deal, value: getDealValue(deal) }))
    .filter(entry => entry.value > 0)
    .sort((a, b) => mode === 'highest' ? b.value - a.value : a.value - b.value);

  const target = sorted[0];
  if (!target) {
    return {
      answer: 'There are no deals with a recorded value yet.',
      data: null
    };
  }

  const statusLabel = formatStatusLabel(target.deal.status);
  const descriptor = upcoming ? 'active' : `closed in ${dateRange.label}`;
  const answer = `Your ${mode === 'highest' ? 'largest' : 'smallest'} ${descriptor} deal is ${target.deal.client_name} at $${target.value.toLocaleString()}. Status: ${statusLabel}.`;

  return {
    answer,
    data: {
      client_name: target.deal.client_name,
      value: target.value,
      status: statusLabel,
      mode,
      scope: upcoming ? 'upcoming' : 'closed'
    }
  };
}

function extractClientName(query: string) {
  const lower = query.toLowerCase();
  const match = lower.match(/deal with ([^?.,]+)/) || lower.match(/status of ([^?.,]+)/);
  if (!match) return null;
  return match[1].trim();
}

function getDealValue(deal: any) {
  return Number(deal.actual_sale_price || deal.expected_sale_price || 0);
}

function formatStatusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (s) => s.toUpperCase());
}
