import OpenAI from 'openai';
import { supabase } from './supabase';
import { getUserRoleInfo, getVisibleUserIds } from './rbac';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Note: For production, consider using a backend proxy
});

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LumaResponse {
  answer: string;
  supportingData?: {
    total_deals?: number;
    total_gci?: number;
    closed_deals?: number;
    active_deals?: number;
    under_contract?: number;
    team_members?: number;
    [key: string]: number | undefined;
  };
  debugInfo?: {
    step1_intent: string;
    step2_query: string;
    step3_data: any;
  };
}

interface QueryIntent {
  intent: string;
  requiredTables: string[];
  filters?: string[];
  aggregations?: string[];
}

interface SQLQueryResult {
  query: string;
  explanation: string;
}

/**
 * STEP 1: Understand the user's intent
 */
async function understandIntent(
  userQuery: string,
  conversationHistory: ChatMessage[]
): Promise<QueryIntent> {
  const systemPrompt = `You are Luma, an AI assistant that helps understand what users want to know about their real estate pipeline data.

Your job is to analyze the user's question and determine:
1. What they're trying to find out (their intent)
2. Which database tables contain this information
3. What filters might be needed (date ranges, statuses, etc.)
4. What aggregations are needed (count, sum, average, etc.)

Available database tables:
- deals: Contains all deal/pipeline information (client_name, property_address, deal_type, status, expected_sale_price, actual_sale_price, gross_commission_rate, brokerage_split_rate, referral_out_rate, referral_in_rate, transaction_fee, closed_at, close_date, expected_close_date, stage_entered_at, user_id, lead_source_id, pipeline_status_id, created_at, updated_at)
- tasks: Contains tasks associated with deals (title, description, due_date, completed, deal_id, user_id)
- lead_sources: Contains lead source information (name, category, brokerage_split_rate, payout_structure)
- deal_notes: Contains notes for deals (content, deal_id, user_id, created_at)
- pipeline_statuses: Custom pipeline statuses (name, slug, color, sort_order)
- user_settings: User settings and roles (annual_gci_goal, global_role, workspace_id)

Common deal statuses: 'new_lead', 'contacted', 'showing_scheduled', 'offer_submitted', 'under_contract', 'pending', 'closed', 'dead'
Common deal types: 'buyer', 'seller', 'buyer_and_seller', 'renter', 'landlord'

Respond with a JSON object in this format:
{
  "intent": "Brief description of what the user wants to know",
  "requiredTables": ["table1", "table2"],
  "filters": ["description of filters needed"],
  "aggregations": ["description of aggregations needed"]
}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-4),
    { role: 'user', content: `Analyze this query: "${userQuery}"` }
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: messages as any,
    temperature: 0.3,
    max_tokens: 500,
  });

  const content = completion.choices[0]?.message?.content || '{}';
  const cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  try {
    return JSON.parse(cleanContent);
  } catch (e) {
    console.warn('Failed to parse intent:', e);
    return {
      intent: userQuery,
      requiredTables: ['deals'],
      filters: [],
      aggregations: []
    };
  }
}

/**
 * STEP 2: Generate SQL query based on intent
 */
async function generateSQLQuery(
  intent: QueryIntent,
  userQuery: string,
  visibleUserIds: string[]
): Promise<SQLQueryResult> {
  const systemPrompt = `You are an expert SQL query generator for a PostgreSQL database (Supabase).

Generate a SQL query based on the user's intent. The query must:
1. Use ONLY the tables mentioned in the intent
2. Apply role-based access control by filtering on user_id IN (${visibleUserIds.map(id => `'${id}'`).join(', ')})
3. Be safe and read-only (SELECT only, no INSERT/UPDATE/DELETE)
4. Use PostgreSQL syntax
5. Include appropriate JOINs if multiple tables are needed
6. Apply filters and aggregations as described in the intent
7. Limit results to a reasonable number (e.g., 100 rows max)

Available database schema:
- deals (id, user_id, client_name, property_address, city, state, zip, deal_type, status, expected_sale_price, actual_sale_price, gross_commission_rate, brokerage_split_rate, referral_out_rate, referral_in_rate, transaction_fee, closed_at, close_date, expected_close_date, stage_entered_at, lead_source_id, pipeline_status_id, created_at, updated_at)
- tasks (id, deal_id, user_id, title, description, due_date, completed, created_at, updated_at)
- lead_sources (id, name, category, brokerage_split_rate, payout_structure, created_at)
- deal_notes (id, deal_id, user_id, content, created_at, updated_at)
- pipeline_statuses (id, name, slug, color, sort_order, user_id, team_id)
- user_settings (id, user_id, annual_gci_goal, global_role, workspace_id)

To calculate GCI (Gross Commission Income):
- Base: (expected_sale_price OR actual_sale_price) * gross_commission_rate
- After brokerage: base * (1 - brokerage_split_rate)
- After referral: after_brokerage * (1 - COALESCE(referral_out_rate, 0))
- Net GCI: after_referral - COALESCE(transaction_fee, 0)

Respond with a JSON object:
{
  "query": "SELECT ... FROM ... WHERE ...",
  "explanation": "Brief explanation of what this query does"
}

IMPORTANT: Return ONLY the JSON object, no markdown formatting.`;

  const userPrompt = `Intent: ${intent.intent}
Required Tables: ${intent.requiredTables.join(', ')}
Filters: ${intent.filters?.join(', ') || 'none'}
Aggregations: ${intent.aggregations?.join(', ') || 'none'}

Original User Query: "${userQuery}"

Generate the SQL query now.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.1,
    max_tokens: 800,
  });

  const content = completion.choices[0]?.message?.content || '{}';
  const cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  try {
    return JSON.parse(cleanContent);
  } catch (e) {
    console.error('Failed to parse SQL query result:', e);
    throw new Error('Failed to generate SQL query');
  }
}

/**
 * Execute SQL query using Supabase client
 * This parses the SQL and executes it using the Supabase query builder
 */
async function executeSQLQuery(sqlQuery: string): Promise<any> {
  try {
    console.log('Parsing SQL query:', sqlQuery);
    
    // Extract table name from query
    const fromMatch = sqlQuery.match(/FROM\s+([a-z_]+)/i);
    if (!fromMatch) {
      throw new Error('Could not parse table name from query');
    }
    
    const tableName = fromMatch[1];
    console.log('Target table:', tableName);
    
    // Extract SELECT fields
    const selectMatch = sqlQuery.match(/SELECT\s+(.*?)\s+FROM/is);
    let selectFields = '*';
    if (selectMatch && selectMatch[1].trim() !== '*') {
      selectFields = selectMatch[1].trim();
    }
    
    // Start building the query
    let query = supabase.from(tableName).select(selectFields);
    
    // Extract WHERE clauses and apply them
    const whereMatch = sqlQuery.match(/WHERE\s+(.*?)(?:ORDER BY|LIMIT|GROUP BY|$)/is);
    if (whereMatch) {
      const whereClause = whereMatch[1].trim();
      console.log('WHERE clause:', whereClause);
      
      // Handle user_id IN clauses
      const inMatch = whereClause.match(/user_id\s+IN\s*\((.*?)\)/i);
      if (inMatch) {
        const userIds = inMatch[1]
          .split(',')
          .map(id => id.trim().replace(/'/g, ''));
        query = query.in('user_id', userIds);
        console.log('Applied user_id filter:', userIds);
      }
      
      // Handle status = 'value'
      const statusEqMatch = whereClause.match(/status\s*=\s*'([^']+)'/i);
      if (statusEqMatch) {
        query = query.eq('status', statusEqMatch[1]);
        console.log('Applied status filter:', statusEqMatch[1]);
      }
      
      // Handle status != 'value' or status <> 'value'
      const statusNeqMatch = whereClause.match(/status\s*(?:!=|<>)\s*'([^']+)'/i);
      if (statusNeqMatch) {
        query = query.neq('status', statusNeqMatch[1]);
        console.log('Applied status != filter:', statusNeqMatch[1]);
      }
      
      // Handle completed = false/true
      const completedMatch = whereClause.match(/completed\s*=\s*(false|true)/i);
      if (completedMatch) {
        query = query.eq('completed', completedMatch[1] === 'true');
        console.log('Applied completed filter:', completedMatch[1]);
      }
      
      // Handle date comparisons (>=)
      const dateGteMatches = whereClause.matchAll(/(\w+)\s*>=\s*'([^']+)'/gi);
      for (const match of dateGteMatches) {
        query = query.gte(match[1], match[2]);
        console.log(`Applied ${match[1]} >= filter:`, match[2]);
      }
      
      // Handle date comparisons (<=)
      const dateLteMatches = whereClause.matchAll(/(\w+)\s*<=\s*'([^']+)'/gi);
      for (const match of dateLteMatches) {
        query = query.lte(match[1], match[2]);
        console.log(`Applied ${match[1]} <= filter:`, match[2]);
      }
      
      // Handle date comparisons (>)
      const dateGtMatches = whereClause.matchAll(/(\w+)\s*>\s*'([^']+)'/gi);
      for (const match of dateGtMatches) {
        query = query.gt(match[1], match[2]);
        console.log(`Applied ${match[1]} > filter:`, match[2]);
      }
      
      // Handle date comparisons (<)
      const dateLtMatches = whereClause.matchAll(/(\w+)\s*<\s*'([^']+)'/gi);
      for (const match of dateLtMatches) {
        query = query.lt(match[1], match[2]);
        console.log(`Applied ${match[1]} < filter:`, match[2]);
      }
      
      // Handle IS NULL
      const isNullMatch = whereClause.match(/(\w+)\s+IS\s+NULL/i);
      if (isNullMatch) {
        query = query.is(isNullMatch[1], null);
        console.log(`Applied ${isNullMatch[1]} IS NULL`);
      }
      
      // Handle IS NOT NULL
      const isNotNullMatch = whereClause.match(/(\w+)\s+IS\s+NOT\s+NULL/i);
      if (isNotNullMatch) {
        query = query.not(isNotNullMatch[1], 'is', null);
        console.log(`Applied ${isNotNullMatch[1]} IS NOT NULL`);
      }
    }
    
    // Handle ORDER BY
    const orderMatch = sqlQuery.match(/ORDER BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const column = orderMatch[1];
      const ascending = !orderMatch[2] || orderMatch[2].toUpperCase() === 'ASC';
      query = query.order(column, { ascending });
      console.log(`Applied ORDER BY ${column} ${ascending ? 'ASC' : 'DESC'}`);
    }
    
    // Handle LIMIT
    const limitMatch = sqlQuery.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      query = query.limit(parseInt(limitMatch[1]));
      console.log('Applied LIMIT:', limitMatch[1]);
    }
    
    // Execute query
    console.log('Executing query...');
    const { data, error } = await query;
    
    if (error) {
      console.error('Query execution error:', error);
      throw new Error('Failed to execute query: ' + error.message);
    }
    
    console.log(`Query successful! Retrieved ${Array.isArray(data) ? data.length : 'unknown'} records`);
    return data || [];
  } catch (error) {
    console.error('Failed to execute SQL:', error);
    throw error;
  }
}

/**
 * STEP 3: Interpret the data and respond
 */
async function interpretData(
  userQuery: string,
  intent: QueryIntent,
  queryResult: any,
  conversationHistory: ChatMessage[]
): Promise<LumaResponse> {
  const systemPrompt = `You are Luma, an AI assistant for real estate agents using PipelineIQ.

The user asked a question, and we've retrieved data from the database to answer it.

Your job is to:
1. Analyze the data and answer the user's question clearly and concisely
2. Be specific with numbers and data points
3. Keep responses conversational and friendly (2-3 sentences unless more detail is needed)
4. Extract key metrics into supporting data if relevant
5. Format currency as USD with proper formatting

SUPPORTING DATA FORMAT:
When your answer includes key metrics, extract them into structured data. Return a JSON object at the END of your response in this format:
<<<SUPPORTING_DATA>>>
{
  "total_deals": 10,
  "total_gci": 50000,
  "closed_deals": 5,
  "active_deals": 5
}
<<<END_SUPPORTING_DATA>>>

Only include metrics that are relevant to the user's query.`;

  const dataString = JSON.stringify(queryResult, null, 2);
  const userPrompt = `User's Question: "${userQuery}"

What they wanted to know: ${intent.intent}

Data from database:
${dataString}

Please analyze this data and provide a clear, helpful answer to the user's question.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-4),
    { role: 'user', content: userPrompt }
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: messages as any,
    temperature: 0.7,
    max_tokens: 1000,
  });

  const responseContent = completion.choices[0]?.message?.content || 
    'Sorry, I encountered an error processing your request.';

  // Parse response to extract supporting data if present
  const supportingDataMatch = responseContent.match(
    /<<<SUPPORTING_DATA>>>([\s\S]*?)<<<END_SUPPORTING_DATA>>>/
  );

  let answer = responseContent;
  let supportingData = undefined;

  if (supportingDataMatch) {
    answer = responseContent
      .replace(/<<<SUPPORTING_DATA>>>[\s\S]*?<<<END_SUPPORTING_DATA>>>/, '')
      .trim();

    try {
      supportingData = JSON.parse(supportingDataMatch[1].trim());
    } catch (e) {
      console.warn('Failed to parse supporting data:', e);
    }
  }

  return {
    answer,
    supportingData
  };
}

/**
 * Main query function with 3-step prompting
 */
export async function queryLuma(
  userQuery: string,
  context: string,
  conversationHistory: ChatMessage[] = []
): Promise<LumaResponse> {
  try {
    // Get current user and permissions
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const roleInfo = await getUserRoleInfo(user.id);
    if (!roleInfo) {
      throw new Error('User role not found');
    }

    const visibleUserIds = await getVisibleUserIds(roleInfo);

    console.log('🔍 Starting 3-step Luma query process...');
    
    // STEP 1: Understand intent
    console.log('📋 Step 1: Understanding user intent...');
    const intent = await understandIntent(userQuery, conversationHistory);
    console.log('Intent:', intent);

    // STEP 2: Generate SQL query
    console.log('🔨 Step 2: Generating SQL query...');
    const sqlResult = await generateSQLQuery(intent, userQuery, visibleUserIds);
    console.log('SQL Query:', sqlResult.query);
    console.log('Explanation:', sqlResult.explanation);

    // Execute the SQL query
    console.log('⚡ Executing query...');
    let queryData;
    try {
      queryData = await executeSQLQuery(sqlResult.query);
    } catch (sqlError) {
      console.warn('SQL execution failed, falling back to context-based approach:', sqlError);
      // Fallback to original context-based approach
      return await queryLumaWithContext(userQuery, context, conversationHistory);
    }
    console.log('Query returned', Array.isArray(queryData) ? queryData.length : 'unknown', 'results');

    // STEP 3: Interpret and respond
    console.log('💡 Step 3: Interpreting data and generating response...');
    const response = await interpretData(userQuery, intent, queryData, conversationHistory);
    
    // Add debug info
    response.debugInfo = {
      step1_intent: intent.intent,
      step2_query: sqlResult.query,
      step3_data: queryData
    };

    console.log('✅ Luma query complete!');
    return response;
  } catch (error) {
    console.error('Luma query error:', error);
    throw new Error('Failed to get response from Luma. Please try again.');
  }
}

/**
 * Fallback: Original context-based approach
 */
async function queryLumaWithContext(
  userQuery: string,
  context: string,
  conversationHistory: ChatMessage[] = []
): Promise<LumaResponse> {
  const systemPrompt = `You are Luma, an AI assistant for real estate agents using PipelineIQ. 
You help users understand their pipeline data, deals, tasks, and performance metrics.

CONTEXT FROM DATABASE:
${context}

IMPORTANT ROLE-BASED ACCESS RULES:
- The context above contains ONLY the data the user has permission to see based on their role
- Sales Managers and Admins can see data for all users in the workspace
- Team Leads can see data for their team members
- Agents can only see their own personal data
- NEVER answer questions about data outside of what's provided in the context
- If asked about data not in the context, explain that you can only see data they have permission to access

INSTRUCTIONS:
- Provide clear, concise answers based ONLY on the context provided above
- Be specific with numbers and data points from the context
- If asked about data not in the context, politely indicate they don't have access to that information
- Keep responses conversational and friendly
- When relevant, extract key metrics to return as supporting data
- Format currency as USD with proper formatting
- Keep responses to 2-3 sentences unless more detail is needed

SUPPORTING DATA FORMAT:
When your answer includes key metrics, extract them into structured data. Return a JSON object at the END of your response in this format:
<<<SUPPORTING_DATA>>>
{
  "total_deals": 10,
  "total_gci": 50000,
  "closed_deals": 5,
  "active_deals": 5,
  "under_contract": 2,
  "team_members": 3
}
<<<END_SUPPORTING_DATA>>>

Only include the metrics that are relevant to the user's query. If no metrics are needed, don't include the supporting data section.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-6),
    { role: 'user', content: userQuery }
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: messages as any,
    temperature: 0.7,
    max_tokens: 1000,
  });

  const responseContent = completion.choices[0]?.message?.content || 
    'Sorry, I encountered an error processing your request.';

  const supportingDataMatch = responseContent.match(
    /<<<SUPPORTING_DATA>>>([\s\S]*?)<<<END_SUPPORTING_DATA>>>/
  );

  let answer = responseContent;
  let supportingData = undefined;

  if (supportingDataMatch) {
    answer = responseContent
      .replace(/<<<SUPPORTING_DATA>>>[\s\S]*?<<<END_SUPPORTING_DATA>>>/, '')
      .trim();

    try {
      supportingData = JSON.parse(supportingDataMatch[1].trim());
    } catch (e) {
      console.warn('Failed to parse supporting data:', e);
    }
  }

  return {
    answer,
    supportingData
  };
}

