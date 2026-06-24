"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { ChatMessage } from "@/lib/types";
import AuthGate from "@/components/AuthGate";

export default function ChatPage() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return <p className="text-ink/60">Loading…</p>;

  return (
    <AuthGate
      title="Chat with your Chief of Staff"
      description="Sign in with Google or LinkedIn to start a conversation that always knows your goals and tasks."
    >
      {isSignedIn && <ChatContent />}
    </AuthGate>
  );
}

function ChatContent() {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((data) => setHistory(data.history ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  async function send() {
    const message = input.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    setInput("");

    // optimistic update
    setHistory((prev) => [
      ...prev,
      { role: "user", content: message, at: new Date().toISOString() },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setHistory(data.history ?? []);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col">
      <div>
        <h1 className="text-2xl font-semibold">Chat</h1>
        <p className="mt-1 text-ink/70">
          Your chief of staff always has your goals and tasks in mind.
        </p>
      </div>

      <div className="card mt-4 flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-ink/60">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-ink/50">
            Say hello, or ask "what should I focus on this week?"
          </p>
        ) : (
          <div className="space-y-3">
            {history.map((m, i) => (
              <div
                key={i}
                className={
                  "flex " + (m.role === "user" ? "justify-end" : "justify-start")
                }
              >
                <div
                  className={
                    "max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm " +
                    (m.role === "user"
                      ? "bg-accent text-white"
                      : "bg-[#f1efe9] text-ink")
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <input
          className="input"
          placeholder="Message your chief of staff…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn-primary" disabled={sending} onClick={send}>
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
