"use client";

import { useCallback, useState } from "react";
import { Copy, Globe, Square, Wifi } from "lucide-react";
import { useJson } from "@/lib/client";
import { EmptyState, Panel, Spinner, relTime } from "./ui";

interface PhoneStatus {
  running: boolean;
  provider: string | null;
  url: string | null;
  startedAt: number | null;
  log: string;
  available: { provider: string; bin: string | null }[];
  lan: string[];
  port: number;
  target: string | null;
  qr: string | null;
  error?: string;
}

/**
 * Phone agent — get this dashboard onto your phone.
 *
 * LAN first (nothing leaves the network). A tunnel is offered second, with the
 * consequence stated plainly: it puts the dashboard on the public internet for
 * as long as it runs.
 */
export default function PhonePanel() {
  const { data, refresh } = useJson<PhoneStatus>("/api/hermes/phone", { pollMs: 15_000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const act = useCallback(
    async (action: "start" | "stop", provider?: string) => {
      setBusy(true);
      setError(null);
      const res = await fetch("/api/hermes/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, provider }),
      }).catch(() => null);
      const json = (await res?.json().catch(() => ({}))) as { error?: string };
      setBusy(false);
      if (!res?.ok) setError(json.error ?? "could not change the tunnel");
      void refresh();
    },
    [refresh],
  );

  const installed = (data?.available ?? []).filter((a) => a.bin);

  return (
    <div className="space-y-4">
      <Panel title="On the same wifi" subtitle="No tunnel, nothing public — the fastest way in">
        {data?.lan.length ? (
          <ul className="space-y-2">
            {data.lan.map((url) => (
              <li key={url} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.5)] px-3.5 py-2.5">
                <span className="mono flex items-center gap-2 text-[var(--fg-soft)]">
                  <Wifi size={13} className="text-[var(--emerald)]" />
                  {url}
                </span>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1400);
                  }}
                  className="btn btn-ghost !px-2 !py-1 text-[11.5px]"
                >
                  <Copy size={12} /> {copied ? "copied" : "copy"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-[var(--fg-mute)]">No LAN address found — this machine may only have a loopback interface.</p>
        )}
        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--fg-mute)]">
          The dev server binds to 127.0.0.1, so a LAN address only answers if you start it with{" "}
          <span className="mono">next dev -H 0.0.0.0 -p {data?.port ?? 4400}</span>. That exposes it to everyone on the
          network — fine at home, think twice on café wifi.
        </p>
      </Panel>

      <Panel
        title="Public tunnel"
        subtitle={data?.running ? `${data.provider} · running since ${relTime(data.startedAt ?? 0)}` : "off"}
        actions={
          data?.running ? (
            <button onClick={() => void act("stop")} disabled={busy} className="btn !py-1.5 text-[12.5px] text-rose-200">
              {busy ? <Spinner /> : <Square size={13} />} Stop
            </button>
          ) : null
        }
      >
        {data?.running && data.url ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {data.qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.qr} alt="QR code for the tunnel URL" width={180} height={180} className="rounded-xl border border-[var(--line)]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="eyebrow mb-1.5">Public URL</p>
              <a href={data.url} target="_blank" rel="noreferrer" className="mono block break-all text-[var(--gold)] underline decoration-dotted">
                {data.url}
              </a>
              <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/6 px-3 py-2 text-[12px] leading-relaxed text-amber-100">
                This URL is on the public internet and has no login in front of it. Anyone who has it can drive your agents.
                Stop the tunnel when you are done.
              </p>
            </div>
          </div>
        ) : installed.length ? (
          <>
            <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--fg-dim)]">
              Starts a tunnel and shows a QR code to point your phone at. It stays up until you stop it or quit the server.
            </p>
            <div className="flex flex-wrap gap-2">
              {installed.map((a) => (
                <button key={a.provider} onClick={() => void act("start", a.provider)} disabled={busy} className="btn btn-primary">
                  {busy ? <Spinner /> : <Globe size={14} />} Start {a.provider}
                </button>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon="Globe"
            title="No tunnel tool installed"
            body="Install cloudflared (brew install cloudflared) or ngrok to get a public URL and QR code. The LAN route above needs neither."
          />
        )}

        {(error || data?.error) && (
          <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/6 px-3 py-2 text-[12px] text-rose-200">{error ?? data?.error}</p>
        )}

        {data?.running && data.log && !data.url && (
          <pre className="mono mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.6)] p-3 text-[11px] text-[var(--fg-mute)]">
            {data.log}
          </pre>
        )}
      </Panel>
    </div>
  );
}
