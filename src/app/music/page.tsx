"use client";

import BuildStudio from "@/components/BuildStudio";
import MusicRender from "@/components/MusicRender";

export default function MusicStudioPage() {
  return (
    <BuildStudio
      featureId="music"
      boardName="music"
      project="music-studio"
      eyebrow="Studio"
      icon="Music2"
      accent="#c084fc"
      title="Music Studio"
      subtitle="Briefs, lyrics and style prompts written locally. Connect a music key when you want the audio rendered."
      placeholder="A slow, warm intro theme for a late-night build session — analogue, no vocals…"
      examples={["Lo-fi loop for focus, 78 bpm", "Anthemic launch-day track with a hook chorus"]}
      options={[
        { key: "kind", label: "Type", choices: ["Instrumental", "Full song", "Jingle", "Podcast bed"] },
        { key: "mood", label: "Mood", choices: ["Warm / analogue", "Driving", "Melancholy", "Triumphant", "Playful"] },
        { key: "length", label: "Length", choices: ["0:15", "0:30", "1:00", "2:30", "3:30"] },
      ]}
      buildPrompt={(brief, o) => `Write a music production pack as files in the current directory.

Brief: ${brief}
Type: ${o.kind} · Mood: ${o.mood} · Target length: ${o.length}

Write:
1. brief.md — tempo, key, time signature, instrumentation, arrangement map with timestamps, and reference-adjacent descriptions (describe the sound, do not name artists to imitate).
2. prompt.txt — a single paste-ready generation prompt under 200 words for a text-to-music model, with a separate one-line negative prompt.
${o.kind === "Full song" || o.kind === "Jingle" ? "3. lyrics.md — original lyrics with section labels, syllable-count aware for the tempo.\n" : ""}
Then reply with the tempo and the arrangement in one line.`}
      note="Briefs, lyrics and prompts are written locally. The Render tab turns them into audio."
      primaryLabel="Brief"
      secondary={{ label: "Render", node: <MusicRender /> }}
    />
  );
}
