import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Send, RotateCcw, RefreshCw, ChevronDown } from 'lucide-react';
import { queryLuma } from '../lib/openai';
import { buildRAGContext } from '../lib/rag-context';
import '../lib/rag-debug'; // Enable debug helper in console

interface SupportingData {
  total_deals?: number;
  total_gci?: number;
  closed_deals?: number;
  active_deals?: number;
  in_progress?: number;
  team_members?: number;
  [key: string]: number | undefined;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  supportingData?: SupportingData;
}

type ContextStatus = 'idle' | 'updating' | 'ready' | 'error';

const surfaceClass =
  'rounded-2xl border border-gray-200/70 bg-white/90 shadow-[0_8px_20px_rgba(15,23,42,0.08)]';

const suggestionPillClass =
  'inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-[var(--app-accent)]/40 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40';

const MAX_TEXTAREA_HEIGHT = 160;

const KNOWN_STATS: Array<{
  key: keyof SupportingData;
  label: string;
  format: (value: number) => string;
}> = [
  { key: 'total_deals', label: 'Total deals', format: formatNumber },
  { key: 'total_gci', label: 'Total GCI', format: formatCurrency },
  { key: 'closed_deals', label: 'Closed deals', format: formatNumber },
  { key: 'active_deals', label: 'Active deals', format: formatNumber },
  { key: 'in_progress', label: 'In progress', format: formatNumber },
  { key: 'team_members', label: 'Team members', format: formatNumber }
];

const suggestedQueries = [
  'Show me the deals expected to close this month.',
  'Which clients need new activity this week?',
  'Summarize my pipeline stage mix.',
  'How is my projected GCI pacing for Q3?',
];

export default function Luma() {
  const {
    messages,
    input,
    loading,
    contextStatus,
    lastUpdatedAt,
    contextMeta,
    submitMessage,
    setInput,
    clearChat,
    refreshContext
  } = useLumaChat();

  const [showPrompts, setShowPrompts] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const hasMessages = messages.length > 0;

  const handleSelectPrompt = useCallback((prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      resizeTextarea(textareaRef.current);
    });
  }, [setInput]);

  const handleClearChat = useCallback(() => {
    clearChat();
    setShowPrompts(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      resizeTextarea(textareaRef.current);
    });
  }, [clearChat]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  useEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [input]);

  const contextLine = useMemo(() => {
    const updatedLabel = lastUpdatedAt
      ? `Updated ${new Date(lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'Context not ready';
    if (contextMeta.dealCount !== undefined || contextMeta.taskCount !== undefined) {
      const parts: string[] = [];
      if (contextMeta.dealCount !== undefined) {
        parts.push(`${contextMeta.dealCount} deals`);
      }
      if (contextMeta.taskCount !== undefined) {
        parts.push(`${contextMeta.taskCount} tasks`);
      }
      return `Based on: ${parts.join(', ')} • ${updatedLabel}`;
    }
    return `Context updated • ${updatedLabel}`;
  }, [contextMeta, lastUpdatedAt]);

  return (
    <div className="flex h-full flex-col gap-6">
      <section className={`${surfaceClass} px-6 py-5 sm:px-8`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-400">Luma AI</p>
            <h1 className="text-2xl font-semibold text-gray-900">Chat with your data-aware copilot</h1>
            <p className="max-w-2xl text-sm text-gray-600">
              Ask natural questions about deals, tasks, lead sources, or performance. Luma keeps context from your workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearChat}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40"
          >
            <RotateCcw className="h-4 w-4" />
            New chat
          </button>
        </div>
      </section>

      <section className={`${surfaceClass} flex flex-1 flex-col overflow-hidden bg-white`}>
        <div className="border-b border-gray-100 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-400">Conversation</p>
              <p className="mt-1 text-sm text-gray-600">
                Bring up deals, follow-ups, or performance goals. Luma replies with grounded insight.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshContext}
              disabled={contextStatus === 'updating'}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40"
            >
              <RefreshCw className={`h-4 w-4 ${contextStatus === 'updating' ? 'animate-spin' : ''}`} />
              Refresh context
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {!hasMessages && showPrompts && (
            <StarterPrompts
              prompts={suggestedQueries}
              onSelect={handleSelectPrompt}
              onDismiss={() => setShowPrompts(false)}
            />
          )}

          <div className="space-y-6">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {loading && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--app-accent)]/10 text-[var(--app-accent)]">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1.5" role="status" aria-live="polite">
                    <span className="sr-only">Luma is typing</span>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0.1s' }} />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-gray-100 bg-white/95 backdrop-blur">
          <form onSubmit={submitMessage} className="px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3">
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm focus-within:border-[var(--app-accent)]/50 focus-within:ring-2 focus-within:ring-[var(--app-accent)]/20">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onInput={(e) => resizeTextarea(e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitMessage(e);
                    }
                  }}
                  placeholder="Ask Luma anything about your pipeline..."
                  aria-label="Message Luma"
                  rows={1}
                  className="w-full resize-none border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                  style={{ maxHeight: `${MAX_TEXTAREA_HEIGHT}px` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                <span aria-live="polite">
                  {contextStatus === 'error'
                    ? 'Context failed to update.'
                    : contextStatus === 'updating'
                    ? 'Updating context...'
                    : contextLine}
                </span>
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={!input.trim()}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--app-accent)] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[rgb(0,100,210)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40"
                >
                  {loading ? <span className="text-xs">Sending</span> : <span>Send</span>}
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

function useLumaChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [contextStatus, setContextStatus] = useState<ContextStatus>('idle');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [contextMeta, setContextMeta] = useState<{ dealCount?: number; taskCount?: number }>({});

  const messagesRef = useRef<Message[]>([]);
  const contextRef = useRef<string | null>(null);
  const contextPromiseRef = useRef<Promise<string> | null>(null);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const updateMessages = useCallback((nextMessages: Message[]) => {
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
  }, []);

  const buildContext = useCallback(async () => {
    setContextStatus('updating');
    try {
      const result = await buildRAGContext();
      contextRef.current = result.context;
      setContextMeta(result.meta ?? {});
      setLastUpdatedAt(Date.now());
      setContextStatus('ready');
      return result.context;
    } catch (error) {
      setContextStatus('error');
      throw error;
    }
  }, []);

  const ensureContext = useCallback(async () => {
    if (contextRef.current) return contextRef.current;
    if (!contextPromiseRef.current) {
      setContextStatus('updating');
      contextPromiseRef.current = buildRAGContext()
        .then((result) => {
          contextRef.current = result.context;
          setContextMeta(result.meta ?? {});
          setLastUpdatedAt(Date.now());
          setContextStatus('ready');
          return result.context;
        })
        .catch((error) => {
          setContextStatus('error');
          throw error;
        })
        .finally(() => {
          contextPromiseRef.current = null;
        });
    }
    return contextPromiseRef.current;
  }, []);

  const refreshContext = useCallback(async () => {
    try {
      await buildContext();
    } catch (error) {
      setContextStatus('error');
    }
  }, [buildContext]);

  const submitMessage = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage: Message = {
      id: createMessageId(),
      role: 'user',
      content: trimmed
    };
    const nextMessages = [...messagesRef.current, userMessage];
    updateMessages(nextMessages);
    setInput('');

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const context = await ensureContext();
      const conversationHistory = nextMessages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content
      }));
      const response = await queryLuma(
        userMessage.content,
        context,
        conversationHistory,
        { signal: controller.signal }
      );

      if (requestId !== requestIdRef.current) return;
      const assistantMessage: Message = {
        id: createMessageId(),
        role: 'assistant',
        content: response.answer,
        supportingData: response.supportingData
      };
      updateMessages([...nextMessages, assistantMessage]);
    } catch (error) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      const errorMessage: Message = {
        id: createMessageId(),
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.'
      };
      updateMessages([...nextMessages, errorMessage]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [ensureContext, input, updateMessages]);

  const clearChat = useCallback(() => {
    updateMessages([]);
    setInput('');
    setLoading(false);
  }, [updateMessages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    refreshContext();
  }, [refreshContext]);

  return {
    messages,
    input,
    loading,
    contextStatus,
    lastUpdatedAt,
    contextMeta,
    submitMessage,
    setInput,
    clearChat,
    refreshContext,
    contextRef,
    requestIdRef,
    abortControllerRef
  };
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-3xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-[var(--app-accent)] text-white shadow-[0_12px_30px_rgba(0,122,255,0.2)]'
            : 'border border-gray-200 bg-white text-gray-900 shadow-sm'
        }`}
      >
        {!isUser && (
          <div className="mb-3 flex items-center gap-2 text-gray-500">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--app-accent)]/10 text-[var(--app-accent)]">
              <Sparkles className="h-4 w-4" strokeWidth={2} />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide">Luma</span>
          </div>
        )}

        <div className={`whitespace-pre-wrap ${isUser ? 'text-white' : 'text-gray-800'}`}>
          {renderMessageContent(message.content)}
        </div>

        {message.supportingData && (
          <SupportingStatsBlock data={message.supportingData} />
        )}
      </div>
    </div>
  );
}

function SupportingStatsBlock({ data }: { data: SupportingData }) {
  const [expanded, setExpanded] = useState(false);
  const knownStats = KNOWN_STATS.filter((stat) => data[stat.key] !== undefined);
  const knownKeys = new Set(knownStats.map((stat) => stat.key));
  const extraStats = Object.entries(data).filter(
    ([key, value]) => !knownKeys.has(key as keyof SupportingData) && typeof value === 'number'
  );

  if (knownStats.length === 0 && extraStats.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {knownStats.map((stat) => (
          <div key={stat.key} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">{stat.label}</div>
            <div className="text-base font-semibold text-gray-900">
              {stat.format(data[stat.key] as number)}
            </div>
          </div>
        ))}
      </div>

      {extraStats.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40"
          >
            More stats
            <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} />
          </button>
          {expanded && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {extraStats.map(([key, value]) => (
                <div key={key} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">{formatLabel(key)}</div>
                  <div className="text-base font-semibold text-gray-900">{formatNumber(value as number)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StarterPrompts({
  prompts,
  onSelect,
  onDismiss
}: {
  prompts: string[];
  onSelect: (prompt: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">Starter prompts</p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-semibold text-gray-500 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40"
        >
          Hide
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelect(prompt)}
            className={suggestionPillClass}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--app-accent)]/40" />
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatNumber(value: number) {
  return value.toLocaleString('en-US');
}

function formatLabel(label: string) {
  return label.replace(/_/g, ' ');
}

function renderMessageContent(content: string) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  if (parts.length === 1) return content;
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-gray-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function createMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT);
  textarea.style.height = `${nextHeight}px`;
}
