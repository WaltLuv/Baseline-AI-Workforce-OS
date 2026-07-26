"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, CornerDownLeft } from "lucide-react";
import { AGENTS } from "@/lib/agents";
import { FEATURES } from "@/lib/features";
import AgentAvatar from "./AgentAvatar";
import { Icon } from "./ui";

interface Entry {
  href: string;
  title: string;
  hint: string;
  kind: "agent" | "page";
  id: string;
  accent: string;
}

const ENTRIES: Entry[] = [
  ...FEATURES.map((f) => ({ href: f.route, title: f.title, hint: f.blurb, kind: "page" as const, id: f.icon, accent: f.accent })),
  ...AGENTS.map((a) => ({
    href: `/agents/${a.id}`,
    title: a.name,
    hint: a.tagline,
    kind: "agent" as const,
    id: a.id,
    accent: a.accent,
  })),
];

/** ⌘K / Ctrl-K anywhere in the app. */
export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setCursor(0);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ENTRIES.slice(0, 9);
    return ENTRIES.filter((e) => e.title.toLowerCase().includes(q) || e.hint.toLowerCase().includes(q)).slice(0, 9);
  }, [query]);

  function go(entry: Entry | undefined) {
    if (!entry) return;
    setOpen(false);
    router.push(entry.href);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-4 pt-[14vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ y: -14, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className="panel w-full max-w-xl overflow-hidden"
          >
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
              <Search size={16} className="text-[var(--fg-mute)]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCursor((c) => Math.min(results.length - 1, c + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(0, c - 1));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    go(results[cursor]);
                  }
                }}
                placeholder="Search agents and pages…"
                className="w-full bg-transparent text-[14.5px] outline-none placeholder:text-[var(--fg-mute)]"
              />
              <kbd className="mono rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--fg-mute)]">esc</kbd>
            </div>

            <div className="scroll max-h-[52vh] overflow-y-auto py-1.5">
              {results.map((entry, i) => (
                <button
                  key={entry.href}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(entry)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition"
                  style={{ background: i === cursor ? "rgba(244,239,230,0.06)" : "transparent" }}
                >
                  <span className="grid h-7 w-7 place-items-center" style={{ color: entry.accent }}>
                    {entry.kind === "agent" ? <AgentAvatar agent={entry.id} size={24} /> : <Icon name={entry.id} size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{entry.title}</span>
                    <span className="block truncate text-[11.5px] text-[var(--fg-mute)]">{entry.hint}</span>
                  </span>
                  {i === cursor && <CornerDownLeft size={13} className="text-[var(--fg-mute)]" />}
                </button>
              ))}
              {!results.length && <p className="px-4 py-8 text-center text-[13px] text-[var(--fg-mute)]">No matches.</p>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
