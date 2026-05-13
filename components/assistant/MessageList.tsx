"use client";

import { useEffect, useRef } from "react";
import { useChat, type ChatMessage } from "./ChatProvider";
import { parseAssistantMessage } from "./message-parser";
import { renderCard } from "./cards";
import { ASSISTANT_NAME } from "@/lib/assistant/config";

const SUGGESTIONS: string[] = [
  "Today's schedule",
  "Who owes me?",
  "How many horses do I have?",
  "Upcoming coggins renewals",
  "This month's revenue",
  "Help me with keys",
];

export function MessageList() {
  const { messages, sending, send } = useChat();
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages / streaming deltas.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  if (messages.length === 0) {
    return (
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <Greeting />
        <div className="mt-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-barn-dark/50">
            Try asking
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-full border border-brass-gold/40 bg-white px-3 py-1.5 text-sm text-barn-dark transition hover:bg-brass-gold/10"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4">
      <div className="space-y-4">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>
    </div>
  );
}

function Greeting() {
  return (
    <div className="rounded-2xl border border-brass-gold/30 bg-white p-4">
      <div className="font-serif text-base font-semibold text-barn-dark">
        Hey — I&apos;m {ASSISTANT_NAME}.
      </div>
      <div className="mt-1 text-sm text-barn-dark/70">
        Ask me anything about your horses, schedule, or operation. I can read
        your data but I can&apos;t make changes — I&apos;ll point you to the right
        page if you need to log something.
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const { send } = useChat();

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-barn-dark px-3.5 py-2 text-sm text-parchment">
          {message.content}
        </div>
      </div>
    );
  }

  const parsed = parseAssistantMessage(message.content);
  const showTyping =
    message.streaming && parsed.text.length === 0 && parsed.cards.length === 0;

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-2">
        <div className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-sm text-barn-dark shadow-sm">
          {showTyping ? (
            <TypingDots />
          ) : (
            <div className="whitespace-pre-wrap">{parsed.text}</div>
          )}
          {message.toolEvents && message.toolEvents.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {message.toolEvents.map((e) => (
                <span
                  key={e.id}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    e.status === "done"
                      ? "bg-barn-dark/5 text-barn-dark/60"
                      : "bg-brass-gold/15 text-brass-gold"
                  }`}
                >
                  {e.status === "pending" && (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass-gold" />
                  )}
                  {humanizeToolName(e.name)}
                </span>
              ))}
            </div>
          )}
        </div>
        {parsed.cards.length > 0 && (
          <div className="space-y-2">
            {parsed.cards.map((c, i) => (
              <div key={i}>{renderCard(c)}</div>
            ))}
          </div>
        )}
        {!message.streaming && parsed.followups && parsed.followups.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {parsed.followups.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => send(f)}
                className="rounded-full border border-barn-dark/15 bg-white px-2.5 py-1 text-xs text-barn-dark/80 transition hover:bg-brass-gold/10"
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-barn-dark/30 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-barn-dark/30 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-barn-dark/30" />
    </div>
  );
}

function humanizeToolName(name: string): string {
  return name
    .replace(/^get_/, "")
    .replace(/_/g, " ")
    .replace(/\bsearch\b/, "searching");
}
