"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Copy, Check, Eraser, Send, Square, Wrench, Brain, ChevronDown } from "lucide-react";
import type { AgentSpec, AgentStatus } from "@/lib/agents";
import { streamNdjson, type StreamEvent } from "@/lib/client";
import type { StoredMessage } from "@/lib/store";
import AgentAvatar from "./AgentAvatar";
import VoiceButton from "./VoiceButton";
import { Spinner } from "./ui";

interface Props {
  spec: AgentSpec;
  status: AgentStatus | null;
  /** Optional starter prompts shown on an empty conversation. */
  suggestions?: string[];
}

interface LiveState {
  text: string;
  thinking: string;
  tools: { name: string; detail: string }[];
  command: string;
  streamId: string;
  usage: { input: number; output: number; costUsd: number } | null;
  errors: string[];
}

const EMPTY_LIVE: LiveState = {
  text: "",
  thinking: "",
  tools: [],
  command: "",
  streamId: "",
  usage: null,
  errors: [],
};

function MessageBubble({ msg, spec }: { msg: StoredMessage; spec: AgentSpec }) {
  const [copied, setCopied] = useState(false);
  const mine = msg.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={`group flex gap-3 ${mine ? "flex-row-reverse" : ""}`}
    >
      {mine ? (
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-[var(--line-strong)] bg-[rgba(224,177,132,0.14)] text-[11px] font-semibold text-[var(--gold)]">
          You
        </span>
      ) : (
        <AgentAvatar agent={spec.id} size={32} className="mt-0.5" />
      )}

      <div className={`flex min-w-0 max-w-[min(760px,86%)] flex-col gap-1.5 ${mine ? "items-end" : "items-start"}`}>
        {!!msg.tools?.length && (
          <div className="flex flex-wrap gap-1.5">
            {msg.tools.slice(0, 8).map((t, i) => (
              <span key={`${t.name}-${i}`} className="pill" title={t.detail}>
                <Wrench size={10} />
                {t.name}
                {t.detail && <span className="max-w-[180px] truncate text-[var(--fg-mute)]">{t.detail}</span>}
              </span>
            ))}
          </div>
        )}

        <div className={`bubble ${mine ? "bubble-user" : "bubble-agent"}`}>{msg.text || " "}</div>

        <div className={`flex items-center gap-2 text-[10.5px] text-[var(--fg-mute)] ${mine ? "flex-row-reverse" : ""}`}>
          <span>{new Date(msg.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          {msg.tokens && msg.tokens.output > 0 && (
            <span className="mono">
              {msg.tokens.output.toLocaleString()} out
              {msg.tokens.costUsd > 0 ? ` · $${msg.tokens.costUsd.toFixed(4)}` : ""}
            </span>
          )}
          <button
            onClick={() => {
              void navigator.clipboard.writeText(msg.text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
            className="opacity-0 transition group-hover:opacity-100 hover:text-[var(--fg)]"
            aria-label="Copy message"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function ChatView({ spec, status, suggestions = [] }: Props) {
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<LiveState>(EMPTY_LIVE);
  const [showThinking, setShowThinking] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Load the stored transcript for this agent.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/agents/${spec.id}/history`, { cache: "no-store" });
        const json = (await res.json()) as { messages?: StoredMessage[] };
        if (!cancelled) setMessages(json.messages ?? []);
      } catch {
        /* first run */
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [spec.id]);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
  }, []);

  useEffect(() => {
    if (atBottom) scrollToBottom(false);
  }, [messages.length, live.text, atBottom, scrollToBottom]);

  const persist = useCallback(
    async (next: StoredMessage[]) => {
      try {
        await fetch(`/api/agents/${spec.id}/history`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next }),
        });
      } catch {
        /* transcript stays in memory for this session */
      }
    },
    [spec.id],
  );

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || busy) return;

      const userMsg: StoredMessage = { id: `u_${Date.now()}`, role: "user", text, at: Date.now() };
      const history = messages.map((m) => ({ role: m.role, text: m.text }));
      const withUser = [...messages, userMsg];

      setMessages(withUser);
      setInput("");
      setInterim("");
      setBusy(true);
      setLive(EMPTY_LIVE);
      setAtBottom(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const acc: LiveState = { ...EMPTY_LIVE, tools: [], errors: [] };
      const apply = (patch: Partial<LiveState>) => {
        Object.assign(acc, patch);
        setLive({ ...acc, tools: [...acc.tools], errors: [...acc.errors] });
      };

      const onEvent = (evt: StreamEvent) => {
        switch (evt.t) {
          case "meta":
            apply({ command: evt.command ?? "", streamId: evt.streamId ?? "" });
            break;
          case "delta":
            acc.text += evt.text ?? "";
            apply({});
            break;
          case "final":
            // Some CLIs only hand over the full text at the end.
            if (evt.text && !acc.text.trim()) apply({ text: evt.text });
            break;
          case "think":
            acc.thinking += evt.text ?? "";
            apply({});
            break;
          case "tool":
            acc.tools.push({ name: evt.name ?? "tool", detail: evt.detail ?? "" });
            apply({});
            break;
          case "usage":
            apply({ usage: { input: evt.input ?? 0, output: evt.output ?? 0, costUsd: evt.costUsd ?? 0 } });
            break;
          case "err":
            acc.errors.push(evt.text ?? "");
            apply({});
            break;
          default:
            break;
        }
      };

      try {
        await streamNdjson(
          `/api/agents/${spec.id}/chat`,
          { prompt: text, history },
          onEvent,
          controller.signal,
        );
      } catch (e) {
        if (!controller.signal.aborted) acc.errors.push(e instanceof Error ? e.message : String(e));
      }

      const replyText =
        acc.text.trim() ||
        (acc.errors.length
          ? `⚠️ ${spec.name} did not return a reply.\n\n${acc.errors.join("").slice(0, 1500)}`
          : `⚠️ ${spec.name} exited without output. Command was:\n${acc.command}`);

      const agentMsg: StoredMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        text: replyText,
        at: Date.now(),
        tools: acc.tools.slice(0, 24),
        tokens: acc.usage ?? undefined,
        agentId: spec.id,
      };

      const next = [...withUser, agentMsg];
      setMessages(next);
      setLive(EMPTY_LIVE);
      setBusy(false);
      abortRef.current = null;
      void persist(next);
    },
    [busy, input, messages, persist, spec.id, spec.name],
  );

  const stop = useCallback(async () => {
    if (live.streamId) {
      await fetch(`/api/agents/${spec.id}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamId: live.streamId }),
      }).catch(() => {});
    }
    abortRef.current?.abort();
  }, [live.streamId, spec.id]);

  const clear = useCallback(async () => {
    setMessages([]);
    await fetch(`/api/agents/${spec.id}/history`, { method: "DELETE" }).catch(() => {});
  }, [spec.id]);

  const onVoice = useCallback((text: string, opts: { final: boolean }) => {
    if (opts.final) {
      setInterim("");
      setInput((prev) => (prev ? `${prev} ${text}` : text).trim());
      taRef.current?.focus();
    } else {
      setInterim(text);
    }
  }, []);

  const composed = interim ? `${input} ${interim}`.trim() : input;
  const disabled = status ? !status.connected : false;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Transcript */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
        }}
        className="scroll min-h-0 flex-1 overflow-y-auto px-1 py-4"
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          {messages.length === 0 && !busy && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <AgentAvatar agent={spec.id} size={56} />
              <div>
                <h2 className="text-[17px] font-semibold">{spec.name}</h2>
                <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--fg-dim)]">{spec.blurb}</p>
              </div>
              {suggestions.length > 0 && (
                <div className="mt-1 flex flex-wrap justify-center gap-2">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => void send(s)} disabled={disabled} className="btn text-[12.5px]">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} spec={spec} />
          ))}

          {busy && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
              <AgentAvatar agent={spec.id} size={32} live className="mt-0.5" />
              <div className="flex min-w-0 max-w-[min(760px,86%)] flex-col gap-1.5">
                {live.command && (
                  <span className="mono truncate text-[10.5px] text-[var(--fg-mute)]" title={live.command}>
                    $ {live.command}
                  </span>
                )}

                {!!live.tools.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {live.tools.slice(-6).map((t, i) => (
                      <motion.span
                        key={`${t.name}-${i}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="pill"
                        title={t.detail}
                      >
                        <Wrench size={10} />
                        {t.name}
                        {t.detail && <span className="max-w-[200px] truncate text-[var(--fg-mute)]">{t.detail}</span>}
                      </motion.span>
                    ))}
                  </div>
                )}

                {live.thinking && (
                  <div className="rounded-xl border border-[var(--line)] bg-[rgba(13,10,18,0.5)] px-3 py-2">
                    <button
                      onClick={() => setShowThinking((v) => !v)}
                      className="flex items-center gap-1.5 text-[11px] text-[var(--fg-mute)] hover:text-[var(--fg-dim)]"
                    >
                      <Brain size={11} />
                      Thinking
                      <ChevronDown size={11} className={showThinking ? "rotate-180 transition" : "transition"} />
                    </button>
                    {showThinking && (
                      <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--fg-mute)]">
                        {live.thinking.slice(-2500)}
                      </p>
                    )}
                  </div>
                )}

                <div className="bubble bubble-agent">
                  {live.text ? (
                    <span className="caret">{live.text}</span>
                  ) : (
                    <span className="flex items-center gap-2 text-[var(--fg-mute)]">
                      <Spinner /> working…
                    </span>
                  )}
                </div>

                {!!live.errors.length && (
                  <pre className="mono max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg border border-rose-500/25 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-200">
                    {live.errors.join("").slice(-1200)}
                  </pre>
                )}
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Jump to latest */}
      <AnimatePresence>
        {!atBottom && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={() => {
              setAtBottom(true);
              scrollToBottom();
            }}
            className="btn absolute bottom-32 left-1/2 z-10 -translate-x-1/2 shadow-lg"
          >
            <ArrowDown size={13} /> Latest
          </motion.button>
        )}
      </AnimatePresence>

      {/* Composer */}
      <div className="shrink-0 px-1 pb-4 pt-2">
        <div className="mx-auto w-full max-w-4xl">
          {disabled && (
            <p className="mb-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-[12px] text-amber-100">
              {spec.name} is not connected yet — {status?.detail}. You can still type; the reply will explain what to install.
            </p>
          )}
          <div className="panel flex items-end gap-2 p-2.5">
            <VoiceButton onTranscript={onVoice} size={40} />
            <textarea
              ref={taRef}
              rows={1}
              value={composed}
              onChange={(e) => {
                setInterim("");
                setInput(e.target.value);
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(190, el.scrollHeight)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={`Message ${spec.name}…  (Enter to send, Shift+Enter for a new line)`}
              className="textarea max-h-[190px] border-0 bg-transparent px-1 py-2.5 focus:shadow-none"
              style={{ boxShadow: "none" }}
            />
            <div className="flex items-center gap-1.5">
              {messages.length > 0 && !busy && (
                <button onClick={() => void clear()} className="btn btn-ghost h-10 !px-2.5" title="Clear conversation">
                  <Eraser size={15} />
                </button>
              )}
              {busy ? (
                <button onClick={() => void stop()} className="btn h-10 !px-3.5 text-rose-200" title="Stop the agent">
                  <Square size={13} /> Stop
                </button>
              ) : (
                <button
                  onClick={() => void send()}
                  disabled={!composed.trim()}
                  className="btn btn-primary h-10 !px-4"
                  title="Send"
                >
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 px-1 text-[10.5px] text-[var(--fg-mute)]">
            Runs on this machine · transcript stored at ~/.baseline-workforce/chats/{spec.id}.json
          </p>
        </div>
      </div>
    </div>
  );
}
