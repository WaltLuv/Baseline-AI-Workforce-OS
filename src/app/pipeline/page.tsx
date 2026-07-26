"use client";

import BoardView from "@/components/BoardView";
import { PageHeader, PageShell } from "@/components/ui";

export default function PipelinePage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Orchestration"
        icon="Workflow"
        accent="#34d399"
        title="Pipeline"
        subtitle="Capture an idea, let an agent shape it, decide on it, then build it. Each pass moves the card one stage along."
      />
      <BoardView
        boardName="pipeline"
        columns={["Capture", "Shape", "Decide", "Build"]}
        placeholder="Idea: a nightly brief that reads my journal and goals…"
        accent="#34d399"
        dispatch={{
          project: "pipeline",
          label: "Advance this idea",
          buildPrompt: (card, column) => {
            if (column === "Capture") {
              return `Shape this raw idea into something decidable.

Idea: ${card.text}

Give me: the sharpest one-sentence version, who it is for, the smallest version worth building, what would make it fail, and the two open questions. Be concrete and short.`;
            }
            if (column === "Shape") {
              return `Make the call on this idea and justify it.

Idea: ${card.text}

Give me: build / park / kill, the reasoning, what evidence would change your mind, and — if build — the first three steps with rough effort. Do not hedge into "it depends".`;
            }
            return `Build the first real version of this.

Idea: ${card.text}

Write the files into the current directory. Prefer one working thing over a scaffold of many. Finish with what works, what is stubbed, and the next step.`;
          },
        }}
      />
    </PageShell>
  );
}
