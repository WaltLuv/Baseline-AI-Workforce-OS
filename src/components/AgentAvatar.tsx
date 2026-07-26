"use client";

import { motion } from "framer-motion";
import type { AgentId } from "@/lib/agents";
import { AGENT_BY_ID } from "@/lib/agents";

/**
 * Every agent gets its own mark. Drawn inline as SVG so the app has no image
 * dependencies and the logos stay crisp at any size.
 */
const GLYPHS: Record<AgentId, (s: number) => React.ReactNode> = {
  claude: (s) => (
    <svg width={s * 0.56} height={s * 0.56} viewBox="0 0 24 24" fill="none">
      <path d="M12 2 13.7 9.1 21 10.9 13.7 12.8 12 22 10.3 12.8 3 10.9 10.3 9.1Z" fill="white" opacity="0.96" />
    </svg>
  ),
  codex: (s) => (
    <svg width={s * 0.58} height={s * 0.58} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 7 4.5 12 9 17M15 7l4.5 5L15 17" />
    </svg>
  ),
  openclaw: (s) => (
    <svg width={s * 0.6} height={s * 0.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round">
      <path d="M5.5 4C8.5 8 8.5 15 5.5 19.5M11.5 3c3 4.5 3 13.5 0 18M17.5 5c2 4 2 10 0 14" />
    </svg>
  ),
  hermes: (s) => (
    <svg width={s * 0.6} height={s * 0.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4.5v16M12 6C9 9 6.5 8.2 4.5 6c1.5 3.8 4.2 5 7.5 4 3.3 1 6-.2 7.5-4-2 2.2-4.5 3-7.5 0" />
      <circle cx="12" cy="3" r="1.3" fill="white" stroke="none" />
    </svg>
  ),
  antigravity: (s) => (
    <svg width={s * 0.58} height={s * 0.58} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round">
      <path d="M12 20V5M12 4 7.5 9.5M12 4l4.5 5.5" />
      <ellipse cx="12" cy="20.5" rx="6" ry="1.6" opacity="0.55" />
    </svg>
  ),
  kimi: (s) => (
    <svg width={s * 0.58} height={s * 0.58} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 4v16M6 12l7-8M6 12l8 8" />
    </svg>
  ),
  grok: (s) => (
    <svg width={s * 0.56} height={s * 0.56} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 20 20 4M14 4h6v6" />
    </svg>
  ),
  opencode: (s) => (
    <svg width={s * 0.58} height={s * 0.58} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M7.5 10 10 12.5 7.5 15M12.5 15.5h4" />
    </svg>
  ),
  freeclaude: (s) => (
    <svg width={s * 0.56} height={s * 0.56} viewBox="0 0 24 24" fill="none">
      <path d="M12 2.5 13.5 9 20 10.5 13.5 12 12 18.5 10.5 12 4 10.5 10.5 9Z" fill="white" opacity="0.95" />
      <path d="M6 20h12" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  ruflo: (s) => (
    <svg width={s * 0.58} height={s * 0.58} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6">
      <circle cx="12" cy="12" r="2.4" />
      <circle cx="12" cy="4" r="1.8" />
      <circle cx="19" cy="16" r="1.8" />
      <circle cx="5" cy="16" r="1.8" />
      <path d="M12 6.4v3.2M13.9 13.4 17.3 15M10.1 13.4 6.7 15" />
    </svg>
  ),
  local: (s) => (
    <svg width={s * 0.58} height={s * 0.58} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinejoin="round">
      <rect x="5" y="5" width="14" height="14" rx="2.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.2" />
      <path d="M9 2.5v2.5M15 2.5v2.5M9 19v2.5M15 19v2.5M2.5 9H5M2.5 15H5M19 9h2.5M19 15h2.5" strokeLinecap="round" />
    </svg>
  ),
  glm: (s) => (
    <svg width={s * 0.58} height={s * 0.58} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7.5A8 8 0 1 0 20 16.5M20 12h-5" />
    </svg>
  ),
  glmcode: (s) => (
    <svg width={s * 0.58} height={s * 0.58} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 8a7 7 0 1 0 0 8" />
      <path d="M15.5 9.5 18 12l-2.5 2.5" />
    </svg>
  ),
  omniroute: (s) => (
    <svg width={s * 0.58} height={s * 0.58} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="19" cy="6" r="2.2" />
      <circle cx="19" cy="18" r="2.2" />
      <path d="M7.2 11.2 16.8 6.8M7.2 12.8l9.6 4.4" />
    </svg>
  ),
  hy3: (s) => (
    <svg width={s * 0.58} height={s * 0.58} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
      <path d="M5 5v14M13 5v14M5 12h8" />
      <path d="M17 8h3l-2.5 3.5H20L16.5 16" />
    </svg>
  ),
  fusion: (s) => (
    <svg width={s * 0.58} height={s * 0.58} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7">
      <circle cx="9" cy="12" r="5" opacity="0.9" />
      <circle cx="15" cy="12" r="5" opacity="0.9" />
    </svg>
  ),
  sakana: (s) => (
    <svg width={s * 0.6} height={s * 0.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinejoin="round">
      <path d="M3 12c3-4.5 8-6 12-4.5 2 .8 3.4 2.4 4.2 4.5-.8 2.1-2.2 3.7-4.2 4.5C11 18 6 16.5 3 12Z" />
      <circle cx="15.5" cy="10.6" r="0.9" fill="white" stroke="none" />
    </svg>
  ),
};

interface Props {
  agent: AgentId | string;
  size?: number;
  /** Soft glow ring — used while an agent is streaming. */
  live?: boolean;
  className?: string;
}

export default function AgentAvatar({ agent, size = 34, live = false, className = "" }: Props) {
  const spec = AGENT_BY_ID[agent];
  const glyph = GLYPHS[agent as AgentId];
  const gradient = spec?.gradient ?? "linear-gradient(135deg,#9d93a6,#4b445a)";
  const accent = spec?.accent ?? "#9d93a6";

  return (
    <motion.span
      className={`relative grid shrink-0 place-items-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        background: gradient,
        boxShadow: live ? `0 0 0 2px ${accent}55, 0 0 18px ${accent}66` : `0 2px 10px ${accent}33`,
      }}
      animate={live ? { scale: [1, 1.05, 1] } : { scale: 1 }}
      transition={live ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
      aria-hidden
    >
      {glyph ? (
        glyph(size)
      ) : (
        <span style={{ fontSize: size * 0.42, fontWeight: 700, color: "#fff" }}>
          {(spec?.name ?? String(agent)).slice(0, 1).toUpperCase()}
        </span>
      )}
    </motion.span>
  );
}
