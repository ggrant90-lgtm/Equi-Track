"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "./ChatProvider";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { ASSISTANT_NAME } from "@/lib/assistant/config";

export function ChatInput() {
  const { send, sending, cancel, rateLimitMessage } = useChat();
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeechRecognition();

  // When voice transcript updates, sync it into the textarea (user can edit
  // before sending).
  useEffect(() => {
    if (speech.listening && speech.transcript) {
      setText(speech.transcript);
    }
  }, [speech.transcript, speech.listening]);

  // Auto-grow the textarea.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [text]);

  const handleSend = useCallback(() => {
    const v = text.trim();
    if (!v || sending) return;
    setText("");
    speech.reset();
    void send(v);
  }, [text, sending, send, speech]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const toggleMic = useCallback(() => {
    if (speech.listening) speech.stop();
    else speech.start();
  }, [speech]);

  if (rateLimitMessage) {
    return (
      <div className="border-t border-barn-dark/10 bg-parchment/60 px-4 py-3 text-sm text-barn-dark/70">
        {rateLimitMessage}
      </div>
    );
  }

  return (
    <div className="border-t border-barn-dark/10 bg-white px-3 py-2">
      <div className="flex items-end gap-2">
        {speech.supported && (
          <button
            type="button"
            onClick={toggleMic}
            disabled={sending}
            aria-label={speech.listening ? "Stop listening" : "Voice input"}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
              speech.listening
                ? "animate-pulse bg-rose-500 text-white"
                : "bg-barn-dark/5 text-barn-dark hover:bg-brass-gold/15"
            }`}
          >
            <MicIcon />
          </button>
        )}
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={sending && false}
          placeholder={`Ask ${ASSISTANT_NAME} anything...`}
          className="min-h-9 max-h-36 flex-1 resize-none rounded-2xl border border-barn-dark/10 bg-white px-3 py-2 text-sm text-barn-dark outline-none focus:border-brass-gold/60"
        />
        {sending ? (
          <button
            type="button"
            onClick={cancel}
            aria-label="Stop"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-barn-dark/5 text-barn-dark hover:bg-barn-dark/10"
          >
            <StopIcon />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim()}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass-gold text-barn-dark transition hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100"
          >
            <SendIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}
