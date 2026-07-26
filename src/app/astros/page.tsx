"use client";

import BuildStudio from "@/components/BuildStudio";

export default function AstrosPage() {
  return (
    <BuildStudio
      featureId="astros"
      boardName="astros"
      project="astros"
      eyebrow="Growth"
      icon="Sparkles"
      accent="#818cf8"
      title="Astros"
      subtitle="The long-range scan: patterns across your own notes, sessions and goals — what you keep circling, what you keep dropping."
      placeholder="Look across the last month and tell me what I am actually building versus what I said I would build…"
      examples={["What am I avoiding?", "Where did my time actually go this month?"]}
      options={[
        { key: "range", label: "Range", choices: ["Last week", "Last month", "Last quarter"] },
        { key: "lens", label: "Lens", choices: ["Patterns", "Contradictions", "Momentum", "Ruthless edit"] },
      ]}
      buildPrompt={(brief, o) => `Read what is actually on this machine and report honestly.

Question: ${brief}
Range: ${o.range} · Lens: ${o.lens}

Sources to read (skip any that do not exist, and say which you skipped):
- ~/.baseline-workforce/goals.json and ~/.baseline-workforce/journal/*.json
- ~/.baseline-workforce/boards/*.json
- Recent Claude Code session prompts under ~/.claude/projects (read a sample; these files are large)

Write astros.md in the current directory:
- What the evidence says, with specific quotes and dates.
- The gap between stated goals and where effort actually went.
- Three things to stop, and the one thing that is clearly working.
Do not flatter. Do not generalise beyond what the files support; say "not enough data" where that is the truth.

Then reply with the single most uncomfortable finding.`}
      note="Reads your local files only. Nothing is uploaded; the write-up lands in the workspace."
    />
  );
}
