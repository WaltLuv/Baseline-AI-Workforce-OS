"use client";

import BuildStudio from "@/components/BuildStudio";

export default function AppLabPage() {
  return (
    <BuildStudio
      featureId="apps"
      boardName="apps"
      project="app-lab"
      eyebrow="Studio"
      icon="FlaskConical"
      accent="#a3e635"
      title="App Lab"
      subtitle="Describe an app; get a working build in the workspace and preview it here without leaving the page."
      placeholder="A habit tracker with a week grid, streak counter and local storage…"
      examples={[
        "A pomodoro timer with session history and a calm dark theme",
        "A markdown scratchpad with live preview and word count",
      ]}
      options={[
        { key: "shape", label: "Shape", choices: ["Single HTML file", "HTML + CSS + JS", "React component"] },
        { key: "mood", label: "Look", choices: ["Dark, minimal", "Playful, colourful", "Editorial, serif", "Brutalist"] },
      ]}
      buildPrompt={(brief, o) => `Build a working web app in the current directory.

App: ${brief}

Requirements:
- Deliverable shape: ${o.shape}. If it is a single HTML file, write index.html with the CSS and JS inline.
- Visual direction: ${o.mood}. Make it genuinely good-looking, not a wireframe.
- It must run by opening the file directly — no build step, no CDN, no external requests.
- Persist state to localStorage where it makes sense.
- Keyboard accessible, and readable on a phone.

Write the files now, then reply with a two-line summary of what you built and how to use it.`}
      note="The agent writes real files into ~/.baseline-workforce/workspace/app-lab. Preview runs sandboxed."
    />
  );
}
