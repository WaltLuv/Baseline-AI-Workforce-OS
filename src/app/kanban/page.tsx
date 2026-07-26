"use client";

import BoardView from "@/components/BoardView";
import { PageHeader, PageShell } from "@/components/ui";

export default function KanbanPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Orchestration"
        icon="Columns3"
        accent="#14b8a6"
        title="Kanban"
        subtitle="Your own board. Drag cards between columns; everything is stored on this machine."
      />
      <BoardView
        boardName="kanban"
        columns={["Backlog", "Today", "Doing", "Done"]}
        placeholder="Wire the journal page to the vault…"
        accent="#14b8a6"
      />
    </PageShell>
  );
}
