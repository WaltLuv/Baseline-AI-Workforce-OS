"use client";

import MissionRunner from "@/components/MissionRunner";
import { PageHeader, PageShell } from "@/components/ui";

export default function MissionsPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Orchestration · The whole agency, one box"
        title="Missions"
        subtitle="Describe what you want done. Oh My Pi — the lead integrator — picks the right Agency specialists, runs each one on the best connected harness (Claude Code, Codex, Hermes, Ruflo, whatever you have), and hands you one integrated result."
        accent="#a78bfa"
        icon="Rocket"
      />
      <MissionRunner />
    </PageShell>
  );
}
