"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Save, Trash2 } from "lucide-react";
import { useJson } from "@/lib/client";
import type { JournalEntry } from "@/lib/vaultWriter";
import VoiceButton from "@/components/VoiceButton";
import { EmptyState, PageHeader, PageShell, Panel } from "@/components/ui";

interface JournalResponse {
  date: string;
  entries: JournalEntry[];
  days: string[];
  vault: string | null;
}

const MOODS = ["", "🔥 charged", "🙂 steady", "😐 flat", "🌧️ heavy", "🧠 deep"];

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function JournalPage() {
  const [date, setDate] = useState(todayISO());
  const { data, refresh } = useJson<JournalResponse>(`/api/journal?date=${date}`);
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [mood, setMood] = useState("");
  const [saving, setSaving] = useState(false);

  const composed = interim ? `${text} ${interim}`.trim() : text;

  const save = useCallback(async () => {
    const value = composed.trim();
    if (!value) return;
    setSaving(true);
    await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: value, date, mood: mood || undefined }),
    }).catch(() => {});
    setText("");
    setInterim("");
    setSaving(false);
    void refresh();
  }, [composed, date, mood, refresh]);

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/api/journal?date=${date}&id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
      void refresh();
    },
    [date, refresh],
  );

  const entries = data?.entries ?? [];
  const words = entries.reduce((n, e) => n + e.text.split(/\s+/).filter(Boolean).length, 0);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Self"
        icon="NotebookPen"
        accent="#fbbf24"
        title="Journal"
        subtitle="One file per day. Talk or type — each entry appends to today's page and syncs to your vault as markdown."
        actions={
          <div className="flex items-center gap-2">
            <CalendarDays size={15} className="text-[var(--fg-mute)]" />
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value || todayISO())}
              className="input !w-auto py-1.5 text-[12.5px]"
              aria-label="Journal date"
            />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <Panel>
            <textarea
              value={composed}
              onChange={(e) => {
                setInterim("");
                setText(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
              }}
              rows={6}
              placeholder="What happened today? What did the workforce ship? What is nagging at you?"
              className="textarea !border-0 !bg-transparent !px-1 focus:!shadow-none"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
              <div className="flex items-center gap-2">
                <VoiceButton
                  size={38}
                  title="Speak your entry"
                  onTranscript={(t, o) => {
                    if (o.final) {
                      setInterim("");
                      setText((prev) => (prev ? `${prev} ${t}` : t));
                    } else {
                      setInterim(t);
                    }
                  }}
                />
                <select
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  className="input !w-auto py-2 text-[12.5px]"
                  aria-label="Mood"
                >
                  {MOODS.map((m) => (
                    <option key={m || "none"} value={m}>
                      {m || "Mood…"}
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={() => void save()} disabled={!composed.trim() || saving} className="btn btn-primary">
                <Save size={14} /> {saving ? "Saving…" : "Save entry"}
              </button>
            </div>
          </Panel>

          <Panel title={date} subtitle={`${entries.length} entr${entries.length === 1 ? "y" : "ies"} · ${words} words`} padded={false}>
            {entries.length ? (
              <ul className="divide-y divide-[var(--line)]">
                <AnimatePresence initial={false}>
                  {[...entries].reverse().map((e) => (
                    <motion.li
                      key={e.id}
                      layout
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="group px-5 py-4"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <span className="text-[11px] text-[var(--fg-mute)]">
                          {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {e.mood ? ` · ${e.mood}` : ""}
                        </span>
                        <button
                          onClick={() => void remove(e.id)}
                          aria-label="Delete entry"
                          className="btn btn-ghost !px-2 !py-1 opacity-0 transition group-hover:opacity-100"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--fg-soft)]">{e.text}</p>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <EmptyState icon="NotebookPen" title="Nothing written for this day" body="Say something into the mic, or type above." />
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Recent days" padded={false}>
            {data?.days?.length ? (
              <ul className="max-h-[420px] overflow-y-auto scroll">
                {data.days.map((d) => (
                  <li key={d}>
                    <button
                      onClick={() => setDate(d)}
                      className="flex w-full items-center justify-between px-5 py-2.5 text-left text-[13px] transition hover:bg-[rgba(244,239,230,0.04)]"
                      style={{ color: d === date ? "var(--gold)" : "var(--fg-dim)" }}
                    >
                      <span className="mono">{d}</span>
                      {d === todayISO() && <span className="pill !py-0.5 !text-[10px]">today</span>}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-5 text-[12.5px] text-[var(--fg-mute)]">Your first entry starts the archive.</p>
            )}
          </Panel>

          <Panel title="Where it lands">
            <p className="text-[12px] leading-relaxed text-[var(--fg-dim)]">
              JSON at <span className="mono">~/.baseline-workforce/journal/{date}.json</span>
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--fg-dim)]">
              {data?.vault ? (
                <>
                  Markdown at <span className="mono break-all">{data.vault}</span>
                </>
              ) : (
                "No vault configured — set one in Settings to also write markdown."
              )}
            </p>
          </Panel>
        </aside>
      </div>
    </PageShell>
  );
}
