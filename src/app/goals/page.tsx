"use client";

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus, Trash2 } from "lucide-react";
import { useJson } from "@/lib/client";
import type { Goal } from "@/lib/vaultWriter";
import VoiceButton from "@/components/VoiceButton";
import { EmptyState, PageHeader, PageShell, Panel, Stat, Tabs } from "@/components/ui";

interface GoalsResponse {
  goals: Goal[];
  categories: string[];
  vault: string | null;
}

export default function GoalsPage() {
  const { data, refresh, setData } = useJson<GoalsResponse>("/api/goals");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [category, setCategory] = useState("");
  const [filter, setFilter] = useState("Open");

  const goals = useMemo(() => data?.goals ?? [], [data]);
  const open = goals.filter((g) => !g.done);
  const done = goals.filter((g) => g.done);
  const visible = filter === "Open" ? open : filter === "Done" ? done : goals;

  const composed = interim ? `${text} ${interim}`.trim() : text;

  const add = useCallback(async () => {
    const value = composed.trim();
    if (!value) return;
    setText("");
    setInterim("");
    // Optimistic: the list should never feel like it is waiting on disk.
    const optimistic: Goal = {
      id: `tmp_${Date.now()}`,
      text: value,
      category: category || undefined,
      done: false,
      createdAt: new Date().toISOString(),
    };
    setData(data ? { ...data, goals: [optimistic, ...goals] } : data);
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: value, category: category || undefined }),
    }).catch(() => {});
    void refresh();
  }, [composed, category, data, goals, refresh, setData]);

  const toggle = useCallback(
    async (goal: Goal) => {
      setData(
        data
          ? { ...data, goals: goals.map((g) => (g.id === goal.id ? { ...g, done: !g.done } : g)) }
          : data,
      );
      await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goal.id, done: !goal.done }),
      }).catch(() => {});
      void refresh();
    },
    [data, goals, refresh, setData],
  );

  const remove = useCallback(
    async (goal: Goal) => {
      setData(data ? { ...data, goals: goals.filter((g) => g.id !== goal.id) } : data);
      await fetch(`/api/goals?id=${encodeURIComponent(goal.id)}`, { method: "DELETE" }).catch(() => {});
      void refresh();
    },
    [data, goals, refresh, setData],
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Self"
        icon="Target"
        accent="#34d399"
        title="Goals"
        subtitle="Checkbox tasks with voice capture. Every change is mirrored to your vault as one markdown file per month."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Open" value={open.length} icon="Circle" accent="var(--emerald)" />
        <Stat label="Done" value={done.length} icon="CircleCheck" accent="var(--gold)" />
        <Stat
          label="Vault sync"
          value={data?.vault ? "On" : "Off"}
          hint={data?.vault ?? "Set a vault path in Settings to mirror as markdown"}
          icon="FolderSync"
          accent="var(--violet)"
        />
      </div>

      <Panel className="mb-5">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="goal-input" className="eyebrow mb-1.5 block">
              New goal
            </label>
            <input
              id="goal-input"
              value={composed}
              onChange={(e) => {
                setInterim("");
                setText(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
              placeholder="Ship the workforce dashboard…"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="goal-cat" className="eyebrow mb-1.5 block">
              Category
            </label>
            <select
              id="goal-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input !w-auto min-w-[150px]"
            >
              <option value="">None</option>
              {(data?.categories ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <VoiceButton
            size={40}
            title="Speak your goal"
            onTranscript={(t, o) => {
              if (o.final) {
                setInterim("");
                setText((prev) => (prev ? `${prev} ${t}` : t));
              } else {
                setInterim(t);
              }
            }}
          />
          <button onClick={() => void add()} disabled={!composed.trim()} className="btn btn-primary h-[40px]">
            <Plus size={15} /> Add
          </button>
        </div>
      </Panel>

      <Tabs tabs={["Open", "Done", "All"]} active={filter} onChange={setFilter} />

      <Panel padded={false}>
        {visible.length ? (
          <ul className="divide-y divide-[var(--line)]">
            <AnimatePresence initial={false}>
              {visible.map((goal) => (
                <motion.li
                  key={goal.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="group flex items-center gap-3 px-5 py-3"
                >
                  <button
                    onClick={() => void toggle(goal)}
                    aria-label={goal.done ? "Mark as not done" : "Mark as done"}
                    className="grid h-[19px] w-[19px] shrink-0 place-items-center rounded-[6px] border transition"
                    style={{
                      borderColor: goal.done ? "var(--emerald)" : "var(--line)",
                      background: goal.done ? "rgba(74,222,128,0.18)" : "transparent",
                      color: "var(--emerald)",
                    }}
                  >
                    {goal.done && <Check size={12} strokeWidth={3} />}
                  </button>

                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-[14px] leading-snug"
                      style={{
                        color: goal.done ? "var(--fg-mute)" : "var(--fg-soft)",
                        textDecoration: goal.done ? "line-through" : "none",
                      }}
                    >
                      {goal.text}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--fg-mute)]">
                      {goal.category && <span className="pill !py-0.5 !text-[10px]">{goal.category}</span>}
                      <span>{new Date(goal.createdAt).toLocaleDateString()}</span>
                    </span>
                  </span>

                  <button
                    onClick={() => void remove(goal)}
                    aria-label="Delete goal"
                    className="btn btn-ghost !px-2 opacity-0 transition group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <EmptyState
            icon="Target"
            title={filter === "Done" ? "Nothing finished yet" : "No goals here"}
            body="Type one above, or press the mic and say it out loud."
          />
        )}
      </Panel>
    </PageShell>
  );
}
