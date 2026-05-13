"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { streamChat, RateLimitError } from "./stream-client";

export interface ChatMessage {
  /** Stable ID for React keys. */
  id: string;
  role: "user" | "assistant";
  /** Raw text — fenced JSON blocks are parsed at render time. */
  content: string;
  /** Set on the assistant message while streaming. */
  streaming?: boolean;
  /** Tool-call indicators rendered inline below the message. */
  toolEvents?: { id: string; name: string; status: "pending" | "done" }[];
}

interface ChatContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: ChatMessage[];
  sending: boolean;
  rateLimitMessage: string | null;
  send: (text: string) => Promise<void>;
  cancel: () => void;
  clear: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const STORAGE_KEY = "barnpilot:state:v1";

interface PersistedState {
  conversationId: string;
  messages: ChatMessage[];
}

function loadPersisted(): PersistedState {
  if (typeof window === "undefined") {
    return { conversationId: crypto.randomUUID(), messages: [] };
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { conversationId: crypto.randomUUID(), messages: [] };
    }
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed.conversationId || !Array.isArray(parsed.messages)) {
      return { conversationId: crypto.randomUUID(), messages: [] };
    }
    return parsed;
  } catch {
    return { conversationId: crypto.randomUUID(), messages: [] };
  }
}

function persist(state: PersistedState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* swallow — quota or private mode */
  }
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string>(() =>
    crypto.randomUUID(),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hydratedRef = useRef(false);

  // Hydrate from sessionStorage once after mount.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const persisted = loadPersisted();
    setConversationId(persisted.conversationId);
    setMessages(persisted.messages);
  }, []);

  // Persist on every change after hydration.
  useEffect(() => {
    if (!hydratedRef.current) return;
    persist({ conversationId, messages });
  }, [conversationId, messages]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant" && last.streaming) {
        return [...prev.slice(0, -1), { ...last, streaming: false }];
      }
      return prev;
    });
  }, []);

  const clear = useCallback(() => {
    cancel();
    const newId = crypto.randomUUID();
    setConversationId(newId);
    setMessages([]);
    setRateLimitMessage(null);
    persist({ conversationId: newId, messages: [] });
  }, [cancel]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      setRateLimitMessage(null);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
      };
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        streaming: true,
        toolEvents: [],
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setSending(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // Build the payload from messages prior to this turn + the new user message.
      const payload = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        for await (const evt of streamChat({
          messages: payload,
          conversation_id: conversationId,
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) break;
          if (evt.type === "text_delta") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, content: m.content + evt.text }
                  : m,
              ),
            );
          } else if (evt.type === "tool_start" || evt.type === "tool_result_pending") {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantMsg.id) return m;
                const events = m.toolEvents ?? [];
                if (events.some((e) => e.id === evt.id)) return m;
                return {
                  ...m,
                  toolEvents: [
                    ...events,
                    { id: evt.id, name: evt.name, status: "pending" },
                  ],
                };
              }),
            );
          } else if (evt.type === "tool_result") {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantMsg.id) return m;
                return {
                  ...m,
                  toolEvents: (m.toolEvents ?? []).map((e) =>
                    e.id === evt.id ? { ...e, status: "done" } : e,
                  ),
                };
              }),
            );
          } else if (evt.type === "error") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? {
                      ...m,
                      content: m.content
                        ? m.content + "\n\n" + evt.message
                        : evt.message,
                      streaming: false,
                    }
                  : m,
              ),
            );
          } else if (evt.type === "done") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id ? { ...m, streaming: false } : m,
              ),
            );
          }
        }
      } catch (e) {
        if (e instanceof RateLimitError) {
          setRateLimitMessage(e.message);
          // Drop the streaming placeholder — the input area shows the
          // rate-limit message instead.
          setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
        } else if ((e as Error)?.name === "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, streaming: false } : m,
            ),
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    content:
                      "I'm having trouble thinking right now. Try again in a moment.",
                    streaming: false,
                  }
                : m,
            ),
          );
        }
      } finally {
        setSending(false);
        abortRef.current = null;
        // Mark any still-pending toolEvents as done so the spinner stops.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  streaming: false,
                  toolEvents: (m.toolEvents ?? []).map((e) => ({
                    ...e,
                    status: "done",
                  })),
                }
              : m,
          ),
        );
      }
    },
    [messages, conversationId, sending],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      open,
      setOpen,
      messages,
      sending,
      rateLimitMessage,
      send,
      cancel,
      clear,
    }),
    [open, messages, sending, rateLimitMessage, send, cancel, clear],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
