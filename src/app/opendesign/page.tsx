"use client";

import BuildStudio from "@/components/BuildStudio";

export default function OpenDesignPage() {
  return (
    <BuildStudio
      featureId="opendesign"
      boardName="opendesign"
      project="open-design"
      eyebrow="Studio"
      icon="Palette"
      accent="#e879f9"
      title="Open Design"
      subtitle="Design systems, landing pages and components — generated as real files, previewed in place."
      placeholder="A landing page for a local-first AI dashboard: hero, three feature cards, pricing, footer…"
      examples={["A design token sheet with type scale and colour ramps", "A pricing section with three tiers"]}
      options={[
        { key: "artifact", label: "Deliverable", choices: ["Landing page", "Component set", "Design tokens", "Email template"] },
        { key: "vibe", label: "Direction", choices: ["Midnight, warm accents", "Clean editorial", "Soft pastel", "High-contrast mono"] },
      ]}
      buildPrompt={(brief, o) => `Design and build the following as real files in the current directory.

Deliverable: ${o.artifact}
Brief: ${brief}
Art direction: ${o.vibe}

Requirements:
- Write index.html (plus styles.css if it helps) — self-contained, no CDN, no external fonts. Use a system font stack.
- Define CSS custom properties for colour, spacing and type scale at the top, then use them consistently.
- Responsive down to 380px. Respect prefers-reduced-motion and prefers-color-scheme where relevant.
- Real copy, not lorem ipsum.

Write the files, then reply with the token names you defined and why.`}
    />
  );
}
