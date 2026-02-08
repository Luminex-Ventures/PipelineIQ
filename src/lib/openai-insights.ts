import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

export interface DashboardStats {
  ytdGCI: number;
  ytdDeals: number;
  ytdVolume: number;
  avgCommission: number;
  closingThisMonth: number;
  conversionRate: number;
}

export interface PipelineHealth {
  id: string;
  name: string;
  count: number;
  expectedGCI: number;
  stalledCount: number;
}

export interface LeadSourceData {
  name: string;
  deals: number;
  gci: number;
}

export interface MonthlyData {
  month: string;
  gci: number;
  deals: number;
}

export interface InsightsRequest {
  stats: DashboardStats;
  pipelineHealth: PipelineHealth[];
  leadSourceData: LeadSourceData[];
  monthlyData: MonthlyData[];
  upcomingDealsCount: number;
  projectedGCI: number;
  audienceLabel: string;
  audienceMode: 'self' | 'group';
  filterSummary: string;
}

/**
 * Generate AI insights from dashboard data
 */
export async function generateDashboardInsights(data: InsightsRequest): Promise<string[]> {
  try {
    const prompt = buildInsightsPrompt(data);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are Luma, an AI assistant for real estate agents. Address the audience based on the provided audience instructions. Avoid phrasing like "the agent" or "the agent\'s". Provide concise, actionable insights based on the dashboard data. Focus on trends, risks, opportunities, and next steps. Do NOT restate dashboard metrics or repeat numbers that are already visible elsewhere; avoid raw counts, dollar amounts, or percentages unless absolutely necessary to make a recommendation. Keep each insight to 1-2 sentences. Return 2-4 insights as a JSON array of strings. Do not wrap your response in markdown code blocks.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    let content = completion.choices[0]?.message?.content || '';

    // Remove markdown code block formatting if present
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let insights: string[];
    try {
      insights = JSON.parse(content);
      // Ensure it's an array
      if (!Array.isArray(insights)) {
        insights = [content];
      }
    } catch {
      // If parsing fails, split by newlines and filter
      insights = content
        .split('\n')
        .filter((line: string) => line.trim().length > 0 && !line.includes('[') && !line.includes(']'));
    }

    return insights;
  } catch (error) {
    console.error('OpenAI insights error:', error);
    throw new Error('Failed to generate insights. Please try again.');
  }
}

function buildInsightsPrompt(data: InsightsRequest): string {
  const {
    stats,
    pipelineHealth,
    leadSourceData,
    monthlyData,
    upcomingDealsCount,
    projectedGCI,
    audienceLabel,
    audienceMode,
    filterSummary
  } = data;

  let prompt = `Analyze this real estate dashboard data and provide 2-4 actionable insights.\n`;
  prompt += `Audience: ${audienceLabel}\n`;
  prompt += `Filter context: ${filterSummary}\n`;
  if (audienceMode === 'self') {
    prompt += `Address the audience directly in second person (use "you" and "your").\n\n`;
  } else {
    prompt += `Address the audience as a group by name (e.g., "Nora and Charles are...", "The team is..."). Do not use second-person ("you/your"). Avoid third-person generic phrases like "the agent".\n\n`;
  }

  prompt += `Important: Do NOT restate exact dashboard metrics, totals, or raw counts. Focus on analysis, implications, risks, opportunities, and next steps derived from the data.\n\n`;

  prompt += `Performance Metrics (for analysis only, do not quote directly):\n`;
  prompt += `- YTD GCI: $${stats.ytdGCI.toLocaleString()}\n`;
  prompt += `- Closed Deals: ${stats.ytdDeals}\n`;
  prompt += `- Average Commission: $${stats.avgCommission.toLocaleString()}\n`;
  prompt += `- Conversion Rate: ${(stats.conversionRate * 100).toFixed(1)}%\n`;
  prompt += `- Closing This Month: ${stats.closingThisMonth} deals\n\n`;

  if (monthlyData.length >= 2) {
    const recent = monthlyData.slice(-3);
    prompt += `Recent Monthly Trend (for analysis only, do not quote directly):\n`;
    recent.forEach(m => {
      prompt += `- ${m.month}: ${m.deals} deals, $${m.gci.toLocaleString()} GCI\n`;
    });
    prompt += `\n`;
  }

  if (pipelineHealth.length > 0) {
    const totalActive = pipelineHealth.reduce((sum, s) => sum + s.count, 0);
    const totalStalled = pipelineHealth.reduce((sum, s) => sum + s.stalledCount, 0);
    prompt += `Pipeline Health (for analysis only, do not quote directly):\n`;
    prompt += `- Total Active Deals: ${totalActive}\n`;
    prompt += `- Total Stalled (30+ days): ${totalStalled}\n`;
    pipelineHealth.forEach(status => {
      if (status.count > 0) {
        prompt += `  • ${status.name}: ${status.count} deals`;
        if (status.stalledCount > 0) {
          prompt += ` (${status.stalledCount} stalled)`;
        }
        prompt += `\n`;
      }
    });
    prompt += `\n`;
  }

  if (leadSourceData.length > 0) {
    prompt += `Top Lead Sources (for analysis only, do not quote directly):\n`;
    leadSourceData.slice(0, 3).forEach((source, idx) => {
      prompt += `${idx + 1}. ${source.name}: ${source.deals} deals, $${source.gci.toLocaleString()} GCI\n`;
    });
    prompt += `\n`;
  }

  if (upcomingDealsCount > 0) {
    prompt += `Upcoming (for analysis only, do not quote directly): ${upcomingDealsCount} deals projected to close with $${projectedGCI.toLocaleString()} potential GCI\n\n`;
  }

  prompt += `Provide insights as a JSON array of 2-4 strings. Focus on:\n`;
  prompt += `1. Performance trends (improving/declining)\n`;
  prompt += `2. Risks or bottlenecks (pipeline friction, stalled risk)\n`;
  prompt += `3. Opportunities (channel mix, stage movement)\n`;
  prompt += `4. Clear next steps or strategic recommendations\n\n`;
  prompt += `Avoid repeating any dashboard numbers. Use "so what" framing.\n\n`;
  prompt += `Format: ["insight 1", "insight 2", "insight 3"]`;

  return prompt;
}
