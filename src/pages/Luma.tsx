import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Plus, ArrowUp, RefreshCw, ChevronDown, MessageSquare, RotateCcw } from 'lucide-react';
import { queryLuma } from '../lib/openai';
import { buildRAGContext } from '../lib/rag-context';
import '../lib/rag-debug';
import { MetricTile } from '../ui/MetricTile';
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

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

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
    loadConversation,
    refreshContext
  } = useLumaChat();

  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const stored = sessionStorage.getItem('luma-conversations');
      if (stored) {
        const parsed = JSON.parse(stored) as Conversation[];
        if (parsed.length > 0) return parsed;
      }
    } catch { /* ignore parse errors */ }
    const now = Date.now();
    return [{ id: createMessageId(), title: 'New chat', messages: [], updatedAt: now }];
  });
  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    const stored = sessionStorage.getItem('luma-active-conversation');
    if (stored && conversations.some((c) => c.id === stored)) return stored;
    return conversations[0].id;
  });
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

  const buildTitle = useCallback((nextMessages: Message[]) => {
    const firstUser = nextMessages.find((m) => m.role === 'user');
    if (!firstUser) return 'New chat';
    return firstUser.content.length > 36
      ? `${firstUser.content.slice(0, 36).trim()}…`
      : firstUser.content;
  }, []);

  const handleNewChat = useCallback(() => {
    const now = Date.now();
    const newConversation: Conversation = {
      id: createMessageId(),
      title: 'New chat',
      messages: [],
      updatedAt: now
    };
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
    clearChat();
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      resizeTextarea(textareaRef.current);
    });
  }, [clearChat]);

  // Persist conversations to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('luma-conversations', JSON.stringify(conversations));
    } catch { /* storage full or unavailable */ }
  }, [conversations]);

  useEffect(() => {
    try {
      sessionStorage.setItem('luma-active-conversation', activeConversationId);
    } catch { /* storage full or unavailable */ }
  }, [activeConversationId]);

  // Sync messages into the active conversation
  useEffect(() => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConversationId) return c;
        return { ...c, messages, title: buildTitle(messages), updatedAt: Date.now() };
      })
    );
  }, [activeConversationId, buildTitle, messages]);

  // Load conversation when switching
  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? conversations[0],
    [activeConversationId, conversations]
  );

  useEffect(() => {
    if (!activeConversation) return;
    loadConversation(activeConversation.messages);
  }, [activeConversationId, loadConversation]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
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
      if (contextMeta.dealCount !== undefined) parts.push(`${contextMeta.dealCount} deals`);
      if (contextMeta.taskCount !== undefined) parts.push(`${contextMeta.taskCount} tasks`);
      return `${parts.join(', ')} · ${updatedLabel}`;
    }
    return updatedLabel;
  }, [contextMeta, lastUpdatedAt]);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Chat history sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-gray-200 bg-gray-50/50 flex flex-col">
        <div className="px-4 py-4 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Chats</span>
          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#D4883A] transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveConversationId(conversation.id)}
                className={`w-full text-left rounded-lg px-3 py-2.5 transition ${
                  isActive
                    ? 'bg-white shadow-sm border border-gray-200'
                    : 'hover:bg-white/60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? 'text-[#D4883A]' : 'text-gray-400'}`} />
                  <span className={`text-sm truncate ${isActive ? 'font-medium text-[#1e3a5f]' : 'text-gray-600'}`}>
                    {conversation.title}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
      {/* Scrollable messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          /* Empty state — centered */
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(212,136,58,0.1)] mb-5">
              <Sparkles className="h-7 w-7 text-[#D4883A]" />
            </div>
            <h1 className="text-2xl font-semibold text-[#1e3a5f] mb-2">Luma AI</h1>
            <p className="text-sm text-gray-500 max-w-md mb-8">
              Ask anything about your deals, pipeline, tasks, or performance. Luma has full context of your workspace.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 max-w-lg w-full">
              {suggestedQueries.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSelectPrompt(prompt)}
                  className="text-left text-sm text-gray-600 rounded-xl border border-gray-200 px-4 py-3 transition hover:border-[#D4883A]/30 hover:bg-[rgba(212,136,58,0.04)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="max-w-3xl mx-auto w-full px-6 py-6 space-y-5">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-start gap-3 max-w-[80%]">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(212,136,58,0.1)] flex-shrink-0 mt-0.5">
                    <Sparkles className="h-4 w-4 text-[#D4883A]" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-3">
                    <div className="flex items-center gap-1.5" role="status" aria-live="polite">
                      <span className="sr-only">Luma is typing</span>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0.1s' }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom input area */}
      <div className="flex-shrink-0 px-6 pb-5 pt-2">
        <div className="max-w-3xl mx-auto w-full">
          <form onSubmit={submitMessage}>
            <div className="relative flex items-end gap-3 rounded-full border border-gray-200 bg-white pl-4 pr-1.5 py-1.5 shadow-sm focus-within:border-gray-300 focus-within:shadow-md transition-shadow">
              <button
                type="button"
                onClick={handleNewChat}
                className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition mb-0.5"
                title="New chat"
              >
                <Plus className="h-5 w-5" strokeWidth={1.5} />
              </button>
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
                className="flex-1 resize-none bg-transparent outline-none text-sm text-[#1e3a5f] placeholder:text-gray-400 py-1.5"
                style={{ maxHeight: `${MAX_TEXTAREA_HEIGHT}px` }}
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={!input.trim()}
                className="flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-full bg-[#1e3a5f] text-white transition disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#162d4a] mb-0.5"
              >
                <ArrowUp className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
          </form>
          {/* Context status line */}
          <div className="flex items-center justify-center gap-2 mt-2.5">
            <button
              type="button"
              onClick={refreshContext}
              disabled={contextStatus === 'updating'}
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition"
            >
              <RefreshCw className={`h-3 w-3 ${contextStatus === 'updating' ? 'animate-spin' : ''}`} />
              <span>
                {contextStatus === 'error'
                  ? 'Context failed — click to retry'
                  : contextStatus === 'updating'
                  ? 'Updating context...'
                  : contextLine}
              </span>
            </button>
          </div>
        </div>
      </div>
      </div>
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

  const loadConversation = useCallback((nextMessages: Message[]) => {
    updateMessages(nextMessages);
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
    loadConversation,
    refreshContext
  };
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {isUser ? (
        /* User message — right side, light gray bubble */
        <div className="max-w-[80%]">
          <div className="bg-gray-100 text-[#1e3a5f] rounded-2xl rounded-tr-md px-4 py-3">
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      ) : (
        /* Assistant message — left side, with avatar */
        <div className="flex items-start gap-3 max-w-[80%]">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(212,136,58,0.1)] flex-shrink-0 mt-0.5">
            <Sparkles className="h-4 w-4 text-[#D4883A]" />
          </div>
          <div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-3">
              <div className="text-sm text-[#1e3a5f] whitespace-pre-wrap">
                {renderMessageContent(message.content)}
              </div>
            </div>
            {message.supportingData && (
              <div className="mt-2">
                <SupportingStatsBlock data={message.supportingData} />
              </div>
            )}
          </div>
        </div>
      )}
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
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {knownStats.map((stat) => (
          <MetricTile
            key={stat.key}
            label={stat.label}
            value={stat.format(data[stat.key] as number)}
          />
        ))}
      </div>

      {extraStats.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition"
          >
            <span>More stats</span>
            <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? 'rotate-180' : ''}`} />
          </button>
          {expanded && (
            <div className="grid gap-2 sm:grid-cols-2">
              {extraStats.map(([key, value]) => (
                <MetricTile
                  key={key}
                  label={formatLabel(key)}
                  value={formatNumber(value as number)}
                />
              ))}
            </div>
          )}
        </div>
      )}
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
        <strong key={`${part}-${index}`} className="font-semibold text-[#1e3a5f]">
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
