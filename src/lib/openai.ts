import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

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
    in_progress?: number;
    team_members?: number;
    [key: string]: number | undefined;
  };
}

/**
 * Send a query to OpenAI with RAG context
 */
export async function queryLuma(
  userQuery: string,
  context: string,
  conversationHistory: ChatMessage[] = []
): Promise<LumaResponse> {
  try {
    // Build the system prompt with RAG context
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
  "in_progress": 4,
  "team_members": 3
}
<<<END_SUPPORTING_DATA>>>

Only include the metrics that are relevant to the user's query. If no metrics are needed, don't include the supporting data section.`;

    // Build messages array
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-6), // Keep last 6 messages for context
      { role: 'user', content: userQuery }
    ];

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
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
      // Remove the supporting data section from the answer
      answer = responseContent
        .replace(/<<<SUPPORTING_DATA>>>[\s\S]*?<<<END_SUPPORTING_DATA>>>/, '')
        .trim();

      // Parse the supporting data JSON
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
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error('Failed to get response from Luma. Please try again.');
  }
}
