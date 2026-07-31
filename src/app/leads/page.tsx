"use client";

import BuildStudio from "@/components/BuildStudio";
import LeadsPipeline from "@/components/LeadsPipeline";

export default function LeadsPage() {
  return (
    <BuildStudio
      featureId="leads"
      boardName="leads"
      project="leads"
      eyebrow="Growth"
      icon="Users"
      accent="#60a5fa"
      title="Leads"
      subtitle="Define the ICP, score a list you already have, and draft outreach worth replying to. Enrichment needs a data key."
      placeholder="We sell a local-first AI ops dashboard to technical founders running 5–50 person teams…"
      examples={["Score this list against our ICP", "Write a first-touch email for agency owners"]}
      options={[
        { key: "stage", label: "Stage", choices: ["ICP", "Score a list", "Outreach"], defaultValue: "ICP" },
        { key: "channel", label: "Channel", choices: ["Email", "LinkedIn DM", "Cold call script"] },
      ]}
      buildPrompt={(brief, o) => {
        if (o.stage === "ICP") {
          return `Write icp.md in the current directory for this business:

${brief}

Include: the sharpest one-sentence ICP, firmographic and behavioural qualifiers, disqualifiers (who to actively avoid and why), the trigger events that make outreach land, where these people actually are, and a 10-point scoring rubric with weights.

Then reply with the ICP sentence and the top three triggers.`;
        }
        if (o.stage === "Score a list") {
          return `Score the list below against the ICP. If icp.md exists in the current directory, read it first and use its rubric.

${brief}

Write scored.md: a table of each lead with score, the two strongest signals, the biggest doubt, and a next action. Sort by score. Be honest when a lead is a poor fit — a short qualified list beats a long hopeful one.

Then reply with how many cleared the bar.`;
        }
        return `Write outreach.md in the current directory: three ${o.channel} variants for this offer and audience.

${brief}

Rules: no flattery openers, no "hope this finds you well", no fake personalisation. Each variant is under 90 words, leads with a specific observation, makes one ask, and names a real reason to care. Add a two-step follow-up for the best variant, and a short note on what would make you not send it at all.

Then reply with the variant you would send first.`;
      }}
      note="Everything here works with lists you already have. The Pipeline tab adds Apollo enrichment, Hunter domain search, and free CSV import with transparent scoring."
      primaryLabel="Strategy"
      secondary={{ label: "Pipeline", node: <LeadsPipeline /> }}
    />
  );
}
