"use client";

import BuildStudio from "@/components/BuildStudio";

export default function GameStudioPage() {
  return (
    <BuildStudio
      featureId="games"
      boardName="games"
      project="game-studio"
      eyebrow="Studio"
      icon="Gamepad2"
      accent="#39ff8e"
      title="Game Studio"
      subtitle="Commission a playable browser game. It lands as a single file you can open, share or keep iterating on."
      placeholder="A neon breakout where the paddle shrinks each level and the bricks drop loot…"
      examples={["A tiny roguelike on a 12×12 grid", "An endless runner with one-button controls"]}
      options={[
        { key: "genre", label: "Genre", choices: ["Arcade", "Puzzle", "Platformer", "Roguelike", "Rhythm", "Idle"] },
        { key: "difficulty", label: "Difficulty", choices: ["Gentle", "Standard", "Punishing"] },
      ]}
      buildPrompt={(brief, o) => `Build a complete, playable browser game as a single self-contained index.html in the current directory.

Game: ${brief}
Genre: ${o.genre}. Difficulty curve: ${o.difficulty}.

Requirements:
- Canvas or DOM, your call, but everything inline in one file — no CDN, no assets, no build step.
- A real game loop: start screen, play, lose/win state, restart, score, and a visible high score in localStorage.
- Controls listed on screen. Keyboard and touch both work.
- Sound is optional; if you add it, generate it with the WebAudio API rather than loading files.

Write index.html now, then reply with the controls and one thing you would tune next.`}
      note="Preview is sandboxed: scripts run, but the page cannot reach back into the dashboard."
    />
  );
}
