"use client";

import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import type { ReactNode } from "react";
import type { RequirementStatus } from "@/lib/features";

/**
 * A translucent version of any accent colour.
 *
 * Appending hex alpha (`${accent}44`) only works when the accent is a literal
 * hex. Half the accents in this app are CSS variables, and `var(--gold)44` is
 * invalid CSS — the browser throws the whole declaration away, which is how the
 * token chart ended up drawing nothing at all. color-mix handles both.
 */
export function alpha(color: string, percent: number) {
  return `color-mix(in oklab, ${color} ${percent}%, transparent)`;
}

/** Resolve a lucide icon by name, with a safe fallback. */
export function Icon({ name, size = 16, className = "" }: { name: string; size?: number; className?: string }) {
  const map = Icons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>;
  const Cmp = map[name] ?? Icons.Circle;
  return <Cmp size={size} className={className} />;
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-[1400px] px-6 pb-24 pt-7 md:px-9"
    >
      {children}
    </motion.div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  accent = "var(--gold)",
  icon,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  accent?: string;
  icon?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3.5">
        {icon && (
          <span
            className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl border"
            style={{ borderColor: alpha(accent, 27), background: alpha(accent, 9), color: accent }}
          >
            <Icon name={icon} size={20} />
          </span>
        )}
        <div>
          {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
          <h1>{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-[var(--fg-dim)]">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  children,
  className = "",
  title,
  subtitle,
  actions,
  padded = true,
}: {
  children?: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3.5">
          <div>
            {title && <h2 className="text-[14px] font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12px] text-[var(--fg-dim)]">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function StatusPill({ ready, label }: { ready: boolean; label?: string }) {
  return (
    <span className={`pill ${ready ? "pill-ready" : "pill-setup"}`}>
      <span className="dot" />
      {label ?? (ready ? "Ready" : "Setup needed")}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  accent = "var(--gold)",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
  icon?: string;
}) {
  return (
    <div className="panel panel-hover p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        {icon && (
          <span style={{ color: accent }}>
            <Icon name={icon} size={15} />
          </span>
        )}
      </div>
      <div className="text-[26px] font-semibold leading-none tracking-tight" style={{ color: accent }}>
        {value}
      </div>
      {hint && <div className="mt-2 text-[11.5px] text-[var(--fg-mute)]">{hint}</div>}
    </div>
  );
}

export function EmptyState({ icon = "Inbox", title, body }: { icon?: string; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-[var(--line)] text-[var(--fg-mute)]">
        <Icon name={icon} size={20} />
      </span>
      <p className="text-[14px] font-medium text-[var(--fg-soft)]">{title}</p>
      {body && <p className="max-w-md text-[12.5px] leading-relaxed text-[var(--fg-mute)]">{body}</p>}
    </div>
  );
}

/**
 * Honest "not wired up yet" panel: says what is missing and the exact command
 * that fixes it. Never blocks the rest of the page.
 */
export function SetupNeeded({
  title,
  requirements,
  note,
}: {
  title: string;
  requirements: RequirementStatus[];
  note?: string;
}) {
  const missing = requirements.filter((r) => !r.met);
  if (!missing.length) return null;
  return (
    <div className="panel border-[rgba(251,191,36,0.28)] p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="text-amber-300">
          <Icon name="TriangleAlert" size={17} />
        </span>
        <h2 className="text-[14px] font-semibold text-amber-100">{title}</h2>
      </div>
      <div className="space-y-3">
        {missing.map((r) => (
          <div key={r.label} className="rounded-xl border border-[var(--line)] bg-[rgba(13,10,18,0.5)] p-3.5">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-[var(--fg-soft)]">{r.label}</span>
              <span className="pill pill-setup">
                <span className="dot" />
                {r.detail}
              </span>
            </div>
            <pre className="mono overflow-x-auto whitespace-pre-wrap text-[var(--fg-dim)]">{r.install}</pre>
          </div>
        ))}
      </div>
      {note && <p className="mt-3 text-[12px] leading-relaxed text-[var(--fg-mute)]">{note}</p>}
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
}) {
  return (
    <div className="mb-5 inline-flex flex-wrap gap-1 rounded-xl border border-[var(--line)] bg-[rgba(13,10,18,0.45)] p-1">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className="relative rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition"
          style={{ color: active === t ? "var(--fg)" : "var(--fg-dim)" }}
        >
          {active === t && (
            <motion.span
              layoutId={`tab-${tabs.join("-")}`}
              className="absolute inset-0 rounded-lg border border-[var(--line-strong)] bg-[rgba(244,239,230,0.08)]"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className="relative">{t}</span>
        </button>
      ))}
    </div>
  );
}

/** Tiny inline bar chart — no chart library, no external requests. */
export function Sparkbars({
  data,
  accent = "var(--gold)",
  height = 44,
}: {
  data: { label: string; value: number }[];
  accent?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => (
        <motion.div
          key={`${d.label}-${i}`}
          title={`${d.label}: ${d.value.toLocaleString()}`}
          initial={{ height: "0%" }}
          animate={{ height: `${(d.value / max) * 100}%` }}
          transition={{ delay: i * 0.02, duration: 0.4, ease: "easeOut" }}
          className="flex-1 rounded-t-[3px]"
          style={{
            background: `linear-gradient(180deg, ${accent}, ${alpha(accent, 27)})`,
            minWidth: 4,
            // Heights stay linear so the bars never overstate a day. The floor
            // only guarantees that a day with work on it does not vanish next to
            // a day ten times its size.
            minHeight: d.value > 0 ? 3 : 0,
          }}
        />
      ))}
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
      className="inline-grid place-items-center"
      style={{ width: size, height: size }}
    >
      <Icons.LoaderCircle size={size} />
    </motion.span>
  );
}

export function relTime(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function compact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}
