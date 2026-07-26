"use client";

import BuildStudio from "@/components/BuildStudio";
import NotebookMcp from "@/components/NotebookMcp";

export default function NotebookPage() {
  return (
    <BuildStudio
      featureId="notebook"
      boardName="notebook"
      project="notebook"
      eyebrow="Studio"
      icon="NotebookText"
      accent="#fde047"
      title="Notebook"
      subtitle="Research briefs against your own sources. NotebookLM itself needs its CLI; without it, the brief is written by your local agent from the notes on this machine."
      placeholder="Everything I have written about local-first agents — pull it together into a briefing…"
      examples={["Summarise my journal for the last two weeks", "What sources do I already have on agent pricing?"]}
      options={[
        { key: "shape", label: "Output", choices: ["Briefing", "Q&A", "Study guide", "Timeline"] },
        { key: "scope", label: "Read", choices: ["My notes + journal", "Notes only", "This brief only"] },
      ]}
      buildPrompt={(brief, o) => `Write a ${o.shape.toLowerCase()} on the topic below.

Topic: ${brief}
Sources to read: ${o.scope}

${
  o.scope === "This brief only"
    ? "Work only from what is written above."
    : `Read what is actually on this machine before writing:
- ~/.baseline-workforce/journal/*.json and goals.json
- Markdown notes in the configured Obsidian vault, if one exists
Cite the file each claim came from. If a source does not exist, say so instead of filling the gap.`
}

Write notebook.md in the current directory with the ${o.shape.toLowerCase()}, and end it with a short "what I could not find" section.

Then reply with the three most useful findings.`}
      note="This tab reads the notes already on this machine. The NotebookLM tab talks to your real notebooks through the MCP server."
      primaryLabel="Local brief"
      secondary={{ label: "NotebookLM", node: <NotebookMcp /> }}
    />
  );
}
