import { useState } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { queryLuma } from '../lib/openai';
import { buildRAGContext } from '../lib/rag-context';
import '../lib/rag-debug'; // Enable debug helper in console

interface SupportingData {
  total_deals?: number;
  total_gci?: number;
  closed_deals?: number;
  active_deals?: number;
  under_contract?: number;
  team_members?: number;
  [key: string]: number | undefined;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  supportingData?: SupportingData;
  debugInfo?: {
    step1_intent: string;
    step2_query: string;
    step3_data: any;
  };
}

const surfaceClass =
  'rounded-2xl border border-gray-200/70 bg-white/90 shadow-[0_8px_20px_rgba(15,23,42,0.08)]';
const suggestionPillClass =
  'inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/80 px-4 py-1.5 text-sm font-medium text-gray-700 shadow-inner transition hover:-translate-y-0.5 hover:border-[var(--app-accent)]/40 hover:text-gray-900';

export default function Luma() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const suggestedQueries = [
    'Show me the deals expected to close this month.',
    'Which clients need new activity this week?',
    'Summarize my pipeline stage mix.',
    'How is my projected GCI pacing for Q3?',
    'Who owns the next step on the Torres deal?'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Build RAG context from Supabase data
      const context = await buildRAGContext();

      // Get conversation history for context
      const conversationHistory = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content
      }));

      // Query OpenAI with RAG context
      const response = await queryLuma(
        userMessage.content,
        context,
        conversationHistory
      );

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.answer,
        supportingData: response.supportingData
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Luma query error:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.'
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestedQuery = (query: string) => {
    setInput(query);
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <section className={`${surfaceClass} space-y-4 bg-white/95 px-6 py-6 sm:px-8 sm:py-8`}>
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-500">Luma AI</p>
            <h1 className="text-3xl font-semibold text-gray-900">Chat with your data-aware copilot</h1>
            <p className="max-w-3xl text-sm text-gray-600">
              Ask natural questions about deals, tasks, lead sources, or performance and get calm answers without breaking your
              workflow. Luma keeps context from your workspace so you can move quickly.
            </p>
          </div>
          <button
            onClick={() => setShowDebug(!showDebug)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${
              showDebug
                ? 'bg-[var(--app-accent)] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {showDebug ? '🔍 Hide Debug' : '🔍 Show Debug'}
          </button>
        </div>
      </section>

      <section className={`${surfaceClass} flex flex-1 flex-col overflow-hidden bg-gradient-to-b from-[#f5f9ff] to-white`}>
        <div className="border-b border-white/60 px-4 py-5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-500">Conversation</p>
          <p className="mt-1 text-sm text-gray-600">
            Bring up deals, follow-ups, or performance goals—Luma replies with grounded insight.
          </p>
        </div>

        <div className="border-b border-white/60 px-4 py-4 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gray-400">Starter prompts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestedQueries.map((query, index) => (
              <button key={index} type="button" onClick={() => handleSuggestedQuery(query)} className={suggestionPillClass}>
                <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                {query}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6 pr-2 sm:px-6">
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-3xl rounded-3xl px-5 py-4 ${
                  message.role === 'user'
                    ? 'bg-[var(--app-accent)] text-white shadow-[0_25px_50px_rgba(0,122,255,0.25)]'
                    : 'border border-white/80 bg-white/90 shadow-[0_15px_30px_rgba(15,23,42,0.08)]'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="mb-3 flex items-center gap-2 text-gray-500">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--app-accent)]/10 text-[var(--app-accent)]">
                      <Sparkles className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide">Luma</span>
                  </div>
                )}

                <div
                  className={`whitespace-pre-wrap text-sm leading-relaxed ${
                    message.role === 'user' ? 'text-white' : 'text-gray-900'
                  }`}
                >
                  {message.content}
                </div>

                {message.supportingData && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {message.supportingData.total_deals !== undefined && (
                        <SupportingStat label="Total Deals" value={message.supportingData.total_deals} accent="blue" />
                      )}
                      {message.supportingData.total_gci !== undefined && (
                        <SupportingStat
                          label="Total GCI"
                          value={`$${message.supportingData.total_gci.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                          accent="green"
                        />
                      )}
                      {message.supportingData.closed_deals !== undefined && (
                        <SupportingStat label="Closed Deals" value={message.supportingData.closed_deals} accent="indigo" />
                      )}
                      {message.supportingData.active_deals !== undefined && (
                        <SupportingStat label="Active Deals" value={message.supportingData.active_deals} accent="orange" />
                      )}
                      {message.supportingData.under_contract !== undefined && (
                        <SupportingStat label="Under Contract" value={message.supportingData.under_contract} accent="purple" />
                      )}
                      {message.supportingData.team_members !== undefined && (
                        <SupportingStat label="Team Members" value={message.supportingData.team_members} accent="teal" />
                      )}
                    </div>
                  </div>
                )}

                {message.debugInfo && showDebug && (
                  <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Debug Info</div>
                    
                    <div className="rounded-lg bg-blue-50 p-3">
                      <div className="text-xs font-semibold text-blue-900">Step 1: Intent Understanding</div>
                      <div className="mt-1 text-xs text-blue-800">{message.debugInfo.step1_intent}</div>
                    </div>
                    
                    <div className="rounded-lg bg-purple-50 p-3">
                      <div className="text-xs font-semibold text-purple-900">Step 2: SQL Query</div>
                      <pre className="mt-1 overflow-x-auto text-[10px] text-purple-800">{message.debugInfo.step2_query}</pre>
                    </div>
                    
                    <div className="rounded-lg bg-green-50 p-3">
                      <div className="text-xs font-semibold text-green-900">
                        Step 3: Data Retrieved ({Array.isArray(message.debugInfo.step3_data) ? message.debugInfo.step3_data.length : 0} records)
                      </div>
                      <pre className="mt-1 max-h-40 overflow-auto text-[10px] text-green-800">
                        {JSON.stringify(message.debugInfo.step3_data, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="max-w-3xl rounded-3xl border border-white/80 bg-white/90 px-5 py-4 shadow-[0_15px_30px_rgba(15,23,42,0.08)]">
                <div className="mb-2 flex items-center gap-2 text-gray-500">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--app-accent)]/10 text-[var(--app-accent)]">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide">Luma</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0.1s' }} />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-white/60 bg-white/80 px-4 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-3">
            <div className="flex-1">
              <div className="rounded-2xl border border-[#d0e2ff] bg-white px-4 py-3 shadow-inner focus-within:border-[var(--app-accent)]/40 focus-within:ring-2 focus-within:ring-[var(--app-accent)]/15">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Luma anything about your pipeline..."
                  className="w-full border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                  disabled={loading}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[rgb(0,122,255)] px-6 py-3 text-sm font-semibold text-white shadow-[0_20px_40px_rgba(0,122,255,0.35)] transition hover:bg-[rgb(0,100,210)] disabled:opacity-60 md:flex-shrink-0"
            >
              <Send className="h-4 w-4" />
              <span>Send</span>
            </button>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">Enter to send • Luma respects the same roles as PipelineIQ.</p>
        </form>
      </section>
    </div>
  );
}

const accentMap = {
  blue: 'from-blue-50 to-blue-100 text-blue-900',
  green: 'from-emerald-50 to-emerald-100 text-emerald-900',
  indigo: 'from-indigo-50 to-indigo-100 text-indigo-900',
  orange: 'from-orange-50 to-orange-100 text-orange-900',
  purple: 'from-purple-50 to-purple-100 text-purple-900',
  teal: 'from-teal-50 to-teal-100 text-teal-900'
} as const;

function SupportingStat({
  label,
  value,
  accent
}: {
  label: string;
  value: string | number;
  accent: keyof typeof accentMap;
}) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${accentMap[accent]} px-4 py-3`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}
