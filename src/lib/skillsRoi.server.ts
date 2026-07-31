/**
 * Skills ROI — minutes-per-run × runs × hourly rate, with the source app's
 * honesty rule intact: every estimate defaults to zero, so the page says
 * "$0 · configure your estimates" until the operator enters real numbers.
 * Nothing here invents value.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { listSkills } from "./claudeData";
import { loadConfig, WORKFORCE_HOME } from "./config";

const ROI_PATH = path.join(WORKFORCE_HOME, "skills-roi.json");

export interface RoiEstimate {
  minutesPerRun: number;
  runsPerMonth: number;
}

export interface SkillRoiRow {
  name: string;
  source: string;
  description: string;
  minutesPerRun: number;
  runsPerMonth: number;
  savedUsdPerMonth: number;
  savedMinutesPerMonth: number;
}

export interface RoiReport {
  hourlyRateUsd: number;
  totalUsdPerMonth: number;
  totalMinutesPerMonth: number;
  configuredCount: number;
  skillCount: number;
  rows: SkillRoiRow[];
}

function readEstimates(): Record<string, RoiEstimate> {
  try {
    if (!existsSync(ROI_PATH)) return {};
    return JSON.parse(readFileSync(ROI_PATH, "utf8")) as Record<string, RoiEstimate>;
  } catch {
    return {};
  }
}

export function setEstimate(name: string, est: RoiEstimate): void {
  const all = readEstimates();
  all[name] = {
    minutesPerRun: Math.max(0, Number(est.minutesPerRun) || 0),
    runsPerMonth: Math.max(0, Number(est.runsPerMonth) || 0),
  };
  mkdirSync(WORKFORCE_HOME, { recursive: true });
  const tmp = `${ROI_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2));
  renameSync(tmp, ROI_PATH);
}

export async function buildRoiReport(): Promise<RoiReport> {
  const cfg = loadConfig();
  const skills = await listSkills().catch(() => []);
  const estimates = readEstimates();
  const rows: SkillRoiRow[] = skills.map((sk) => {
    const est = estimates[sk.name] ?? { minutesPerRun: 0, runsPerMonth: 0 };
    const savedMinutes = est.minutesPerRun * est.runsPerMonth;
    return {
      name: sk.name,
      source: sk.source,
      description: sk.description,
      minutesPerRun: est.minutesPerRun,
      runsPerMonth: est.runsPerMonth,
      savedMinutesPerMonth: savedMinutes,
      savedUsdPerMonth: Math.round((savedMinutes / 60) * cfg.hourlyRateUsd),
    };
  });
  rows.sort((a, b) => b.savedUsdPerMonth - a.savedUsdPerMonth || a.name.localeCompare(b.name));
  return {
    hourlyRateUsd: cfg.hourlyRateUsd,
    totalUsdPerMonth: rows.reduce((a, r) => a + r.savedUsdPerMonth, 0),
    totalMinutesPerMonth: rows.reduce((a, r) => a + r.savedMinutesPerMonth, 0),
    configuredCount: rows.filter((r) => r.minutesPerRun > 0 && r.runsPerMonth > 0).length,
    skillCount: rows.length,
    rows,
  };
}

// ── Shared library (~/.claude-os/skills/SKILL_INDEX.json, read-only) ────────

export interface LibrarySkill {
  slug: string;
  name: string;
  category: string;
  summary: string;
  origin: "shared-index" | "imported-catalog";
}

const LIBRARY_INDEX = path.join(os.homedir(), ".claude-os", "skills", "SKILL_INDEX.json");

/** The 12-skill imported catalogue, ported from Baseline Agent OS. */
const IMPORTED: LibrarySkill[] = [
  { slug: "business-insight", name: "Business Insight Dashboard", category: "Data", summary: "Turn workspace/revenue data into an executive insight + revenue dashboard.", origin: "imported-catalog" },
  { slug: "seo-geo-blog", name: "SEO/GEO Blog Engine", category: "Content", summary: "Draft geo-targeted SEO articles with internal-link plans.", origin: "imported-catalog" },
  { slug: "video-scripts", name: "Video Script Writer", category: "Content", summary: "Long-form video scripts in the operator's proven outline.", origin: "imported-catalog" },
  { slug: "lead-scraper", name: "Lead Scraper", category: "Growth", summary: "Collect and normalise prospect lists from open sources.", origin: "imported-catalog" },
  { slug: "outreach-sequencer", name: "Outreach Sequencer", category: "Growth", summary: "Multi-touch outreach sequences from an ICP + offer.", origin: "imported-catalog" },
  { slug: "invoice-runner", name: "Invoice Runner", category: "Ops", summary: "Generate and track invoices from engagement notes.", origin: "imported-catalog" },
  { slug: "meeting-notes", name: "Meeting Notes Distiller", category: "Ops", summary: "Raw transcripts → decisions, owners, deadlines.", origin: "imported-catalog" },
  { slug: "competitor-watch", name: "Competitor Watch", category: "Research", summary: "Standing brief on competitor moves worth reacting to.", origin: "imported-catalog" },
  { slug: "app-demo-video", name: "App Demo Video", category: "Content", summary: "Screen-capture demo walkthroughs with narration beats.", origin: "imported-catalog" },
  { slug: "brand-kit", name: "Brand Kit Builder", category: "Creative", summary: "Logo directions, palette and typography from a one-line brief.", origin: "imported-catalog" },
  { slug: "changelog-writer", name: "Changelog Writer", category: "Ops", summary: "Commit history → human release notes.", origin: "imported-catalog" },
  { slug: "kb-curator", name: "Knowledge Base Curator", category: "Data", summary: "Cluster scattered notes into a navigable knowledge base.", origin: "imported-catalog" },
];

export interface LibraryReport {
  indexPath: string;
  indexFound: boolean;
  skills: LibrarySkill[];
}

export function readLibrary(): LibraryReport {
  let indexed: LibrarySkill[] = [];
  const indexFound = existsSync(LIBRARY_INDEX);
  if (indexFound) {
    try {
      const raw = JSON.parse(readFileSync(LIBRARY_INDEX, "utf8")) as unknown;
      const list = Array.isArray(raw) ? raw : ((raw as { skills?: unknown[] }).skills ?? []);
      indexed = (list as Record<string, unknown>[]).map((s) => ({
        slug: String(s.slug ?? s.id ?? s.name ?? ""),
        name: String(s.name ?? s.slug ?? ""),
        category: String(s.category ?? "Uncategorised"),
        summary: String(s.summary ?? s.description ?? ""),
        origin: "shared-index" as const,
      }));
    } catch {
      indexed = [];
    }
  }
  return { indexPath: LIBRARY_INDEX, indexFound, skills: [...indexed, ...IMPORTED] };
}
