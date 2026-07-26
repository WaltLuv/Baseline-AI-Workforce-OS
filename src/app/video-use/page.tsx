"use client";

import BuildStudio from "@/components/BuildStudio";

export default function VideoEditorPage() {
  return (
    <BuildStudio
      featureId="video-use"
      boardName="video-use"
      project="video-editor"
      eyebrow="Studio"
      icon="Scissors"
      accent="#f59e0b"
      title="Video Editor"
      subtitle="Paste a transcript, get a cut list and an ffmpeg script that applies it — nothing uploaded, everything local."
      placeholder="Paste the transcript with timestamps, and say what you want kept…"
      examples={["Cut every filler word and dead air over 0.6s", "Pull three 30-second shorts from this talk"]}
      options={[
        { key: "goal", label: "Goal", choices: ["Tighten the edit", "Cut shorts", "Remove filler", "Chapter markers"] },
        { key: "aspect", label: "Aspect", choices: ["Keep source", "9:16 vertical", "1:1 square", "16:9"] },
      ]}
      buildPrompt={(brief, o) => `Act as an editor working from a transcript. Do not invent timestamps that are not in the source.

Goal: ${o.goal} · Output aspect: ${o.aspect}
Source and instructions:
${brief}

Write these files in the current directory:
1. cutlist.md — a table of keep/drop ranges with in/out timecodes and a one-line reason each. Flag any range you are unsure about rather than guessing.
2. edit.sh — a runnable ffmpeg script that applies the cut list to an input file passed as $1. Use the concat demuxer with a generated list; do not re-encode unless the aspect change requires it. Include a dry-run echo at the top.
3. notes.md — what you dropped, total time removed, and what a human should check before publishing.

Then reply with the total runtime before and after.`}
      note="edit.sh is written for you to read and run yourself — this page never executes it."
    />
  );
}
