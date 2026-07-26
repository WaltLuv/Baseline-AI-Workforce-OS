"use client";

import BuildStudio from "@/components/BuildStudio";

export default function SeoPage() {
  return (
    <BuildStudio
      featureId="seo"
      boardName="seo"
      project="seo-office"
      eyebrow="Growth"
      icon="TrendingUp"
      accent="#a3e635"
      title="SEO Office"
      subtitle="Research, briefs and full drafts, written into the workspace as markdown you can publish from."
      placeholder="Topic: running AI agents locally instead of paying for cloud dashboards…"
      examples={["local-first AI dashboard", "how much does an AI agent cost to run"]}
      options={[
        { key: "stage", label: "Stage", choices: ["Research", "Brief", "Full draft"], defaultValue: "Research" },
        { key: "intent", label: "Intent", choices: ["Informational", "Commercial", "Comparison", "How-to"] },
        { key: "words", label: "Length", choices: ["800", "1500", "2500"] },
      ]}
      buildPrompt={(brief, o) => {
        const shared = `Topic: ${brief}\nSearch intent: ${o.intent}`;
        if (o.stage === "Research") {
          return `${shared}

Do keyword and angle research and write research.md in the current directory:
- 15 candidate queries grouped by intent, each with a plain-language read on who is searching and what they actually want.
- The 5 angles competitors are missing, with the reasoning.
- The questions a buyer asks that content usually skips.
Be explicit that volume figures are estimates unless you have a real data source connected — do not invent numbers that look like tool output.

Then reply with the single best angle and why.`;
        }
        if (o.stage === "Brief") {
          return `${shared}

Write brief.md in the current directory: the working title, the promise, the target reader, the outline with H2/H3s, the specific proof or example each section needs, internal-link suggestions, and the one thing that would make this piece hard to copy.

Then reply with the outline only.`;
        }
        return `${shared}
Target length: ${o.words} words.

Write draft.md in the current directory: a complete, publishable article. Concrete, first-hand where possible, no padding, no "in today's fast-paced world". Use short paragraphs and real subheads. Include a short FAQ only if it genuinely helps. Mark any claim you could not verify with [verify].

Then reply with the title and meta description.`;
      }}
      note="No SEO API is required. If you connect Search Console later, research can be grounded in your own data instead of estimates."
    />
  );
}
