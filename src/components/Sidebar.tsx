"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Search, X, Menu, Command } from "lucide-react";
import { AGENTS, type AgentSpec, type AgentStatus } from "@/lib/agents";
import { FEATURES } from "@/lib/features";
import { useJson } from "@/lib/client";
import AgentAvatar from "./AgentAvatar";
import { Icon } from "./ui";

interface AgentsResponse {
  agents: AgentSpec[];
  statuses: AgentStatus[];
}

const FEATURE_GROUPS = ["Command", "Orchestration", "Studio", "Growth", "System", "Self"] as const;

function NavRow({
  href,
  label,
  active,
  icon,
  accent,
  trailing,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
  accent: string;
  trailing?: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link href={href} onClick={onNavigate} className={`nav-item ${active ? "active" : ""}`}>
      {active && (
        <motion.span
          layoutId="nav-marker"
          className="absolute left-0 top-1/2 h-[18px] w-[2.5px] -translate-y-1/2 rounded-r"
          style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <span className="grid h-6 w-6 shrink-0 place-items-center" style={{ color: active ? accent : "inherit" }}>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </Link>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const { data } = useJson<AgentsResponse>("/api/agents", { pollMs: 45_000 });

  const statusById = useMemo(() => {
    const map: Record<string, AgentStatus> = {};
    for (const s of data?.statuses ?? []) map[s.id] = s;
    return map;
  }, [data]);

  const q = query.trim().toLowerCase();
  const roster = data?.agents ?? AGENTS; // includes config-defined custom CLIs
  const agents = roster.filter((a) => !q || a.name.toLowerCase().includes(q) || a.tagline.toLowerCase().includes(q));
  const features = FEATURES.filter((f) => !q || f.title.toLowerCase().includes(q) || f.blurb.toLowerCase().includes(q));
  const connected = (data?.statuses ?? []).filter((s) => s.connected).length;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-5 pb-4 pt-6">
        <Link href="/" onClick={onNavigate} className="block">
          <div className="eyebrow mb-1">Local · Private</div>
          <div className="text-[19px] font-semibold leading-tight tracking-tight">
            Baseline{" "}
            <span
              style={{
                background: "linear-gradient(135deg,var(--gold),var(--violet))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              AI Workforce
            </span>
          </div>
        </Link>
        <div className="relative mt-4">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-mute)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to…"
            aria-label="Filter navigation"
            className="input py-1.5 pl-8 pr-8 text-[12.5px]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-mute)] hover:text-[var(--fg)]"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <nav className="scroll min-h-0 flex-1 overflow-y-auto pb-4">
        {FEATURE_GROUPS.map((group) => {
          const items = features.filter((f) => f.group === group);
          if (!items.length) return null;
          return (
            <div key={group}>
              <div className="nav-section">{group}</div>
              {items.map((f) => (
                <NavRow
                  key={f.route}
                  href={f.route}
                  label={f.title}
                  accent={f.accent}
                  active={f.route === "/" ? pathname === "/" : pathname.startsWith(f.route)}
                  icon={<Icon name={f.icon} size={16} />}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          );
        })}

        {agents.length > 0 && (
          <>
            <div className="nav-section flex items-center justify-between">
              <span>Agents</span>
              <span className="text-[9px] font-semibold tracking-normal text-[var(--fg-mute)]">
                {connected}/{roster.length} live
              </span>
            </div>
            {agents.map((a) => {
              const status = statusById[a.id];
              return (
                <NavRow
                  key={a.id}
                  href={`/agents/${a.id}`}
                  label={a.name}
                  accent={a.accent}
                  active={pathname === `/agents/${a.id}`}
                  icon={<AgentAvatar agent={a.id} size={22} />}
                  onNavigate={onNavigate}
                  trailing={
                    <span
                      title={status ? status.detail : "checking…"}
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: status?.connected ? "#4ade80" : "rgba(244,239,230,0.18)",
                        boxShadow: status?.connected ? "0 0 7px #4ade80" : "none",
                      }}
                    />
                  }
                />
              );
            })}
          </>
        )}

        {!agents.length && !features.length && (
          <p className="px-5 py-6 text-[12px] text-[var(--fg-mute)]">Nothing matches “{query}”.</p>
        )}
      </nav>

      <div className="shrink-0 border-t border-[var(--line)] px-5 py-4">
        <div className="flex items-center justify-between text-[11px] text-[var(--fg-mute)]">
          <span className="mono">127.0.0.1:4400</span>
          <span className="flex items-center gap-1">
            <Command size={11} /> K
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside
        className="hidden shrink-0 border-r border-[var(--line)] md:flex md:flex-col"
        style={{ width: "var(--sidebar-w)", height: "100dvh", background: "rgba(18,14,24,0.72)", backdropFilter: "blur(18px)" }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="btn fixed left-4 top-4 z-40 h-10 w-10 !px-0 md:hidden"
      >
        <Menu size={17} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="fixed inset-y-0 left-0 z-50 border-r border-[var(--line)] md:hidden"
              style={{ width: "var(--sidebar-w)", background: "var(--bg-mid)" }}
            >
              <SidebarContent onNavigate={() => setOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
