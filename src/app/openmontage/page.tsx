"use client";

import BuildStudio from "@/components/BuildStudio";

export default function OpenMontagePage() {
  return (
    <BuildStudio
      featureId="openmontage"
      boardName="openmontage"
      project="openmontage"
      eyebrow="Studio"
      icon="Clapperboard"
      accent="#f0a868"
      title="OpenMontage"
      subtitle="Cinematic sequences: beats, per-shot prompts and continuity notes, ready to paste into any video model."
      placeholder="A lone courier crossing a flooded city at dawn, ending on the rooftop signal fire…"
      examples={["Samurai duel in falling ash, three shots", "Deep-sea leviathan reveal, slow push-in"]}
      options={[
        { key: "shots", label: "Shots", choices: ["3", "5", "8", "12"] },
        { key: "look", label: "Look", choices: ["Anamorphic night", "Golden hour 35mm", "Cold documentary", "High-contrast noir"] },
        { key: "motion", label: "Camera", choices: ["Locked off", "Slow push", "Handheld", "Crane / drone"] },
      ]}
      buildPrompt={(brief, o) => `Build a montage plan for a video model.

Sequence: ${brief}
Shot count: ${o.shots} · Look: ${o.look} · Camera language: ${o.motion}

Write these files in the current directory:
1. montage.md — for each shot: beat, duration, camera move, lens, lighting, and a continuity note (what must match the previous shot: wardrobe, time of day, weather, scars, props).
2. prompts.md — one copy-paste prompt per shot, self-contained (a video model has no memory of the other shots), each restating subject, wardrobe, location, light and lens.
3. contactsheet.html — a self-contained page laying the shots out in order as cards with the beat, the prompt and the continuity note.

Then reply with the two shots most likely to break continuity and how you guarded them.`}
      previewHint={(files) => files.find((f) => f.includes("contactsheet")) ?? null}
    />
  );
}
