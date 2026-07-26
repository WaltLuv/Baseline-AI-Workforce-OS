"use client";

import BuildStudio from "@/components/BuildStudio";
import VideoRender from "@/components/VideoRender";

export default function VideoStudioPage() {
  return (
    <BuildStudio
      featureId="video"
      boardName="video"
      project="video-studio"
      eyebrow="Studio"
      icon="Film"
      accent="#ef4444"
      title="Video Studio"
      subtitle="Script, shot list and storyboard, written locally as files. Add a render key when you want finished footage."
      placeholder="A 90-second explainer on why local AI agents beat cloud dashboards…"
      examples={["60s product demo for a local-first dashboard", "3-minute talking head on agent economics"]}
      options={[
        { key: "length", label: "Length", choices: ["30s", "60s", "90s", "3 min", "8 min"] },
        { key: "format", label: "Format", choices: ["Talking head", "Screen recording", "B-roll + VO", "Explainer animation"] },
        { key: "tone", label: "Tone", choices: ["Direct", "Warm", "High-energy", "Documentary"] },
      ]}
      buildPrompt={(brief, o) => `Produce a complete pre-production pack for this video, as files in the current directory.

Subject: ${brief}
Length: ${o.length} · Format: ${o.format} · Tone: ${o.tone}

Write these files:
1. script.md — the full spoken script, timed in blocks, with the hook in the first 3 seconds. Word count must fit the length at ~150 wpm; state the count.
2. shotlist.md — a table: shot #, duration, visual, on-screen text, audio note.
3. storyboard.html — a self-contained page showing each shot as a card with its framing sketched in inline SVG, in order.

Rules: no filler, no "in this video we will". Every line earns its seconds. Then reply with the hook and the single riskiest moment for retention.`}
      previewHint={(files) => files.find((f) => f.includes("storyboard")) ?? null}
      note="The pre-production pack is written locally. Switch to the Render tab to turn the script into finished footage."
      primaryLabel="Pre-production"
      secondary={{ label: "Render", node: <VideoRender /> }}
    />
  );
}
