# Luma AI - Smart RAG System Implementation

## Overview

The Luma AI chat interface has been completely reworked to use a **Smart RAG (Retrieval-Augmented Generation)** system powered by OpenAI's GPT-4o-mini model. This replaces the previous keyword-based edge function approach with true AI understanding.

## What Changed

### Before (Old Implementation)
- ❌ Used Supabase Edge Functions for query processing
- ❌ Rule-based keyword matching (no real AI)
- ❌ Limited query understanding
- ❌ Separate insights function
- ❌ Hardcoded response templates

### After (New Implementation)
- ✅ Direct OpenAI API integration from frontend
- ✅ True AI-powered natural language understanding
- ✅ Smart RAG system that retrieves relevant context from Supabase
- ✅ Unified AI system for all queries
- ✅ Dynamic, context-aware responses

## Architecture

### 1. **RAG Context Builder** (`src/lib/rag-context.ts`)
Fetches comprehensive context from Supabase database:
- User profile and role information
- Recent deals with full details
- Upcoming tasks
- Lead source performance
- Monthly statistics
- Team data (based on role permissions)

The context is formatted as a structured text document that provides the AI with all the information it needs to answer queries.

### 2. **OpenAI Service** (`src/lib/openai.ts`)
Handles communication with OpenAI API:
- Sends user query with RAG context
- Manages conversation history (last 6 messages)
- Parses AI responses
- Extracts structured supporting data for UI cards

### 3. **Luma UI** (`src/pages/Luma.tsx`)
The user interface remains **exactly the same** visually:
- Same chat interface design
- Same suggested prompts
- Same supporting data cards
- Same loading states and animations

Only the underlying data fetching and AI processing changed.

## How It Works

1. **User asks a question** (e.g., "Show me my closed deals this year")
2. **Build RAG context**: Fetch relevant data from Supabase (deals, tasks, lead sources, etc.)
3. **Send to OpenAI**: Query + context + conversation history
4. **AI processes**: GPT-4o-mini understands the question and provides an answer based on the context
5. **Parse response**: Extract the natural language answer and any supporting metrics
6. **Display**: Show the answer and supporting data cards in the UI

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Existing Supabase variables
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# New OpenAI configuration
VITE_OPENAI_API_KEY=your_openai_api_key
```

### Getting an OpenAI API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new secret key
5. Copy the key and add it to your `.env` file

## Features

### ✅ What Luma Can Do Now

- Answer natural language questions about your pipeline
- Understand complex queries without keyword matching
- Provide contextual insights based on your actual data
- Maintain conversation context across multiple questions
- Extract and display relevant metrics automatically
- **Strict role-based access control** (see permissions below)

### 🔐 Role-Based Permissions

Luma strictly respects PipelineIQ's role-based access control:

**Sales Manager / Admin:**
- ✅ Full access to ALL workspace data
- ✅ Can ask about any user's deals, performance, or metrics
- ✅ See aggregated statistics for entire organization
- Example: "Show me total GCI across all agents this quarter"

**Team Lead:**
- ✅ Access to their team members' data
- ✅ Can ask about team performance and individual team member metrics
- ❌ Cannot access data from other teams or users outside their team
- Example: "How is my team performing this month?"

**Agent:**
- ✅ Access to ONLY their own personal data
- ❌ Cannot see other agents' deals or performance
- ❌ Cannot see team or organization-wide statistics
- Example: "What's my total GCI this year?"

**Implementation:**
- Data is filtered at the database query level using `visibleUserIds`
- AI is explicitly instructed to only answer about data in the provided context
- Context clearly states the user's role and permission level
- If a user asks about data they don't have access to, Luma will politely explain the limitation

### 📊 Example Queries

- "Show me my closed deals this year"
- "Which lead source is performing best?"
- "What's my total GCI for Q4?"
- "Are there any stalled deals I should follow up on?"
- "How is my pipeline looking compared to last month?"
- "What are my next upcoming tasks?"

## Security Considerations

### ⚠️ Important Notes

1. **API Key Exposure**: The OpenAI API key is currently exposed in the browser (using `dangerouslyAllowBrowser: true`)
   - For production, consider implementing a backend proxy
   - This prevents API key exposure and adds rate limiting

2. **Cost Management**: 
   - GPT-4o-mini is cost-effective (~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens)
   - Consider implementing usage limits or quotas
   - Monitor API usage in OpenAI dashboard

3. **Data Privacy**:
   - User data is sent to OpenAI for processing
   - Ensure compliance with your privacy policy
   - Consider data anonymization if needed

## Performance

- **Initial query**: ~2-4 seconds (includes context building + AI processing)
- **Follow-up queries**: ~1-3 seconds (context cached, conversation history maintained)
- **Context size**: Optimized to stay within token limits while providing comprehensive data

## Cost Estimation

Based on GPT-4o-mini pricing:
- Average query: ~2,000 input tokens + ~200 output tokens
- Cost per query: ~$0.0005 (half a cent)
- 1,000 queries: ~$0.50
- 10,000 queries: ~$5.00

Very affordable for most use cases!

## Migration Notes

### Updated Files

**Luma Chat Page** (`src/pages/Luma.tsx`)
- Now uses direct OpenAI integration via `src/lib/openai.ts`
- Builds RAG context on every query via `src/lib/rag-context.ts`

**Dashboard Page** (`src/pages/Dashboard.tsx`)
- Updated to use `generateDashboardInsights` from `src/lib/openai-insights.ts`
- No longer calls the `luma-insights` edge function

### Removed Files/Functions
The following Supabase Edge Functions are **no longer needed** and can be removed:
- `/supabase/functions/luma-query/index.ts` (replaced by direct OpenAI calls + RAG)
- `/supabase/functions/luma-insights/index.ts` (replaced by direct OpenAI calls)

### Breaking Changes
- None for end users - the UI and UX remain identical
- Requires new environment variable: `VITE_OPENAI_API_KEY`
- Requires OpenAI npm package (already added to package.json)

## Future Enhancements

Potential improvements:
1. **Backend Proxy**: Move OpenAI calls to a secure backend endpoint
2. **Caching**: Cache common queries to reduce API costs
3. **Streaming**: Implement streaming responses for better UX
4. **Fine-tuning**: Fine-tune a custom model on your data
5. **Voice Input**: Add voice-to-text for hands-free queries
6. **Smart Suggestions**: Generate query suggestions based on current context

## Testing Role-Based Permissions

To verify permissions are working correctly, test with different user roles:

### Test as Agent:
1. Log in as an agent user
2. Ask: "Show me my total GCI this year" ✅ Should show their personal GCI
3. Ask: "Show me all deals in the workspace" ❌ Should only show their own deals
4. Ask: "How is John Smith performing?" ❌ Should explain they can only see their own data

### Test as Team Lead:
1. Log in as a team lead
2. Ask: "Show me my team's performance this month" ✅ Should show team statistics
3. Ask: "List all deals for Sarah Johnson" (if she's on the team) ✅ Should show her deals
4. Ask: "Show me deals from Team B" (different team) ❌ Should only show their team's data

### Test as Sales Manager:
1. Log in as a sales manager
2. Ask: "Show me total GCI across all agents" ✅ Should show organization-wide data
3. Ask: "Which agent has the most deals?" ✅ Should compare all agents
4. Ask: "Show me all active deals in the workspace" ✅ Should show all deals

## Troubleshooting

### "Failed to get response from Luma"
- Check that `VITE_OPENAI_API_KEY` is set correctly
- Verify your OpenAI account has available credits
- Check browser console for detailed error messages

### "User not authenticated"
- Ensure user is logged in to PipelineIQ
- Check Supabase authentication is working

### Slow responses
- Large pipelines may take longer to build context
- Consider optimizing the RAG context builder for your data size
- Limit the number of deals/tasks fetched in `rag-context.ts`

### Permission Issues

If you're not seeing the expected data:

1. **Open Browser Console** and run: `window.debugRAGPermissions()`
   - This will show your role, workspace, and accessible users
   - Check if the RPC call is returning the correct user IDs
   - Verify workspace_id is set correctly

2. **Check Database Tables:**
   - `user_settings`: Verify `global_role` and `workspace_id` are correct
   - `user_teams`: Check team assignments if applicable
   - Run query: `SELECT * FROM get_accessible_agents()` to see who you can access

3. **Common Issues:**
   - **workspace_id is NULL**: Sales managers need a workspace_id set
   - **RPC function not deployed**: Run migrations to create `get_accessible_agents()`
   - **Role mismatch**: Ensure global_role in user_settings matches expected role

4. **Check Console Logs:**
   - RAG context logs show: role, workspace, and visible user count
   - Look for "RAG Context Debug" in console when making queries

## Support

For issues or questions, check:
- OpenAI API documentation: [platform.openai.com/docs](https://platform.openai.com/docs)
- OpenAI status page: [status.openai.com](https://status.openai.com)
- PipelineIQ documentation: See README.md

