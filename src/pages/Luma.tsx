import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Send, RotateCcw, RefreshCw, ChevronDown } from 'lucide-react';
import { queryLuma } from '../lib/openai';
import { buildRAGContext } from '../lib/rag-context';
import '../lib/rag-debug'; // Enable debug helper in console
import { PageShell } from '../ui/PageShell';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';
import { ui } from '../ui/tokens';

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

const surfaceClass = [ui.radius.card, ui.border.card, ui.shadow.card, 'bg-white/90'].join(' ');

const suggestionPillClass = [
  'inline-flex items-center gap-2 bg-white transition focus-visible:outline-none',
  ui.radius.pill,
  ui.border.subtle,
  ui.pad.chip,
  ui.shadow.card
].join(' ');

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
    <PageShell
      title={
        <div className="space-y-2">
          <Text variant="micro">Luma AI</Text>
          <Text as="h1" variant="h1">Chat with your data-aware copilot</Text>
        </div>
      }
      subtitle={
        <Text variant="muted">
          Ask natural questions about deals, tasks, lead sources, or performance. Luma keeps context from your workspace.
        </Text>
      }
      actions={
        <button
          type="button"
          onClick={handleClearChat}
          className={[ui.radius.pill, ui.border.subtle, ui.pad.chip, 'bg-white transition'].join(' ')}
        >
          <div className="inline-flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            <Text as="span" variant="micro" className={ui.tone.muted}>
              New chat
            </Text>
          </div>
        </button>
      }
    >
      <Card className="flex flex-1 flex-col overflow-hidden bg-white" padding="none">
        <div className={[ui.border.subtle, ui.pad.cardTight].join(' ')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <Text variant="micro">Conversation</Text>
              <Text variant="muted">
                Bring up deals, follow-ups, or performance goals. Luma replies with grounded insight.
              </Text>
            </div>
            <button
              type="button"
              onClick={refreshContext}
              disabled={contextStatus === 'updating'}
              className={[ui.radius.pill, ui.border.subtle, ui.pad.chip, 'bg-white transition'].join(' ')}
            >
              <div className="inline-flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 ${contextStatus === 'updating' ? 'animate-spin' : ''}`} />
                <Text as="span" variant="micro" className={ui.tone.muted}>
                  Refresh context
                </Text>
              </div>
            </button>
          </div>
        </div>

        <div ref={scrollRef} className={['flex-1 overflow-y-auto', ui.pad.card].join(' ')}>
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
                <div
                  className={[
                    'flex h-8 w-8 items-center justify-center bg-[var(--app-accent)]/10',
                    ui.radius.pill,
                    ui.tone.accent
                  ].join(' ')}
                >
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className={[ui.radius.card, ui.border.subtle, ui.pad.cardTight, 'bg-white'].join(' ')}>
                  <div className="flex items-center gap-1.5" role="status" aria-live="polite">
                    <span className="sr-only">Luma is typing</span>
                    <div className={['h-2 w-2 animate-bounce bg-gray-400', ui.radius.pill].join(' ')} />
                    <div
                      className={['h-2 w-2 animate-bounce bg-gray-400', ui.radius.pill].join(' ')}
                      style={{ animationDelay: '0.1s' }}
                    />
                    <div
                      className={['h-2 w-2 animate-bounce bg-gray-400', ui.radius.pill].join(' ')}
                      style={{ animationDelay: '0.2s' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur">
          <div className="h-px bg-gray-200/60" />
          <form onSubmit={submitMessage} className={ui.pad.cardTight}>
            <div className="flex flex-col gap-3">
              <div
                className={[
                  ui.radius.card,
                  ui.border.card,
                  ui.pad.cardTight,
                  'bg-white focus-within:ring-2 focus-within:ring-[var(--app-accent)]/20'
                ].join(' ')}
              >
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
                  className={['w-full resize-none bg-transparent outline-none', ui.tone.primary].join(' ')}
                  style={{ maxHeight: `${MAX_TEXTAREA_HEIGHT}px` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text as="span" variant="muted" aria-live="polite">
                  {contextStatus === 'error'
                    ? 'Context failed to update.'
                    : contextStatus === 'updating'
                    ? 'Updating context...'
                    : contextLine}
                </Text>
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={!input.trim()}
                  className={[
                    'inline-flex items-center gap-2 bg-[var(--app-accent)] transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40',
                    ui.radius.pill,
                    ui.pad.chip
                  ].join(' ')}
                >
                  {loading ? (
                    <Text as="span" variant="micro" className={ui.tone.inverse}>Sending</Text>
                  ) : (
                    <Text as="span" variant="micro" className={ui.tone.inverse}>Send</Text>
                  )}
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </Card>
    </PageShell>
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
        className={[
          'max-w-3xl',
          ui.radius.card,
          ui.pad.cardTight,
          isUser ? 'bg-[var(--app-accent)]' : 'bg-white',
          isUser ? ui.shadow.card : ui.border.subtle
        ].join(' ')}
      >
        {!isUser && (
          <div className="flex items-center gap-2">
            <div
              className={[
                'flex h-7 w-7 items-center justify-center bg-[var(--app-accent)]/10',
                ui.radius.pill,
                ui.tone.accent
              ].join(' ')}
            >
              <Sparkles className="h-4 w-4" strokeWidth={2} />
            </div>
            <Text as="span" variant="micro">Luma</Text>
          </div>
        )}

        <Text
          as="div"
          variant="body"
          className={[isUser ? ui.tone.inverse : ui.tone.primary, 'whitespace-pre-wrap'].join(' ')}
        >
          {renderMessageContent(message.content)}
        </Text>

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
    <div className={[ui.radius.card, ui.border.subtle, ui.pad.cardTight, 'bg-gray-50/60 space-y-3'].join(' ')}>
      <div className="grid gap-3 sm:grid-cols-2">
        {knownStats.map((stat) => (
          <Card key={stat.key} padding="cardTight">
            <Text variant="micro">{stat.label}</Text>
            <Text as="div" variant="h2">{stat.format(data[stat.key] as number)}</Text>
          </Card>
        ))}
      </div>

      {extraStats.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40"
          >
            <Text as="span" variant="micro" className={ui.tone.muted}>More stats</Text>
            <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} />
          </button>
          {expanded && (
            <div className="grid gap-3 sm:grid-cols-2">
              {extraStats.map(([key, value]) => (
                <Card key={key} padding="cardTight">
                  <Text variant="micro">{formatLabel(key)}</Text>
                  <Text as="div" variant="h2">{formatNumber(value as number)}</Text>
                </Card>
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
    <Card className="bg-gray-50/70" padding="cardTight" style={{ borderStyle: 'dashed' }}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Text variant="micro">Starter prompts</Text>
          <button
            type="button"
            onClick={onDismiss}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40"
          >
            <Text as="span" variant="micro" className={ui.tone.subtle}>Hide</Text>
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
            <span className={['h-1.5 w-1.5 bg-[var(--app-accent)]/40', ui.radius.pill].join(' ')} />
            <Text as="span" variant="micro" className={ui.tone.muted}>{prompt}</Text>
          </button>
        ))}
        </div>
      </div>
    </Card>
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
        <strong key={`${part}-${index}`} className={['font-semibold', ui.tone.primary].join(' ')}>
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
