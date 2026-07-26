"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Download, Music4, RefreshCw } from "lucide-react";
import { useJson } from "@/lib/client";
import type { MusicJob } from "@/app/api/render/music/route";
import IntegrationBanner, { useIntegration } from "./IntegrationBanner";
import VoiceButton from "./VoiceButton";
import { EmptyState, Panel, Spinner, relTime } from "./ui";

interface JobsResponse {
  jobs: MusicJob[];
  project: string;
}

/** Suno render: a brief becomes a task you poll, then a file on disk. */
export default function MusicRender() {
  const { connected } = useIntegration("suno");
  const { data, refresh } = useJson<JobsResponse>("/api/render/music");

  const [prompt, setPrompt] = useState("");
  const [interim, setInterim] = useState("");
  const [style, setStyle] = useState("");
  const [title, setTitle] = useState("");
  const [instrumental, setInstrumental] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const polling = useRef<Set<string>>(new Set());

  const jobs = data?.jobs ?? [];
  const project = data?.project ?? "music-studio";
  const composed = interim ? `${prompt} ${interim}`.trim() : prompt;

  useEffect(() => {
    const pending = jobs.filter((j) => !j.tracks.some((t) => t.file) && !j.error);
    if (!pending.length) return;
    const id = setInterval(async () => {
      for (const job of pending) {
        if (polling.current.has(job.id)) continue;
        polling.current.add(job.id);
        await fetch("/api/render/music", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: job.id }),
        }).catch(() => {});
        polling.current.delete(job.id);
      }
      void refresh();
    }, 12_000);
    return () => clearInterval(id);
  }, [jobs, refresh]);

  const submit = useCallback(async () => {
    const text = composed.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/render/music", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: text, style, title, instrumental, customMode: Boolean(style || title) }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res?.ok) {
      setError(json.error ?? "could not start the render");
      return;
    }
    setPrompt("");
    setInterim("");
    void refresh();
  }, [busy, composed, instrumental, refresh, style, title]);

  return (
    <div className="space-y-4">
      <IntegrationBanner id="suno" />

      <Panel title="Render audio" subtitle={connected ? "Generation is a task — it takes a minute or two" : "Connect a music key above to enable"}>
        <label htmlFor="su-prompt" className="eyebrow mb-1.5 block">
          {instrumental ? "Description" : "Lyrics or description"}
        </label>
        <textarea
          id="su-prompt"
          rows={4}
          value={composed}
          onChange={(e) => {
            setInterim("");
            setPrompt(e.target.value);
          }}
          placeholder="Warm analogue intro theme, slow build, no vocals…"
          className="textarea py-2 text-[13.5px]"
        />

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="su-style" className="eyebrow mb-1.5 block">
              Style
            </label>
            <input id="su-style" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="lo-fi, warm, tape saturation" className="input py-2 text-[13px]" />
          </div>
          <div>
            <label htmlFor="su-title" className="eyebrow mb-1.5 block">
              Title
            </label>
            <input id="su-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Night Shift" className="input py-2 text-[13px]" />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
          <div className="flex items-center gap-3">
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
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--fg-dim)]">
              <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} className="accent-[var(--gold)]" />
              Instrumental
            </label>
            {(style || title) && <span className="pill !py-0.5 !text-[10px]">custom mode</span>}
          </div>
          <button onClick={() => void submit()} disabled={!connected || !composed.trim() || busy} className="btn btn-primary">
            {busy ? <Spinner /> : <Music4 size={14} />} Generate
          </button>
        </div>

        {error && <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/6 px-3 py-2 text-[12px] text-rose-200">{error}</p>}
      </Panel>

      <Panel
        title="Tracks"
        subtitle="Downloaded into the workspace — the provider deletes its copy after about 15 days"
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
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium">{job.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--fg-mute)]">
                      {job.instrumental ? "instrumental" : "with vocals"}
                      {job.style ? ` · ${job.style}` : ""} · {relTime(job.createdAt)}
                    </p>
                  </div>
                  <span className={`pill ${job.tracks.some((t) => t.file) ? "pill-ready" : job.error ? "pill-setup" : ""}`}>
                    {!job.tracks.length && !job.error && <Spinner size={10} />}
                    {job.tracks.some((t) => t.file) ? "ready" : job.error ? "failed" : job.status.toLowerCase()}
                  </span>
                </div>

                {job.error && <p className="mt-2 text-[12px] text-rose-200">{job.error}</p>}

                {job.tracks.map((track) => (
                  <div key={track.id} className="mt-3">
                    <p className="mb-1 text-[12px] text-[var(--fg-dim)]">
                      {track.title}
                      {track.duration ? ` · ${Math.round(track.duration)}s` : ""}
                    </p>
                    {track.file ? (
                      <>
                        <audio src={`/api/preview/${project}/${track.file}`} controls className="w-full max-w-lg" />
                        <a href={`/api/preview/${project}/${track.file}`} download className="btn btn-ghost mt-1 !px-2 text-[11.5px]">
                          <Download size={12} /> {track.file}
                        </a>
                      </>
                    ) : track.url ? (
                      <a href={track.url} target="_blank" rel="noreferrer" className="text-[12px] text-[var(--gold)] underline decoration-dotted">
                        still on the provider — open
                      </a>
                    ) : null}
                  </div>
                ))}
              </motion.li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="Music2" title="No tracks yet" body="Write the brief in the Studio tab, then generate here." />
        )}
      </Panel>
    </div>
  );
}
