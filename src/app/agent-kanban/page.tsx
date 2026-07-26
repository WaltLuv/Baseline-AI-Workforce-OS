"use client";

import BoardView from "@/components/BoardView";
import { PageHeader, PageShell } from "@/components/ui";

export default function AgentKanbanPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Orchestration"
        icon="LayoutDashboard"
        accent="#7dd3fc"
        title="Agent Kanban"
        subtitle="Hand a card to an agent and it works the task end to end. The output stays attached to the card, and the card advances a column."
      />
      <BoardView
        boardName="agent-kanban"
        columns={["Queued", "Working", "Review", "Shipped"]}
        placeholder="Build a landing page for the workforce dashboard…"
        accent="#7dd3fc"
        dispatch={{
          project: "agent-kanban",
          label: "Hand to agent",
          buildPrompt: (card) => `You are picking up a task from a board. Work it end to end.

Task: ${card.text}
${card.notes ? `Notes: ${card.notes}\n` : ""}
Rules:
- If the task needs files, write them into the current directory.
- If something is ambiguous, choose the most reasonable reading, do the work, and state the assumption at the end rather than stopping to ask.
- Finish with: what you did, what you did not do, and what a human should check.`,
        }}
      />
    </PageShell>
  );
}
