/**
 * Missions — Oh My Pi orchestrating the Agency across every harness.
 *
 * One brief in. The lead integrator (Oh My Pi when installed; otherwise the
 * anchor agent, honestly labeled as standing in) reads the Agency roster and
 * the harnesses actually connected on this machine, picks the fewest
 * specialists that cover the goal, assigns each to the best-fitting harness,
 * runs them with the specialist's real personality file inlined, and
 * integrates the outputs into one deliverable.
 *
 * Design choices that keep it simple and honest:
 *  - A specialist is a personality; a harness is an engine. Inlining the
 *    personality into the prompt works identically on every harness — no
 *    per-tool install required, so a mission can run the day you clone.
 *  - Only connected harnesses are ever assigned. An unconnected pick in the
 *    plan is repaired to the anchor and the repair is reported, not hidden.
 *  - Every mission is written to ~/.baseline-workforce/missions/ so history
 *    survives restarts.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AGENT_BY_ID, type AgentSpec } from "./agents";
import { allStatuses, customAgentSpecs } from "./agents.server";
import { agencyAgentBody, agencyOverview, agencyDivision, type AgencyAgent } from "./agency.server";
import { chatStream, makeStreamId } from "./chatStream";
import { WORKFORCE_HOME } from "./config";

export const MISSIONS_DIR = path.join(WORKFORCE_HOME, "missions");

export interface MissionStep {
  specialist: string; // slug
  division: string;
  specialistName: string;
  harness: string; // agent id
  task: string;
  /** Set when the planner's harness pick wasn't connected and we repaired it. */
  reassignedFrom?: string;
  output?: string;
  ok?: boolean;
}

export interface MissionRecord {
  id: string;
  goal: string;
  lead: string;
  leadStandIn: boolean;
  createdAt: number;
  status: "planning" | "running" | "integrating" | "done" | "failed";
  steps: MissionStep[];
  final: string;
  error?: string;
}

type Emit = (obj: Record<string, unknown>) => void;

// ── inputs the planner sees ─────────────────────────────────────────────────

/** Harnesses that can actually take a text task right now. */
async function connectedHarnesses(): Promise<AgentSpec[]> {
  const statuses = await allStatuses(false);
  const ready = new Set(statuses.filter((s) => s.connected).map((s) => String(s.id)));
  const all = [...Object.values(AGENT_BY_ID), ...customAgentSpecs()];
  // Fusion is a composition and Higgsfield is a media provider — neither is a
  // text-task harness for a specialist to inhabit.
  return all.filter((a) => ready.has(a.id) && a.id !== "fusion" && a.id !== "higgsfield");
}

interface RosterEntry {
  slug: string;
  division: string;
  name: string;
  description: string;
}

function rosterCatalog(): RosterEntry[] {
  const overview = agencyOverview();
  if (!overview.repoFound) return [];
  const out: RosterEntry[] = [];
  for (const d of overview.divisions) {
    for (const a of agencyDivision(d.slug)) {
      out.push({ slug: a.slug, division: a.division, name: a.name, description: a.description.slice(0, 110) });
    }
  }
  return out;
}

function pickLead(harnesses: AgentSpec[]): { lead: AgentSpec; standIn: boolean } {
  const omp = harnesses.find((h) => h.id === "ohmypi");
  if (omp) return { lead: omp, standIn: false };
  const claude = harnesses.find((h) => h.id === "claude");
  if (claude) return { lead: claude, standIn: true };
  return { lead: harnesses[0], standIn: true };
}

// ── talking to a harness ────────────────────────────────────────────────────

/** Run one prompt through a harness and collect the reply text. */
async function runOnHarness(spec: AgentSpec, prompt: string, emit: Emit, tag: string): Promise<string> {
  const stream = chatStream({
    spec,
    prompt,
    history: [],
    streamId: makeStreamId(),
    permissionMode: "plan", // missions produce text; nothing writes files behind your back
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let acc = "";
  let finals = "";
  let errText = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line) as Record<string, unknown>;
        if (evt.t === "delta" && typeof evt.text === "string") {
          acc += evt.text;
          emit({ t: "mission-delta", tag, text: evt.text });
        } else if (evt.t === "final" && typeof evt.text === "string") {
          finals = evt.text;
        } else if (evt.t === "tool") {
          emit({ t: "mission-tool", tag, name: evt.name, detail: evt.detail });
        } else if (evt.t === "err" && typeof evt.text === "string") {
          errText += evt.text;
        }
      } catch {
        /* non-JSON noise from a harness is ignorable here */
      }
    }
  }
  const text = (acc.trim() || finals.trim());
  if (!text && errText.trim()) throw new Error(errText.trim().slice(0, 500));
  return text;
}

// ── planning ────────────────────────────────────────────────────────────────

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function planPrompt(goal: string, roster: RosterEntry[], harnesses: AgentSpec[]): string {
  const rosterLines = roster.map((r) => `${r.division}/${r.slug} — ${r.name}: ${r.description}`).join("\n");
  const harnessLines = harnesses
    .map((h) => `${h.id} — ${h.name}: ${h.tagline}${h.buildsFiles ? " (strong at code)" : ""}`)
    .join("\n");
  return `You are the lead integrator of an AI agency. Plan the smallest team that fully covers this mission.

MISSION:
${goal}

SPECIALIST ROSTER (personality files; pick by fit):
${rosterLines}

CONNECTED HARNESSES (engines that will run each specialist; pick by fit — coding harnesses for code, fast/cheap ones for simple text, and spread work across harnesses when it genuinely helps):
${harnessLines}

Rules:
- 1 to 4 steps. Fewest specialists that cover the mission — never pad the team.
- Each step's task is a complete, self-contained brief for that specialist (they see nothing else).
- Steps run in order; a later task may say "building on the previous specialist's output" — the runner passes it along.
- Use exact slugs and harness ids from the lists above.

Reply with ONLY this JSON, no markdown fences:
{"steps":[{"specialist":"<division>/<slug>","harness":"<harness id>","task":"..."}],"integration":"one line on how you will integrate the outputs"}`;
}

interface PlannedStep {
  specialist: string;
  harness: string;
  task: string;
}

function repairPlan(
  raw: Record<string, unknown> | null,
  roster: RosterEntry[],
  harnesses: AgentSpec[],
  anchor: AgentSpec,
): { steps: MissionStep[]; notes: string[] } {
  const notes: string[] = [];
  const bySlug = new Map(roster.map((r) => [`${r.division}/${r.slug}`, r]));
  const alsoBySlugOnly = new Map(roster.map((r) => [r.slug, r]));
  const harnessIds = new Set<string>(harnesses.map((h) => h.id));
  const steps: MissionStep[] = [];
  const list = Array.isArray(raw?.steps) ? (raw?.steps as PlannedStep[]) : [];
  for (const s of list.slice(0, 4)) {
    if (!s || typeof s.task !== "string" || !s.task.trim()) continue;
    const key = String(s.specialist ?? "");
    const entry = bySlug.get(key) ?? alsoBySlugOnly.get(key.split("/").pop() ?? "");
    if (!entry) {
      notes.push(`dropped a step — unknown specialist "${key}"`);
      continue;
    }
    let harness = String(s.harness ?? "");
    let reassignedFrom: string | undefined;
    if (!harnessIds.has(harness)) {
      reassignedFrom = harness || "(none)";
      harness = anchor.id;
      notes.push(`"${entry.name}" reassigned to ${anchor.name} — ${reassignedFrom} is not connected`);
    }
    steps.push({
      specialist: entry.slug,
      division: entry.division,
      specialistName: entry.name,
      harness,
      reassignedFrom,
      task: s.task.trim(),
    });
  }
  return { steps, notes };
}

/** A reply that is only a CLI/provider failure banner, not actual work. */
function looksLikeHarnessError(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return t.length < 200 && /^(API Error|Error:|Unable to connect|Connection(Refused| refused)|ECONNREFUSED|fetch failed|401 |403 |rate.?limit)/i.test(t);
}

// ── the mission ─────────────────────────────────────────────────────────────

function personalityPrompt(agent: AgencyAgent | null, body: string | null, task: string, priorOutput: string): string {
  const persona = body
    ? `Adopt this specialist personality COMPLETELY — its voice, workflow and standards:\n\n${body.slice(0, 8_000)}\n\n---\n`
    : "";
  const context = priorOutput
    ? `\nOutput from the previous specialist on this mission (build on it, don't repeat it):\n---\n${priorOutput.slice(0, 6_000)}\n---\n`
    : "";
  return `${persona}${context}
Your task on this mission (reply with the finished deliverable itself, not a plan to make it):

${task}`;
}

function saveMission(m: MissionRecord): void {
  mkdirSync(MISSIONS_DIR, { recursive: true });
  writeFileSync(path.join(MISSIONS_DIR, `${m.id}.json`), JSON.stringify(m, null, 2));
}

export function listMissions(limit = 30): MissionRecord[] {
  if (!existsSync(MISSIONS_DIR)) return [];
  const out: MissionRecord[] = [];
  for (const f of readdirSync(MISSIONS_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(readFileSync(path.join(MISSIONS_DIR, f), "utf8")) as MissionRecord);
    } catch {
      /* one bad record must not hide history */
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function runMission(goal: string, emit: Emit): Promise<MissionRecord> {
  const mission: MissionRecord = {
    id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    goal,
    lead: "",
    leadStandIn: false,
    createdAt: Date.now(),
    status: "planning",
    steps: [],
    final: "",
  };

  const harnesses = await connectedHarnesses();
  if (!harnesses.length) {
    mission.status = "failed";
    mission.error = "No harness is connected — connect at least one agent (Claude Code is enough to start).";
    saveMission(mission);
    emit({ t: "err", text: mission.error });
    return mission;
  }
  const roster = rosterCatalog();
  if (!roster.length) {
    mission.status = "failed";
    mission.error = "The Agency roster is not available — clone agency-agents-v2 first (see the Agency page).";
    saveMission(mission);
    emit({ t: "err", text: mission.error });
    return mission;
  }

  const { lead, standIn } = pickLead(harnesses);
  mission.lead = lead.id;
  mission.leadStandIn = standIn;
  emit({
    t: "mission-lead",
    lead: lead.id,
    leadName: lead.name,
    standIn,
    detail: standIn ? `Oh My Pi is not installed — ${lead.name} is standing in as lead integrator` : "Oh My Pi is leading this mission",
  });
  saveMission(mission);

  // 1 · plan
  emit({ t: "mission-phase", phase: "planning" });
  let planText = "";
  try {
    planText = await runOnHarness(lead, planPrompt(goal, roster, harnesses), emit, "plan");
  } catch (e) {
    mission.status = "failed";
    mission.error = `Planning failed: ${e instanceof Error ? e.message : String(e)}`;
    saveMission(mission);
    emit({ t: "err", text: mission.error });
    return mission;
  }
  const anchor = harnesses.find((h) => h.id === "claude") ?? lead;
  const { steps, notes } = repairPlan(extractJson(planText), roster, harnesses, anchor);
  for (const n of notes) emit({ t: "mission-note", text: n });
  if (!steps.length) {
    mission.status = "failed";
    mission.error = "The lead did not produce a usable plan — try rephrasing the mission.";
    saveMission(mission);
    emit({ t: "err", text: mission.error });
    return mission;
  }
  mission.steps = steps;
  mission.status = "running";
  saveMission(mission);
  emit({
    t: "mission-plan",
    steps: steps.map((s) => ({
      specialist: s.specialist,
      specialistName: s.specialistName,
      division: s.division,
      harness: s.harness,
      task: s.task,
      reassignedFrom: s.reassignedFrom ?? null,
    })),
  });

  // 2 · run each specialist on its harness, passing output forward
  let prior = "";
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let spec = harnesses.find((h) => h.id === step.harness) ?? anchor;
    emit({ t: "mission-step", index: i, state: "running" });
    const body = agencyAgentBody(step.division, step.specialist);
    const agents = agencyDivision(step.division);
    const agent = agents.find((a) => a.slug === step.specialist) ?? null;
    const prompt = () => personalityPrompt(agent, body, step.task, prior);
    try {
      let output = await runOnHarness(spec, prompt(), emit, `step-${i}`);
      // A harness can "succeed" while emitting only its own failure banner
      // (dead proxy, missing key). That is a failure — and it gets one honest
      // retry on the anchor rather than a silent pass.
      if (looksLikeHarnessError(output) && spec.id !== anchor.id) {
        emit({ t: "mission-note", text: `"${step.specialistName}" got a broken reply from ${spec.name} ("${output.slice(0, 80)}") — retrying on ${anchor.name}` });
        step.reassignedFrom = spec.id;
        step.harness = anchor.id;
        spec = anchor;
        output = await runOnHarness(spec, prompt(), emit, `step-${i}`);
      }
      const broken = looksLikeHarnessError(output);
      step.output = output;
      step.ok = Boolean(output.trim()) && !broken;
      if (step.ok) prior = output;
      emit({ t: "mission-step", index: i, state: step.ok ? "done" : "failed", detail: broken ? output.slice(0, 200) : undefined });
    } catch (e) {
      step.ok = false;
      step.output = `(${spec.name} failed: ${e instanceof Error ? e.message : String(e)})`;
      emit({ t: "mission-step", index: i, state: "failed", detail: step.output });
    }
    saveMission(mission);
  }

  // 3 · integrate
  const good = steps.filter((s) => s.ok);
  if (!good.length) {
    mission.status = "failed";
    mission.error = "Every step failed — nothing to integrate.";
    saveMission(mission);
    emit({ t: "err", text: mission.error });
    return mission;
  }
  mission.status = "integrating";
  emit({ t: "mission-phase", phase: "integrating" });
  const integrationPrompt = `You are the lead integrator. Combine your specialists' outputs into ONE polished deliverable for the operator. No meta-commentary about the process — just the finished result, well organised.

MISSION: ${goal}

${good.map((s) => `--- ${s.specialistName} (${s.division}, ran on ${s.harness}) ---\n${(s.output ?? "").slice(0, 10_000)}`).join("\n\n")}`;
  try {
    mission.final = await runOnHarness(lead, integrationPrompt, emit, "integrate");
    mission.status = "done";
  } catch (e) {
    // Integration failing shouldn't lose the specialists' work.
    mission.final = good.map((s) => `## ${s.specialistName}\n\n${s.output}`).join("\n\n");
    mission.status = "done";
    emit({ t: "mission-note", text: `integration step failed (${e instanceof Error ? e.message : String(e)}) — outputs joined as-is` });
  }
  saveMission(mission);
  emit({ t: "mission-final", text: mission.final });
  return mission;
}
