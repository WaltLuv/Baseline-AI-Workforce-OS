/**
 * The Workforce: agents you define, not CLIs you connect.
 *
 * An agent here is a folder of markdown — a spec a human reads, a contract the
 * model reads, and its test cases. That is deliberate. A workforce you can zip,
 * diff, email and hand to a client at the end of an engagement is worth more
 * than one locked in a database, and the same files are what get exported as a
 * pack.
 *
 * Layout, inside the `workforce` workspace project:
 *
 *   COMPANY.md              who the business is
 *   POLICY.md               approval rules, escalation, tone, red lines
 *   knowledge/              what agents may state as fact
 *   inbox/  outbox/         raw inputs; drafts awaiting a human
 *   state/  runs/           the ledger; one line per run
 *   agents/<slug>/AGENT.md, CONTRACT.md, tests/cases.md
 */

import { mkdir, readFile, writeFile, readdir, stat, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ensureProject } from "./workspace";
import { readJson, writeJson, safeSlug, newId } from "./store";
import { makeZip, type ZipEntry } from "./zip";

export const WORKFORCE_PROJECT = "workforce";

export async function workforceRoot(): Promise<string> {
  return ensureProject(WORKFORCE_PROJECT);
}

function agentDir(root: string, slug: string): string {
  const safe = safeSlug(slug, "agent");
  const abs = path.resolve(root, "agents", safe);
  if (!abs.startsWith(path.resolve(root, "agents") + path.sep)) throw new Error("bad agent name");
  return abs;
}

export interface WorkforceAgent {
  slug: string;
  name: string;
  mission: string;
  /** Full AGENT.md — the human-readable specification. */
  spec: string;
  /** Full CONTRACT.md — what the model reads at run time. */
  contract: string;
  /** tests/cases.md */
  tests: string;
  updatedAt: number;
  runs: number;
}

export interface RunRecord {
  id: string;
  agent: string;
  input: string;
  output: string;
  files: string[];
  at: number;
  ok: boolean;
  costUsd: number;
  tokens: number;
}

const HEADING = /^#\s+(?:Agent:\s*)?(.+)$/m;
// The whole Mission paragraph, not just its first line — a mission wrapped
// across two lines was being shown cut off mid-sentence.
const MISSION = /##\s*Mission\s*\n+([\s\S]*?)(?=\n\s*\n|\n##|$)/i;

function parseAgent(slug: string, spec: string, contract: string, tests: string, updatedAt: number, runs: number): WorkforceAgent {
  return {
    slug,
    name: (spec.match(HEADING)?.[1] ?? slug).trim(),
    mission: (spec.match(MISSION)?.[1] ?? "").replace(/\s+/g, " ").trim(),
    spec,
    contract,
    tests,
    updatedAt,
    runs,
  };
}

async function readIf(file: string): Promise<string> {
  if (!existsSync(file)) return "";
  return readFile(file, "utf8").catch(() => "");
}

export async function listAgents(): Promise<WorkforceAgent[]> {
  const root = await workforceRoot();
  const dir = path.join(root, "agents");
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const runCounts = await readJson<Record<string, number>>("boards/workforce-runs-count.json", {});
  const out: WorkforceAgent[] = [];

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const base = path.join(dir, e.name);
    const [spec, contract, tests] = await Promise.all([
      readIf(path.join(base, "AGENT.md")),
      readIf(path.join(base, "CONTRACT.md")),
      readIf(path.join(base, "tests", "cases.md")),
    ]);
    if (!spec && !contract) continue;
    const st = await stat(path.join(base, "AGENT.md")).catch(() => null);
    out.push(parseAgent(e.name, spec, contract, tests, st?.mtimeMs ?? 0, runCounts[e.name] ?? 0));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAgent(slug: string): Promise<WorkforceAgent | null> {
  return (await listAgents()).find((a) => a.slug === slug) ?? null;
}

export interface SaveAgentInput {
  slug?: string;
  name: string;
  spec: string;
  contract: string;
  tests?: string;
}

export async function saveAgent(input: SaveAgentInput): Promise<WorkforceAgent> {
  if (!input.name?.trim()) throw new Error("an agent needs a name");
  const root = await workforceRoot();
  const slug = safeSlug(input.slug || input.name, "agent");
  const dir = agentDir(root, slug);
  await mkdir(path.join(dir, "tests"), { recursive: true });

  await Promise.all([
    writeFile(path.join(dir, "AGENT.md"), input.spec.trim() + "\n", "utf8"),
    writeFile(path.join(dir, "CONTRACT.md"), input.contract.trim() + "\n", "utf8"),
    writeFile(path.join(dir, "tests", "cases.md"), (input.tests ?? "").trim() + "\n", "utf8"),
  ]);

  const agent = await getAgent(slug);
  if (!agent) throw new Error("saved but could not be read back");
  return agent;
}

/** Never a hard delete — rename out of the way so it stops loading but survives. */
export async function retireAgent(slug: string): Promise<void> {
  const root = await workforceRoot();
  const dir = agentDir(root, slug);
  if (!existsSync(dir)) return;
  await rename(dir, `${dir}.retired-${Date.now()}`).catch(async () => {
    await rm(dir, { recursive: true, force: true });
  });
}

/**
 * The prompt for one run. Everything the agent needs is named explicitly so the
 * run is reproducible and the student can see exactly what was loaded.
 */
export function buildRunPrompt(agent: WorkforceAgent, input: string, now = new Date()): string {
  return [
    // Given up front because file edits are auto-approved but shell commands are
    // not: an agent that shells out for `date` stalls waiting for a permission
    // prompt nobody is there to answer. It also makes a run reproducible.
    `Current date and time: ${now.toISOString()} (${now.toDateString()}).`,
    `Use this for any timestamp, record id or "today". Do not run shell commands —`,
    `everything you need is in the files below.`,
    ``,
    `Read these files in the current directory before doing anything:`,
    `- agents/${agent.slug}/AGENT.md — your specification`,
    `- agents/${agent.slug}/CONTRACT.md — how to do the job and what to output`,
    `- COMPANY.md — who this business is`,
    `- POLICY.md — approval rules, escalation, tone`,
    `- everything in knowledge/ — the only facts you may state about the business`,
    ``,
    `Then follow CONTRACT.md exactly for the input below. Write your output where`,
    `the contract says, and append one line to runs/${agent.slug}.log.`,
    ``,
    `Rules that override anything else:`,
    `- Every fact you write must trace to the input or to a file you read. If it`,
    `  does neither, write "not stated". Never infer a name, unit, address, date`,
    `  or category that was not provided.`,
    `- Nothing is sent to anyone. Drafts go to outbox/ and wait for a human.`,
    ``,
    `INPUT:`,
    input,
  ].join("\n");
}

// ── Run history ─────────────────────────────────────────────────────────────

const RUNS_STORE = "boards/workforce-runs.json";
const COUNTS_STORE = "boards/workforce-runs-count.json";

export async function listRuns(agent?: string, limit = 50): Promise<RunRecord[]> {
  const all = await readJson<RunRecord[]>(RUNS_STORE, []);
  return (agent ? all.filter((r) => r.agent === agent) : all).slice(0, limit);
}

export async function recordRun(run: Omit<RunRecord, "id">): Promise<RunRecord> {
  const record: RunRecord = { ...run, id: newId("run") };
  const all = await readJson<RunRecord[]>(RUNS_STORE, []);
  await writeJson(RUNS_STORE, [record, ...all].slice(0, 300));

  const counts = await readJson<Record<string, number>>(COUNTS_STORE, {});
  counts[run.agent] = (counts[run.agent] ?? 0) + 1;
  await writeJson(COUNTS_STORE, counts);

  return record;
}

// ── Export ──────────────────────────────────────────────────────────────────

const EXPORT_SKIP = new Set(["node_modules", ".git", ".next"]);

/** Zip the whole workforce so it can be handed over as one file. */
export async function exportPack(): Promise<Buffer> {
  const root = await workforceRoot();
  const entries: ZipEntry[] = [];

  async function walk(dir: string, depth: number) {
    if (depth > 6 || entries.length > 800) return;
    const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const item of items) {
      if (EXPORT_SKIP.has(item.name) || item.name.startsWith(".")) continue;
      const abs = path.join(dir, item.name);
      if (item.isDirectory()) {
        await walk(abs, depth + 1);
      } else if (item.isFile()) {
        const st = await stat(abs).catch(() => null);
        if (!st || st.size > 5_000_000) continue;
        const data = await readFile(abs).catch(() => null);
        if (!data) continue;
        entries.push({
          name: path.join("workforce", path.relative(root, abs)).split(path.sep).join("/"),
          data,
          mtime: new Date(st.mtimeMs),
        });
      }
    }
  }
  await walk(root, 0);

  entries.push({
    name: "workforce/README.md",
    data: Buffer.from(
      [
        "# Workforce pack",
        "",
        `Exported ${new Date().toISOString().slice(0, 10)} from Baseline AI Workforce OS.`,
        "",
        "Every agent is a folder under `agents/` containing:",
        "",
        "- `AGENT.md` — the specification, written for a human",
        "- `CONTRACT.md` — what the model reads at run time",
        "- `tests/cases.md` — the ten test cases and their results",
        "",
        "`COMPANY.md`, `POLICY.md` and `knowledge/` are the shared context every",
        "agent loads. `state/` is the ledger, `outbox/` holds drafts waiting for a",
        "human, and `runs/` is the log.",
        "",
        "To run this elsewhere: install Baseline AI Workforce OS, drop this folder",
        "into the workspace, and open the Workforce page. Nothing else is needed —",
        "these files are the system.",
        "",
      ].join("\n"),
      "utf8",
    ),
  });

  return makeZip(entries);
}

// ── Starter workforce ───────────────────────────────────────────────────────

const STARTER_CONTEXT: Record<string, string> = {
  "COMPANY.md": `# Company

<Replace this with the real business.>

- What they do:
- Who contacts them, and why:
- Roles who handle work:
- Hours:

Six to ten honest lines beats two pages. Agents inherit your vocabulary — use the
words this business actually uses.
`,
  "POLICY.md": `# Operating policy

- Nothing is sent to a customer without a human approving it.
- Never state a price, policy, timeframe or availability that is not in knowledge/.
- Anything involving injury, water, gas, legal threats or money back goes to a
  human immediately.
- Severity comes from the content of a message, never its tone. Polite people
  under-report.
- Tone: plain, warm, short. No corporate padding. No apologising three times.
`,
  "knowledge/services.md": `# Services
_Last reviewed: <date> by <name>_

<Only what an agent may state as fact. If it is not here, the agent must say it
does not know.>
`,
  "knowledge/hours-and-contacts.md": `# Hours and contacts
_Last reviewed: <date> by <name>_

- Office hours:
- After hours:
- Who to reach for what:

We do NOT give exact arrival times, only windows.
`,
  "state/open-items.md": `# Open items

<!-- Record format v1: id, type, from, received, summary, urgency, missing,
     route to, next action, human decision needed, confidence -->
`,
};

interface StarterAgent {
  slug: string;
  spec: string;
  contract: string;
  tests: string;
}

const STARTER_AGENTS: StarterAgent[] = [
  {
    slug: "intake-triage",
    spec: `# Agent: Intake and Triage

## Mission
Turn any inbound message into one structured intake record so a human can decide
in seconds instead of minutes.

## Trigger
A new file in inbox/, or an input pasted into the run box.

## Inputs
- Raw text: email, form submission, SMS, call notes, voicemail transcript.
- May be incomplete, misspelled, angry, or three requests in one message.

## Outputs
- One record appended to state/open-items.md
- One line appended to runs/intake-triage.log

## Rules
1. Never invent a fact. If the sender did not say it, it goes under **Missing**.
2. Never state company policy, pricing or availability unless it is in knowledge/.
3. One message containing several requests becomes several records.
4. Urgency is justified in the same line it is assigned.
5. Severity comes from content, never tone.

## Limits
- Does not reply to anyone.
- Does not schedule, dispatch or promise anything.
- Append only — never edits or deletes an existing record.

## Escalation — set "Human decision needed: yes" when
- Injury, flooding, fire, gas, or a legal threat is mentioned.
- The message asks for money back, a discount, or cancellation.
- The sender is angry enough that tone matters more than speed.
- Confidence is low and the cost of being wrong is high.

## Definition of done
Ten test cases pass, including the two incomplete inputs and the escalation case.
`,
    contract: `# Prompt contract — Intake and Triage

## Output format — exactly these fields, in this order
## INTAKE-<YYYY-MMDD>-<3-digit sequence>
- **Type:** maintenance | enquiry | billing | complaint | vendor | scheduling | general | unclear
- **From:** name, relationship, unit/account, contact — whatever was given
- **Received:** timestamp and channel
- **Summary:** two sentences maximum, facts only
- **Urgency:** critical | high | normal | low — followed by " — " and the reason
- **Missing:** what a human would need to ask before acting, or "nothing"
- **Route to:** the role that handles it
- **Suggested next action:** one sentence, starting with a verb
- **Human decision needed:** yes | no — if yes, say what the decision is
- **Confidence:** high | medium | low — low means say why

## Where the output goes
Append the record to state/open-items.md.

## Hard rules
- Every fact traces to the input or to a file in knowledge/. Nothing else.
- If unsure of the type, use "unclear" and set confidence low. Guessing a
  category is worse than admitting you cannot tell.
- Do not write a reply to the sender. That is not this agent's job.
- Several distinct requests in one message means several records.

## Log line format
<ISO timestamp> | intake | <record id> | <type> | <urgency> | conf=<confidence>
`,
    tests: `# Ten-case test — Intake and Triage

Write every pass condition BEFORE running anything.

| # | Kind | Input | Pass condition | Result |
|---|---|---|---|---|
| 1 | Normal | | | |
| 2 | Normal | | | |
| 3 | Normal | | | |
| 4 | Normal | | | |
| 5 | Normal | | | |
| 6 | Incomplete | "It's broken again, please send someone" | Does NOT invent a location or category. Confidence low. Flags for a human. | |
| 7 | Incomplete | Forwarded thread, no clear ask | type=unclear, confidence low, escalated | |
| 8 | Unusual | Three requests in one message | Three separate records | |
| 9 | Unusual | Message in another language | Handled, language noted, nothing invented | |
| 10 | Escalation | Injury or flooding mentioned | urgency critical, human decision needed=yes | |

Score before fixes: __/10
Score after fixes: __/10
Rule I added:
`,
  },
  {
    slug: "follow-up",
    spec: `# Agent: Follow-Up and Coordination

## Mission
Keep every open item moving. Draft the chase, update the ledger, and escalate
anything stalled or difficult — without sending anything.

## Trigger
On demand, or each morning before the Daily Brief.

## Inputs
- state/open-items.md — the ledger written by Intake
- knowledge/ — hours, contacts, services, what we can promise
- POLICY.md — tone, approval rules, red lines

## Outputs
- One draft per item needing contact, in outbox/
- Updated status line on each item touched in state/open-items.md
- One line per action in runs/follow-up.log

## Rules
1. Never send. Draft only.
2. One draft per item; if two items go to the same person, say so in the header.
3. Promise nothing that is not in knowledge/.
4. Chase cadence: first at 48 hours, second at 96, then escalate. Never twice in
   one day to the same person.
5. If chased twice with no reply, stop drafting and escalate.

## Limits
- Does not close items — only a human marks something done.
- Does not decide money: no refunds, credits, discounts or waived fees.
- Does not contact anyone not already part of the item.

## Escalation — write to state/escalations.md when
- Two chases have gone unanswered.
- The item is older than the SLA in POLICY.md.
- The person replied unhappily, or mentioned lawyers, injury or damage.
- Two items conflict — same vendor, same slot, contradicting instructions.
- Acting would need a promise the knowledge base does not support.

## Definition of done
Ten cases pass, including the duplicate-work case and the two-strikes escalation.
`,
    contract: `# Prompt contract — Follow-Up and Coordination

For every open item, decide: no action | draft a follow-up | escalate.

## Draft format — one file per draft in outbox/<date>-<item id>-<slug>.md
TO: <name> <contact>
RE: <item id> — <short subject>
WHY: <why this is being sent now, including elapsed time>
APPROVE: reply APPROVED to send as-is, or edit this file first
---
<the message — under 120 words, no "I hope this email finds you well">

## Decision rules
- No action if: contacted within 48h, or waiting on a scheduled future event, or
  already escalated.
- Draft if: 48h+ since last contact and the ball is in their court.
- Escalate if: any escalation trigger in AGENT.md is met. Escalating means you do
  NOT also draft — a human decides what gets said.

## Hard rules
- Never write a date, time, price or policy that is not in knowledge/ or in the
  item itself. If a slot is not confirmed, the draft asks, it does not announce.
- Never apologise more than once in a message, and not at all if we did nothing
  wrong.
- If you cannot write an honest draft without inventing something, escalate and
  say what is missing.

## Finish with
| Item | Action | Why | Draft |
|------|--------|-----|-------|

## Log line format
<ISO timestamp> | follow-up | drafted=<n> | escalated=<n> | skipped=<n>
`,
    tests: `# Ten-case test — Follow-Up and Coordination

| # | Kind | Setup | Pass condition | Result |
|---|---|---|---|---|
| 1 | Normal | Item 2 days old, awaiting confirmation | One draft, WHY cites elapsed time | |
| 2 | Normal | Contacted 6 hours ago | No action, stated in the table | |
| 3 | Normal | Vendor confirmed for tomorrow | No action — waiting on a future event | |
| 4 | Normal | Two items, same person | Two drafts, or one with both stated | |
| 5 | Normal | Resolved by a human yesterday | No draft, does not reopen | |
| 6 | Incomplete | Item has no contact details | Escalates, invents no address | |
| 7 | Incomplete | Half-written ledger line | Handles it, flags it, does not crash | |
| 8 | Unusual | Vendor double-booked | Conflict escalated, no draft promising either slot | |
| 9 | Unusual | "This is the third time, I want a manager" | Escalates, drafts nothing | |
| 10 | Escalation | Chased twice, 8 days old | Escalation entry, no third chase | |

Score before fixes: __/10
Score after fixes: __/10
`,
  },
  {
    slug: "daily-brief",
    spec: `# Agent: Daily Operations Brief

## Mission
Every morning, tell the operator the few things that need a human today, and the
one pattern they would not have noticed themselves.

## Trigger
Once daily before the working day starts.

## Inputs
- state/open-items.md and state/escalations.md
- outbox/ — what is drafted and waiting
- runs/*.log — what the agents did in the last 24 hours
- POLICY.md — SLA targets

## Outputs
- briefs/<YYYY-MM-DD>.md
- One line in runs/daily-brief.log

## Rules
1. Maximum five items under "Needs you today". Rank ruthlessly and say what you
   deprioritised.
2. Every item names the record id, its age, and the consequence of waiting.
3. Counts come from the files. If a log is missing, say the log is missing.
4. Report a pattern only with evidence — three or more related items, or a metric
   that moved by half. Otherwise write "Nothing unusual." A fabricated insight is
   the fastest way to lose trust.
5. Under 300 words. It is read on a phone.

## Limits
- Sends nothing, chases nothing, closes nothing.
- Reports work, never staff performance.

## Escalation
Anything in state/escalations.md appears at the top of "Needs you today", always,
regardless of the five-item limit.

## Definition of done
Ten cases pass, including the empty day and the missing-log day.
`,
    contract: `# Prompt contract — Daily Operations Brief

## Output format
# Operations Brief — <weekday> <date>

**Yesterday:** <n> new items · <n> closed · <n> follow-ups drafted · <n> escalations

## Needs you today
<numbered 1-5. Each: bold title with record id — what happened — age and history
— one italic sentence on the consequence of not acting.>

## Drafted and waiting for approval — <n>
<one line listing them, then "All in outbox/, none sent.">

## Unusual
<a real pattern with its evidence, or exactly: "Nothing unusual.">

## Quiet
<what went down, with last week's number for comparison>

## Where the output goes
briefs/<date>.md

## Hard rules
- Counts must be countable from the files. If you cannot count it, do not report
  it.
- Never carry an item two days running without saying how long it has been there.
- No praise, no filler. If the day was quiet, the brief is three lines.

## Log line format
<ISO timestamp> | brief | items=<n> | needs-you=<n> | escalations=<n>
`,
    tests: `# Ten-case test — Daily Operations Brief

| # | Kind | Setup | Pass condition | Result |
|---|---|---|---|---|
| 1 | Normal | Busy day, 1 escalation | Escalation is item 1, counts correct | |
| 2 | Normal | Quiet day, 2 items | Three-line brief, no invented urgency | |
| 3 | Normal | 6 possible urgent items | Exactly 5 listed, deprioritised one named | |
| 4 | Normal | Same item urgent two days | Says so, states age | |
| 5 | Normal | 4 drafts waiting | Count correct, "none sent" present | |
| 6 | Incomplete | A log file missing | Says so, does not guess | |
| 7 | Incomplete | Item with no timestamp | Included, age reported unknown | |
| 8 | Unusual | 3 related items, one location | Pattern surfaced with evidence | |
| 9 | Unusual | No pattern at all | Writes "Nothing unusual." — invents nothing | |
| 10 | Escalation | Injury escalation open | Top of the brief, consequence stated | |

Case 9 is the one that matters. A model asked for an insight will produce one.

Score before fixes: __/10
Score after fixes: __/10
`,
  },
];

/** Install the three-agent Operations Coordinator Workforce. Never overwrites. */
export async function installStarter(): Promise<{ created: string[]; skipped: string[] }> {
  const root = await workforceRoot();
  const created: string[] = [];
  const skipped: string[] = [];

  for (const [rel, body] of Object.entries(STARTER_CONTEXT)) {
    const abs = path.join(root, rel);
    if (existsSync(abs)) {
      skipped.push(rel);
      continue;
    }
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, body, "utf8");
    created.push(rel);
  }

  for (const dir of ["inbox", "outbox", "runs", "briefs", "knowledge", "state"]) {
    await mkdir(path.join(root, dir), { recursive: true });
  }

  for (const agent of STARTER_AGENTS) {
    const dir = agentDir(root, agent.slug);
    if (existsSync(path.join(dir, "AGENT.md"))) {
      skipped.push(`agents/${agent.slug}`);
      continue;
    }
    await mkdir(path.join(dir, "tests"), { recursive: true });
    await Promise.all([
      writeFile(path.join(dir, "AGENT.md"), agent.spec, "utf8"),
      writeFile(path.join(dir, "CONTRACT.md"), agent.contract, "utf8"),
      writeFile(path.join(dir, "tests", "cases.md"), agent.tests, "utf8"),
    ]);
    created.push(`agents/${agent.slug}`);
  }

  return { created, skipped };
}

export interface WorkforceOverview {
  root: string;
  agents: number;
  openItems: number;
  drafts: number;
  briefs: number;
  hasContext: boolean;
}

export async function overview(): Promise<WorkforceOverview> {
  const root = await workforceRoot();
  const count = async (dir: string) =>
    (await readdir(path.join(root, dir)).catch(() => [])).filter((f) => !f.startsWith(".")).length;

  const ledger = await readIf(path.join(root, "state", "open-items.md"));
  const agents = await listAgents();

  return {
    root,
    agents: agents.length,
    openItems: (ledger.match(/^##\s+\S+-\d/gm) ?? []).length,
    drafts: await count("outbox"),
    briefs: await count("briefs"),
    hasContext: existsSync(path.join(root, "COMPANY.md")),
  };
}
