"use client";

import BuildStudio from "@/components/BuildStudio";

export default function RadarPage() {
  return (
    <BuildStudio
      featureId="radar"
      boardName="radar"
      project="radar"
      eyebrow="Growth"
      icon="Radar"
      accent="#f472b6"
      title="Radar"
      subtitle="A standing scan of what moved in your space, written up as a briefing you could publish as-is."
      placeholder="Local-first AI tooling, agent CLIs, and anything that changes what a solo operator can run…"
      examples={["What changed in agent CLIs this week", "Watch: pricing moves in AI dev tools"]}
      options={[
        { key: "window", label: "Window", choices: ["Last 24h", "This week", "This month"] },
        { key: "shape", label: "Output", choices: ["Briefing", "Newsletter draft", "Bullet digest"] },
      ]}
      buildPrompt={(brief, o) => `Scan for what actually changed and write it up.

Beat: ${brief}
Window: ${o.window} · Output shape: ${o.shape}

Use web search if you have it. Write briefing.md in the current directory:
- What changed, each item with a source link and the date. If you cannot verify a date, say so rather than implying recency.
- Why it matters to a solo operator running agents locally.
- What it changes about what I should do this week.
Separate confirmed facts from your reading of them — label the second section "Interpretation".

Then reply with the single item worth acting on today.`}
      note="Accuracy depends on the agent having web access. Anything it could not verify is labelled rather than smoothed over."
    />
  );
}
