"use client";

import BuildStudio from "@/components/BuildStudio";
import ImageRender from "@/components/ImageRender";

export default function ThumbnailsPage() {
  return (
    <BuildStudio
      featureId="thumbnails"
      boardName="thumbnails"
      project="thumbnails"
      eyebrow="Studio"
      icon="Image"
      accent="#fb7185"
      title="Thumbnails"
      subtitle="Research the hook, then render a 1280×720 thumbnail as SVG — editable text, no image API required."
      placeholder="Video about running an AI workforce locally — I want the shocked-at-the-bill angle…"
      examples={["I built an AI company on one laptop", "Nobody is talking about local agents"]}
      options={[
        { key: "style", label: "Style", choices: ["Bold text + face space", "Big number", "Before / after", "Object hero"] },
        { key: "palette", label: "Palette", choices: ["High contrast", "Midnight + gold", "Neon", "Muted editorial"] },
      ]}
      buildPrompt={(brief, o) => `Design a YouTube thumbnail as a single SVG file.

Topic: ${brief}
Layout: ${o.style}. Palette: ${o.palette}.

Steps:
1. Write three candidate hook phrases (max 5 words each) and pick the strongest. Say why in one line.
2. Write thumbnail.svg in the current directory: exactly 1280×720, viewBox="0 0 1280 720".
   - Text as real <text> elements so it stays editable, using a system font stack.
   - Leave a clear area on the right third if the layout calls for a face.
   - Readable at 320px wide: minimum effective text height 90px for the hook.
   - No external images, no web fonts, no filters that need rasterising.
3. Also write thumbnail.html that embeds the SVG at true size for review.

Then reply with the chosen hook and the alternates.`}
      previewHint={(files) => files.find((f) => f.endsWith(".html")) ?? files.find((f) => f.endsWith(".svg")) ?? null}
      note="SVG stays editable — open it in any vector editor, or ask the agent to tweak the copy and re-run. The Render tab produces a photographic version."
      primaryLabel="Design"
      secondary={{ label: "Render", node: <ImageRender /> }}
    />
  );
}
