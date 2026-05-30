'use client';

import { FormEvent, KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, Check, ChevronLeft, Copy, History, Loader2, Settings2, Square, X } from 'lucide-react';

type AssistantAction = {
  type: 'OPEN_EMPLOYEE' | 'OPEN_PAYSLIP' | 'OPEN_SALARY' | 'OPEN_AI_SETTINGS';
  label: string;
  href: string;
};

type AssistantReply = {
  reply: string;
  actions: AssistantAction[];
  mode: 'rules' | 'ai';
  planContext?: AssistantPlan | null;
};

type AssistantPlan = {
  intent: string;
  year?: number | null;
  month?: number | null;
  employeeId?: number | null;
  employeeName?: string | null;
  employeeFilter?: Record<string, unknown> | null;
  status?: string | null;
  metrics?: string[];
  confidence?: number;
  clarifyingQuestion?: string | null;
};

type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  actions?: AssistantAction[];
  mode?: 'rules' | 'ai';
};

type HistoryItem = {
  id: number;
  userMessage: string;
  assistantReply: string;
  mode: 'ai' | 'rules' | string;
  pageUrl: string | null;
  actions: AssistantAction[] | null;
  createdAt: string;
};

type AIAssistantProps = {
  userKey?: string;
  aiEnabled?: boolean;
  aiConfigured?: boolean;
  aiManuallyDisabled?: boolean;
};

type StoredChatSession = {
  savedAt: number;
  messages: ChatMessage[];
  lastPlan: AssistantPlan | null;
  nextId: number;
};

const CHAT_SESSION_TTL_MS = 30 * 60 * 1000;

function isDesktopViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
}

const QUICK_PROMPTS = [
  '本月有没有异常',
  '谁漏录了',
  '这个月谁工时最多',
  '打开本月工资',
];

function AssistantLogo() {
  const gradientId = `ai-logo-gradient-${useId().replace(/:/g, '')}`;

  return (
    <svg
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="h-full w-full"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#3370FF" />
        </linearGradient>
      </defs>
      <path
        d="M512 0c282.773333 0 512 229.226667 512 512S794.773333 1024 512 1024 0 794.773333 0 512 229.226667 0 512 0z m-0.021333 170.666667c-19.818667 0-39.829333 4.010667-58.773334 12.394666a141.866667 141.866667 0 0 0-65.344 58.026667l-197.973333 336.938667-1.237333 2.154666c-37.845333 67.029333-14.122667 151.786667 53.717333 190.272 68.565333 38.890667 156.245333 15.786667 195.818667-51.584l104.682666-178.176h0.106667l27.904-46.805333a75.157333 75.157333 0 0 1 63.744-41.130667 75.456 75.456 0 0 1 67.498667 34.88l1.152 1.877334 71.701333 122.026666 1.002667 1.770667c19.242667 35.456 6.08 79.509333-29.610667 99.136-35.690667 19.605333-80.789333 7.552-101.44-27.114667l-59.114667 33.536 1.28 2.133334c40.149333 65.706667 126.698667 87.893333 194.538667 49.408l2.154667-1.258667 2.282666-1.344 2.090667-1.322667 2.730667-1.792 1.962666-1.344 3.072-2.197333 1.258667-0.917333a141.653333 141.653333 0 0 0 11.626667-9.770667l4.224-4.117333a140.970667 140.970667 0 0 0 23.509333-31.829334l1.002667-1.856c1.045333-1.984 2.005333-3.989333 2.944-6.016l1.450666-3.242666c2.730667-6.378667 4.992-12.928 6.762667-19.626667l0.597333-2.325333 0.512-2.154667c0.426667-1.92 0.853333-3.882667 1.194667-5.824l0.682667-3.925333a137.472 137.472 0 0 0-5.802667-65.834667l-0.896-2.602667a142.293333 142.293333 0 0 0-10.901333-23.082666l-197.973334-336.917334-1.28-2.133333a141.866667 141.866667 0 0 0-64.085333-55.914667l-4.202667-1.792A144.64 144.64 0 0 0 511.978667 170.666667z m0.832 67.072c10.410667 0.128 20.693333 2.368 30.186666 6.592 14.293333 6.336 26.197333 16.938667 34.026667 30.293333l65.216 111.018667a144.661333 144.661333 0 0 0-75.626667 18.837333 141.504 141.504 0 0 0-57.045333 59.904l-0.512-0.298667-129.984 221.226667-1.066667 1.770667c-21.632 34.069333-67.050667 44.906667-102.165333 24.32a73.066667 73.066667 0 0 1-26.837333-99.84l197.973333-336.917334 1.066667-1.749333c6.506667-10.453333 15.573333-19.136 26.410666-25.258667l1.792-0.981333a76.586667 76.586667 0 0 1 36.565334-8.917333z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}

function initialMessage(): ChatMessage {
  return {
    id: 0,
    role: 'assistant',
    text: '想查员工、工资条或本月异常，直接问我。',
    mode: 'rules',
  };
}

export default function AIAssistant({
  userKey = 'anonymous',
  aiEnabled = false,
  aiConfigured = aiEnabled,
  aiManuallyDisabled = false,
}: AIAssistantProps) {
  const router = useRouter();
  const pathname = usePathname();
  const compactLauncher = pathname?.startsWith('/settings/developer/attendance-preview')
    || pathname?.startsWith('/settings/developer/attendance-desktop-preview');
  const storageKey = `clockin-ai-chat:${encodeURIComponent(userKey || 'anonymous')}`;
  const [open, setOpen] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const launcherAllowed = !aiManuallyDisabled;
  const [launcherMounted, setLauncherMounted] = useState(launcherAllowed);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [lastPlan, setLastPlan] = useState<AssistantPlan | null>(null);
  const nextId = useRef(1);
  const abortControllerRef = useRef<AbortController | null>(null);
  const routeKeyRef = useRef('');
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage()]);
  const [storageReady, setStorageReady] = useState(false);
  const [revealedTexts, setRevealedTexts] = useState<Record<number, string>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [historyPanelMinHeight, setHistoryPanelMinHeight] = useState<number | null>(null);

  useEffect(() => {
    if (launcherAllowed) {
      setLauncherMounted(true);
      return;
    }

    setOpen(false);
    setShowHistory(false);
    setShowSetupGuide(false);
    const timer = window.setTimeout(() => setLauncherMounted(false), 260);
    return () => window.clearTimeout(timer);
  }, [launcherAllowed]);

  useEffect(() => {
    setStorageReady(false);
    if (typeof window === 'undefined') return;

    const resetSession = () => {
      nextId.current = 1;
      setLastPlan(null);
      setMessages([initialMessage()]);
    };

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        resetSession();
        setStorageReady(true);
        return;
      }

      const stored = JSON.parse(raw) as Partial<StoredChatSession>;
      const expired = !stored.savedAt || Date.now() - stored.savedAt > CHAT_SESSION_TTL_MS;
      if (expired || !Array.isArray(stored.messages)) {
        window.localStorage.removeItem(storageKey);
        resetSession();
        setStorageReady(true);
        return;
      }

      const loadedMessages = stored.messages.length > 0 ? stored.messages : [initialMessage()];
      const maxMessageId = loadedMessages.reduce((max, item) => Math.max(max, item.id), 0);
      nextId.current = Math.max(stored.nextId || 1, maxMessageId + 1);
      setLastPlan(stored.lastPlan ?? null);
      setMessages(loadedMessages);
    } catch {
      window.localStorage.removeItem(storageKey);
      resetSession();
    } finally {
      setStorageReady(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageReady || typeof window === 'undefined') return;
    const payload: StoredChatSession = {
      savedAt: Date.now(),
      messages,
      lastPlan,
      nextId: nextId.current,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [lastPlan, messages, storageKey, storageReady]);

  useEffect(() => {
    const nextRouteKey = typeof window === 'undefined'
      ? pathname
      : `${window.location.pathname}${window.location.search}`;
    if (routeKeyRef.current !== nextRouteKey) {
      const isInitialRoute = routeKeyRef.current === '';
      routeKeyRef.current = nextRouteKey;
      if (!isInitialRoute) {
        setShowSetupGuide(false);
      }
      if (!isInitialRoute && !isDesktopViewport()) {
        setOpen(false);
        setShowHistory(false);
      }
    }
  }, [pathname]);

  useEffect(() => {
    if (!open || showHistory) return;
    const scrollToBottom = () => {
      chatBottomRef.current?.scrollIntoView({ block: 'end' });
    };
    const frame = window.requestAnimationFrame(() => {
      scrollToBottom();
      window.setTimeout(scrollToBottom, 80);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, showHistory, messages.length, loading]);

  const startNewChat = () => {
    nextId.current = 1;
    setInput('');
    setShowHistory(false);
    setLastPlan(null);
    setMessages([initialMessage()]);
    setRevealedTexts({});
  };

  const handleLauncherClick = () => {
    if (aiEnabled) {
      setShowSetupGuide(false);
      setOpen(value => !value);
      return;
    }

    setOpen(false);
    setShowHistory(false);
    setShowSetupGuide(true);
  };

  const goToAISettings = () => {
    setShowSetupGuide(false);
    router.push('/settings/ai');
  };

  const stopAsk = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  };

  const startTypewriter = (id: number, fullText: string) => {
    if (!fullText) return;
    const INTERVAL = 40;
    const CHUNK = Math.max(2, Math.ceil(fullText.length / 50));
    let pos = 0;
    const tick = () => {
      pos = Math.min(pos + CHUNK, fullText.length);
      setRevealedTexts(prev => ({ ...prev, [id]: fullText.slice(0, pos) }));
      if (pos < fullText.length) {
        window.setTimeout(tick, INTERVAL);
      } else {
        setRevealedTexts(prev => { const next = { ...prev }; delete next[id]; return next; });
      }
    };
    tick();
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onPageQuestion = (event: Event) => {
      if (!aiEnabled) {
        setShowSetupGuide(true);
        return;
      }

      const detail = (event as CustomEvent<{ message?: string }>).detail;
      const userText = detail?.message?.trim() || '我对本页有疑问';
      const replyText = '可以，你直接说哪里不明白。比如“为什么这个人工资少了 200 块”“加班是怎么算的”“这个月请假有没有扣钱”。我会按当前页面的数据帮你核一遍。';
      const replyId = nextId.current + 1;

      setOpen(true);
      setShowSetupGuide(false);
      setShowHistory(false);
      setInput('');
      setMessages(prev => [
        ...prev,
        { id: nextId.current++, role: 'user', text: userText },
        { id: nextId.current++, role: 'assistant', text: replyText, mode: 'rules' },
      ]);
      startTypewriter(replyId, replyText);
    };

    window.addEventListener('clockin-ai-page-question', onPageQuestion);
    return () => window.removeEventListener('clockin-ai-page-question', onPageQuestion);
  }, [aiEnabled]);

  const copyMessage = async (id: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch { /* ignore */ }
  };

  const ask = async (raw: string) => {
    const message = raw.trim();
    if (!message || loading) return;
    const history = messages
      .filter(item => item.id !== 0)
      .slice(-16)
      .map(item => ({ role: item.role, text: item.text }));

    setInput('');
    setLoading(true);
    setMessages(prev => [
      ...prev,
      { id: nextId.current++, role: 'user', text: message },
    ]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history,
          lastPlan,
          pageUrl: `${window.location.pathname}${window.location.search}`,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const data = await response.json() as Partial<AssistantReply>;
        const errText = response.status === 429
          ? data.reply ?? '发送太频繁了，稍后再试。'
          : response.status === 401
            ? '登录已过期，请刷新页面重新登录。'
            : data.reply ?? '服务暂时不可用，稍后再试。';
        setMessages(prev => [
          ...prev,
          { id: nextId.current++, role: 'assistant' as const, text: errText, mode: 'rules' as const },
        ]);
        return;
      }

      if (!response.body) throw new Error('no stream body');
      const reader = response.body.getReader();
      const textDecoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += textDecoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              type: string;
              reply?: string;
              actions?: AssistantAction[];
              mode?: 'rules' | 'ai';
              planContext?: AssistantPlan | null;
              autoNavigate?: boolean;
            };
            if (event.type === 'done') {
              setLoading(false);
              return;
            }
            if (event.type === 'answer') {
              if (event.planContext) setLastPlan(event.planContext);
              const newId = nextId.current++;
              const fullText = event.reply ?? '';
              setMessages(prev => [
                ...prev,
                { id: newId, role: 'assistant' as const, text: fullText, actions: event.actions ?? [], mode: event.mode },
              ]);
              startTypewriter(newId, fullText);
              if (event.autoNavigate && event.actions?.length) {
                router.push(event.actions[0].href);
                if (!isDesktopViewport()) setOpen(false);
              }
            }
          } catch { /* skip malformed event */ }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const isNetwork = err instanceof TypeError && err.message.includes('fetch');
      setMessages(prev => [
        ...prev,
        { id: nextId.current++, role: 'assistant' as const, text: isNetwork ? '网络连接失败，检查一下网络再试。' : '查询出错了，稍后再试一下。', mode: 'rules' as const },
      ]);
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask(input);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void ask(input);
    }
  };

  const openAction = (action: AssistantAction) => {
    router.push(action.href);
    if (!isDesktopViewport()) setOpen(false);
  };

  const loadHistory = async (reset = false) => {
    if (historyLoading) return;
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ limit: '30' });
      const cursor = reset ? null : historyCursor;
      if (cursor) params.set('before', cursor);
      const response = await fetch(`/api/ai/history?${params.toString()}`);
      const data = await response.json() as {
        ok: boolean;
        items: HistoryItem[];
        nextCursor: string | null;
      };
      if (data.ok) {
        setHistoryItems(prev => reset ? data.items : [...prev, ...data.items]);
        setHistoryCursor(data.nextCursor);
        setHistoryLoaded(true);
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = () => {
    setHistoryPanelMinHeight(panelRef.current?.offsetHeight ?? null);
    setShowHistory(true);
    if (!historyLoaded) void loadHistory(true);
  };

  const formatHistoryDay = (value: string) => {
    const date = new Date(value);
    return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
  };

  const formatHistoryTime = (value: string) => {
    const date = new Date(value);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const groupedHistory = historyItems.reduce<Array<{ day: string; items: HistoryItem[] }>>((groups, item) => {
    const day = formatHistoryDay(item.createdAt);
    const group = groups.find(entry => entry.day === day);
    if (group) group.items.push(item);
    else groups.push({ day, items: [item] });
    return groups;
  }, []);
  const launcherPlacement = compactLauncher
    ? 'bottom-32 right-0 h-12 w-10 rounded-l-2xl rounded-r-none bg-white/95 p-1.5 shadow-[0_8px_22px_rgba(51,112,255,0.22)] md:bottom-32 md:right-0'
    : 'bottom-20 right-4 h-14 w-14 rounded-full bg-white shadow-[0_4px_16px_rgba(51,112,255,0.25),0_1px_4px_rgba(0,0,0,0.06)] md:bottom-6 md:right-6';

  return (
    <>
      {(open || showSetupGuide) && (
        <button
          type="button"
          aria-label="关闭AI管家背景"
          onClick={() => {
            setOpen(false);
            setShowSetupGuide(false);
          }}
          className="fixed inset-0 z-[55] bg-black/50 transition-opacity duration-200 md:hidden"
        />
      )}
      <section
        ref={panelRef}
        aria-hidden={!open}
        className={`ai-assistant fixed inset-x-3 bottom-[88px] z-[60] mx-auto max-h-[72vh] max-w-[420px] origin-bottom-right overflow-hidden rounded-2xl border border-[#D8E2F3] bg-white shadow-[0_18px_44px_rgba(26,58,143,0.24),0_2px_10px_rgba(15,23,42,0.08)] transition-[opacity,transform,box-shadow] duration-200 ease-out will-change-transform md:inset-x-auto md:right-6 md:bottom-24 md:w-[390px] ${
          open ? 'pointer-events-auto translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-5 scale-[0.86] opacity-0'
        }`}
        style={{
          fontWeight: 400,
          minHeight: showHistory && historyPanelMinHeight ? historyPanelMinHeight : undefined,
        }}
      >
          <div className="flex items-center justify-between border-b border-[#E8EEF8] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full shadow-sm">
                <AssistantLogo />
              </span>
              <div>
                <div className="text-[15px] text-[#1A3A8F]" style={{ fontWeight: 600 }}>AI管家</div>
                <div className="text-[11px] text-gray-400">用一句话管理你的考勤</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={showHistory ? () => setShowHistory(false) : openHistory}
                className="flex h-7 items-center gap-1 rounded-full bg-[#F7F9FD]/80 px-2.5 text-[12px] text-gray-400 ring-1 ring-[#EEF2FA] active:scale-95"
                aria-label={showHistory ? '返回对话' : '历史记录'}
              >
                {showHistory ? <ChevronLeft size={13} /> : <History size={13} />}
                {showHistory ? '返回' : '历史'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F0F4FA] text-gray-500 active:scale-95"
                aria-label="关闭"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {showHistory ? (
            <div className="max-h-[54vh] overflow-y-auto px-4 py-3 md:max-h-[58vh]">
              {historyItems.length === 0 && !historyLoading ? (
                <>
                <div className="rounded-2xl bg-[#F6F8FC] px-3 py-5 text-center text-[13px] text-gray-400">
                  最近一个月还没有历史记录
                </div>
                  {historyCursor && (
                    <button
                      type="button"
                      onClick={() => loadHistory(false)}
                      disabled={historyLoading}
                      className="mt-3 w-full rounded-xl bg-[#F0F4FA] py-2 text-[13px] text-[#1A3A8F] disabled:opacity-50"
                      style={{ fontWeight: 400 }}
                    >
                      {historyLoading ? '加载中' : '查看更早记录'}
                    </button>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  {groupedHistory.map(group => (
                    <div key={group.day}>
                      <div className="mb-2 text-[12px] text-gray-400" style={{ fontWeight: 400 }}>{group.day}</div>
                      <div className="space-y-2">
                        {group.items.map(item => (
                          <div key={item.id} className="rounded-2xl bg-[#F6F8FC] px-3 py-2.5 text-[13px] leading-5 text-gray-700">
                            <div className="mb-1 flex items-center justify-between text-[11px] text-gray-400">
                              <span>{formatHistoryTime(item.createdAt)}</span>
                              {item.mode === 'ai' && <span>AI</span>}
                            </div>
                            <div className="text-[#1A3A8F]" style={{ fontWeight: 400 }}>问：{item.userMessage}</div>
                            <div className="mt-1">答：{item.assistantReply}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {historyCursor && (
                    <button
                      type="button"
                      onClick={() => loadHistory(false)}
                      disabled={historyLoading}
                      className="w-full rounded-xl bg-[#F0F4FA] py-2 text-[13px] text-[#1A3A8F] disabled:opacity-50"
                      style={{ fontWeight: 400 }}
                    >
                      {historyLoading ? '加载中' : '查看更早记录'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
          <div className="max-h-[42vh] space-y-3 overflow-y-auto px-4 py-3 md:max-h-[46vh]">
            {messages.map(message => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                  {message.role === 'user' ? (
                  <div className="flex max-w-[86%] flex-col items-end">
                    <div
                      className="rounded-2xl bg-[#F1F3F5] px-3 py-2 text-[14px] leading-relaxed text-gray-700 ring-1 ring-gray-200/70"
                      style={{ fontWeight: 400 }}
                    >
                      {message.text}
                    </div>
                    <button
                      type="button"
                      onClick={() => copyMessage(message.id, message.text)}
                      className="relative mt-1 flex h-6 w-6 items-center justify-center text-gray-300 transition-colors before:absolute before:-inset-2 before:content-[''] active:text-gray-500"
                      aria-label="复制"
                    >
                      {copiedId === message.id ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                    </button>
                  </div>
                ) : (
                  <div className="w-full text-[14px] leading-relaxed text-gray-700" style={{ fontWeight: 400 }}>
                    <div>{revealedTexts[message.id] !== undefined ? revealedTexts[message.id] : message.text}</div>
                    {message.actions && message.actions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {message.actions.map(action => (
                          <button
                            key={`${action.type}-${action.href}`}
                            type="button"
                            onClick={() => openAction(action)}
                            className="rounded-full bg-[#F0F4FA] px-3 py-1.5 text-[12px] text-[#3370FF] ring-1 ring-[#D8E2FF]"
                            style={{ fontWeight: 400 }}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center justify-start gap-2">
                      <button
                        type="button"
                        onClick={() => copyMessage(message.id, message.text)}
                        className="relative flex h-6 w-6 items-center justify-center text-gray-300 transition-colors before:absolute before:-inset-2 before:content-[''] hover:text-gray-500 active:text-gray-500"
                        aria-label="复制"
                      >
                        {copiedId === message.id ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                      </button>
                      {message.mode === 'ai' && (
                        <span className="select-none rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] leading-none text-gray-400">AI</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 text-[13px] text-gray-400">
                  <Loader2 size={14} className="animate-spin" />
                  查询中
                </div>
              </div>
            )}
            <div ref={chatBottomRef} className="h-px" />
          </div>
          )}

          {!showHistory && <div className="border-t border-[#E8EEF8] px-3 py-3">
            <div className="prompts-scroll mb-2 flex gap-2 overflow-x-auto">
              {QUICK_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => ask(prompt)}
                  disabled={loading}
                  className="shrink-0 flex h-7 items-center rounded-full bg-[#EEF3FF] px-3 text-[12px] text-[#3370FF] disabled:opacity-40"
                  style={{ fontWeight: 500 }}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="grid grid-cols-[1fr_64px_40px] gap-2">
              <textarea
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder=""
                className="max-h-24 min-h-10 resize-none rounded-xl bg-[#F0F4FA] px-3 py-2.5 text-[14px] leading-5 text-gray-800 outline-none placeholder:text-gray-400"
              />
              {loading ? (
                <button
                  type="button"
                  onClick={stopAsk}
                  className="flex h-10 w-16 items-center justify-center rounded-xl bg-gray-400 text-white transition-colors active:scale-95"
                  aria-label="停止"
                >
                  <Square size={16} fill="currentColor" strokeWidth={0} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="flex h-10 w-16 items-center justify-center rounded-xl bg-[#07C160] text-[15px] font-semibold text-white shadow-[0_6px_14px_rgba(7,193,96,0.22)] transition-colors active:scale-95 disabled:bg-[#BFEBD1] disabled:shadow-none"
                  aria-label="发送"
                >
                  发送
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white p-[3px] shadow-[0_4px_12px_rgba(51,112,255,0.16)] ring-1 ring-[#D8E2FF] active:scale-95"
                aria-label="收起AI管家"
                title="收起AI管家"
              >
                <AssistantLogo />
              </button>
            </form>
          </div>}
      </section>

      <section
        aria-hidden={!showSetupGuide}
        className={`ai-assistant fixed inset-x-4 bottom-[88px] z-[60] mx-auto max-w-[360px] origin-bottom-right rounded-2xl border border-[#D8E2F3] bg-white p-4 shadow-[0_18px_44px_rgba(26,58,143,0.20),0_2px_10px_rgba(15,23,42,0.08)] transition-[opacity,transform,box-shadow] duration-200 ease-out will-change-transform md:inset-x-auto md:right-6 md:bottom-24 ${
          showSetupGuide ? 'pointer-events-auto translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-5 scale-[0.9] opacity-0'
        }`}
        style={{ fontWeight: 400 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF3FF] text-[#3370FF]">
            <Settings2 size={18} />
          </span>
          <button
            type="button"
            onClick={() => setShowSetupGuide(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F0F4FA] text-gray-500 active:scale-95"
            aria-label="关闭AI配置向导"
          >
            <X size={17} />
          </button>
        </div>
        <div className="text-[16px] text-[#1A3A8F]" style={{ fontWeight: 600 }}>
          配置 AI 助手
        </div>
        <p className="mt-2 text-[13px] leading-6 text-gray-500">
          {aiConfigured
            ? '当前 AI 助手还不能聊天，请到设置页检查开关、模型和 API Key。'
            : '配置模型和 API Key 后，可以直接查询漏录、异常、工资和员工资料。'}
        </p>
        <button
          type="button"
          onClick={goToAISettings}
          className="mt-4 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#3370FF] text-[14px] text-white shadow-[0_8px_18px_rgba(51,112,255,0.24)] transition-transform active:scale-[0.98]"
          style={{ fontWeight: 500 }}
        >
          去配置 AI 助手
          <ArrowRight size={16} />
        </button>
      </section>

      {launcherMounted && (
        <button
          type="button"
          onClick={handleLauncherClick}
          className={`fixed z-[61] flex items-center justify-center text-white transition-[opacity,transform,box-shadow,filter] duration-300 ease-out active:scale-95 ${launcherPlacement} ${
            open || showSetupGuide || !launcherAllowed
              ? 'pointer-events-none translate-y-3 scale-[0.72] opacity-0 shadow-none blur-[2px]'
              : 'pointer-events-auto translate-y-0 scale-100 opacity-100 blur-0'
          }`}
          aria-label={aiEnabled ? '打开AI管家' : '打开AI配置向导'}
        >
          <AssistantLogo />
        </button>
      )}
    </>
  );
}
