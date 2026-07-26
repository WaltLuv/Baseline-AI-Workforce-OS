"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Clapperboard, Download, RefreshCw } from "lucide-react";
import { useJson } from "@/lib/client";
import type { RenderJob } from "@/app/api/render/video/route";
import IntegrationBanner, { useIntegration } from "./IntegrationBanner";
import VoiceButton from "./VoiceButton";
import { EmptyState, Panel, Spinner, relTime } from "./ui";

interface Avatar {
  id: string;
  name: string;
  preview: string | null;
  kind: "avatar" | "talking_photo";
}
interface Voice {
  id: string;
  name: string;
  language: string;
  gender: string;
}
interface Catalog {
  avatars?: Avatar[];
  voices?: Voice[];
  error?: string;
}
interface JobsResponse {
  jobs: RenderJob[];
  project: string;
}

const ASPECTS = ["16:9", "9:16", "1:1"] as const;

/** HeyGen render: pick an avatar and voice from your own account, send a script. */
export default function VideoRender() {
  const { connected } = useIntegration("heygen");
  const { data: catalog } = useJson<Catalog>(connected ? "/api/render/video?view=catalog" : null);
  const { data: jobsData, refresh } = useJson<JobsResponse>("/api/render/video");

  const [script, setScript] = useState("");
  const [interim, setInterim] = useState("");
  const [title, setTitle] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>("16:9");
  const [test, setTest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const polling = useRef<Set<string>>(new Set());

  const avatars = catalog?.avatars ?? [];
  const voices = catalog?.voices ?? [];
  const jobs = jobsData?.jobs ?? [];
  const project = jobsData?.project ?? "video-studio";
  const composed = interim ? `${script} ${interim}`.trim() : script;

  useEffect(() => {
    if (!avatarId && avatars.length) setAvatarId(avatars[0].id);
    if (!voiceId && voices.length) setVoiceId(voices[0].id);
  }, [avatars, voices, avatarId, voiceId]);

  // Poll unfinished jobs; each tick asks the server, which downloads the file
  // into the workspace the moment HeyGen reports completion.
  useEffect(() => {
    const pending = jobs.filter((j) => !j.file && !j.error && j.status !== "failed");
    if (!pending.length) return;
    const id = setInterval(async () => {
      for (const job of pending) {
        if (polling.current.has(job.id)) continue;
        polling.current.add(job.id);
        await fetch("/api/render/video", {
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
    const res = await fetch("/api/render/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: text, avatarId, voiceId, title, aspect, test, avatarKind: avatars.find((a) => a.id === avatarId)?.kind }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res?.ok) {
      setError(json.error ?? "could not start the render");
      return;
    }
    setScript("");
    setInterim("");
    void refresh();
  }, [aspect, avatarId, avatars, busy, composed, refresh, test, title, voiceId]);

  return (
    <div className="space-y-4">
      <IntegrationBanner id="heygen" />

      <Panel title="Render an avatar video" subtitle={connected ? "Avatars and voices come from your HeyGen account" : "Connect HeyGen above to enable"}>
        {catalog?.error && (
          <p className="mb-3 rounded-lg border border-rose-500/25 bg-rose-500/6 px-3 py-2 text-[12px] text-rose-200">{catalog.error}</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="hg-avatar" className="eyebrow mb-1.5 block">
              Avatar
            </label>
            <select
              id="hg-avatar"
              value={avatarId}
              onChange={(e) => setAvatarId(e.target.value)}
              disabled={!connected || !avatars.length}
              className="input py-2 text-[13px]"
            >
              {avatars.length ? (
                avatars.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.kind === "talking_photo" ? " (photo)" : ""}
                  </option>
                ))
              ) : (
                <option value="">{connected ? "loading…" : "connect HeyGen first"}</option>
              )}
            </select>
          </div>
          <div>
            <label htmlFor="hg-voice" className="eyebrow mb-1.5 block">
              Voice
            </label>
            <select
              id="hg-voice"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              disabled={!connected || !voices.length}
              className="input py-2 text-[13px]"
            >
              {voices.length ? (
                voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.language ? `· ${v.language}` : ""}
                  </option>
                ))
              ) : (
                <option value="">{connected ? "loading…" : "connect HeyGen first"}</option>
              )}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label htmlFor="hg-title" className="eyebrow mb-1.5 block">
            Title
          </label>
          <input id="hg-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Local agents, one laptop" className="input py-2 text-[13px]" />
        </div>

        <div className="mt-3">
          <label htmlFor="hg-script" className="eyebrow mb-1.5 block">
            Script — spoken word for word
          </label>
          <textarea
            id="hg-script"
            rows={5}
            value={composed}
            onChange={(e) => {
              setInterim("");
              setScript(e.target.value);
            }}
            placeholder="Paste the script from the Studio tab, or write it here…"
            className="textarea py-2 text-[13.5px]"
          />
          <p className="mt-1.5 text-[11px] text-[var(--fg-mute)]">{composed.trim().split(/\s+/).filter(Boolean).length} words · roughly {Math.round((composed.trim().split(/\s+/).filter(Boolean).length / 150) * 60)}s spoken</p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <VoiceButton
              size={38}
              title="Dictate the script"
              onTranscript={(t, o) => {
                if (o.final) {
                  setInterim("");
                  setScript((prev) => (prev ? `${prev} ${t}` : t));
                } else {
                  setInterim(t);
                }
              }}
            />
            <select value={aspect} onChange={(e) => setAspect(e.target.value as (typeof ASPECTS)[number])} className="input !w-auto py-1.5 text-[12.5px]">
              {ASPECTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--fg-dim)]">
              <input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} className="accent-[var(--gold)]" />
              Test render (watermarked, no credits)
            </label>
          </div>
          <button onClick={() => void submit()} disabled={!connected || !composed.trim() || busy} className="btn btn-primary">
            {busy ? <Spinner /> : <Clapperboard size={14} />} Render
          </button>
        </div>

        {error && <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/6 px-3 py-2 text-[12px] text-rose-200">{error}</p>}
      </Panel>

      <Panel
        title="Renders"
        subtitle={`${jobs.length} job${jobs.length === 1 ? "" : "s"} · finished files are downloaded into the workspace`}
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
                    <p className="mt-0.5 text-[11px] text-[var(--fg-mute)]">
                      {job.aspect} · {job.test ? "test render" : "full render"} · {relTime(job.createdAt)}
                    </p>
                  </div>
                  <span className={`pill ${job.file ? "pill-ready" : job.error ? "pill-setup" : ""}`}>
                    {!job.file && !job.error && <Spinner size={10} />}
                    {job.file ? "ready" : job.error ? "failed" : job.status}
                  </span>
                </div>

                {job.error && <p className="mt-2 text-[12px] text-rose-200">{job.error}</p>}

                {job.file && (
                  <div className="mt-3">
                    <video src={`/api/preview/${project}/${job.file}`} controls className="w-full max-w-xl rounded-xl border border-[var(--line)]" />
                    <a href={`/api/preview/${project}/${job.file}`} download className="btn btn-ghost mt-2 !px-2 text-[12px]">
                      <Download size={13} /> {job.file}
                    </a>
                  </div>
                )}
              </motion.li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="Clapperboard" title="No renders yet" body="Write the script in the Studio tab, then bring it here." />
        )}
      </Panel>
    </div>
  );
}
