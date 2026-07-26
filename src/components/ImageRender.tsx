"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Download, ImagePlus, RefreshCw } from "lucide-react";
import { useJson } from "@/lib/client";
import type { ImageJob } from "@/app/api/render/image/route";
import IntegrationBanner, { useIntegration } from "./IntegrationBanner";
import VoiceButton from "./VoiceButton";
import { EmptyState, Panel, Spinner, relTime } from "./ui";

const SIZES = [
  { value: "1536x1024", label: "16:9 — thumbnail" },
  { value: "1024x1024", label: "1:1 — cover" },
  { value: "1024x1536", label: "9:16 — vertical" },
] as const;

/** Renders the thumbnail concept through any OpenAI-compatible image endpoint. */
export default function ImageRender({ project = "thumbnails" }: { project?: string }) {
  const { connected } = useIntegration("images");
  const { data, refresh } = useJson<{ jobs: ImageJob[] }>("/api/render/image");

  const [prompt, setPrompt] = useState("");
  const [interim, setInterim] = useState("");
  const [size, setSize] = useState<(typeof SIZES)[number]["value"]>("1536x1024");
  const [quality, setQuality] = useState<"low" | "medium" | "high">("high");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobs = data?.jobs ?? [];
  const composed = interim ? `${prompt} ${interim}`.trim() : prompt;

  const submit = useCallback(async () => {
    const text = composed.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/render/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: text, size, quality, project }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res?.ok) {
      setError(json.error ?? "the render failed");
      return;
    }
    setPrompt("");
    setInterim("");
    void refresh();
  }, [busy, composed, project, quality, refresh, size]);

  return (
    <div className="space-y-4">
      <IntegrationBanner id="images" />

      <Panel title="Render an image" subtitle="Describe the frame — subject, composition, text placement, lighting">
        <textarea
          rows={4}
          value={composed}
          onChange={(e) => {
            setInterim("");
            setPrompt(e.target.value);
          }}
          placeholder="Bold YouTube thumbnail: a single laptop glowing in a dark room, huge three-word hook on the left third, high contrast, no clutter…"
          className="textarea py-2 text-[13.5px]"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <VoiceButton
              size={38}
              onTranscript={(t, o) => {
                if (o.final) {
                  setInterim("");
                  setPrompt((prev) => (prev ? `${prev} ${t}` : t));
                } else {
                  setInterim(t);
                }
              }}
            />
            <select value={size} onChange={(e) => setSize(e.target.value as typeof size)} className="input !w-auto py-1.5 text-[12.5px]">
              {SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)} className="input !w-auto py-1.5 text-[12.5px]">
              <option value="high">high quality</option>
              <option value="medium">medium</option>
              <option value="low">low (cheap draft)</option>
            </select>
          </div>
          <button onClick={() => void submit()} disabled={!connected || !composed.trim() || busy} className="btn btn-primary">
            {busy ? <Spinner /> : <ImagePlus size={14} />} Render
          </button>
        </div>

        {busy && <p className="mt-3 text-[12px] text-[var(--fg-mute)]">Image models take 10–40 seconds. The file is saved as soon as it arrives.</p>}
        {error && <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/6 px-3 py-2 text-[12px] text-rose-200">{error}</p>}
      </Panel>

      <Panel
        title="Rendered"
        actions={
          <button onClick={() => void refresh()} className="btn btn-ghost !px-2">
            <RefreshCw size={13} />
          </button>
        }
        padded={false}
      >
        {jobs.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {jobs.map((job) => (
              <motion.li key={job.id} layout className="px-5 py-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/preview/${job.project}/${job.file}`}
                  alt={job.prompt.slice(0, 120)}
                  className="w-full max-w-2xl rounded-xl border border-[var(--line)]"
                />
                <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-[var(--fg-dim)]">{job.prompt}</p>
                <p className="mt-1 flex items-center gap-2 text-[11px] text-[var(--fg-mute)]">
                  <span className="mono">{job.model}</span>
                  <span>·</span>
                  <span>{(job.bytes / 1024).toFixed(0)} kB</span>
                  <span>·</span>
                  <span>{relTime(job.createdAt)}</span>
                  <a href={`/api/preview/${job.project}/${job.file}`} download className="btn btn-ghost !px-1.5 !py-0.5 text-[11px]">
                    <Download size={11} /> save
                  </a>
                </p>
              </motion.li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="Image" title="Nothing rendered yet" body="The Studio tab writes an editable SVG; this tab renders a photographic version." />
        )}
      </Panel>
    </div>
  );
}
