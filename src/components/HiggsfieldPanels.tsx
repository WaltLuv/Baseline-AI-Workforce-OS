"use client";

/**
 * Higgsfield's agent-page surfaces: the Provider Control Center pattern from
 * Baseline Agent OS — Claude Code is the studio, Higgsfield is the provider,
 * connected through its MCP server. Every state shown here is probed, never
 * assumed.
 */

import { useRef, useState } from "react";
import { streamNdjson, useJson, type StreamEvent } from "@/lib/client";
import { EmptyState, Icon, Panel, Spinner, StatusPill } from "@/components/ui";

interface Overview {
  state: "ready" | "credentials_missing" | "setup_required" | "error";
  detail: string;
  credentialsPresent: boolean;
  credentialSource: string | null;
  mcpRegistered: boolean;
  mcpCommand: string | null;
  mcpReachable: boolean;
  mcpUrl: string;
  install: string;
}

const STATE_LABEL: Record<Overview["state"], string> = {
  ready: "Ready",
  credentials_missing: "Credentials missing",
  setup_required: "Setup required",
  error: "Error",
};

export default function HiggsfieldPanels({ view }: { view: "Studio" | "Provider" | "MCP" }) {
  const { data, refresh } = useJson<Overview>("/api/integrations/higgsfield", { pollMs: 60_000 });

  if (!data) {
    return (
      <Panel>
        <p className="text-[12.5px] text-[var(--fg-mute)]">Probing the Higgsfield provider…</p>
      </Panel>
    );
  }
  if (view === "Studio") return <StudioView data={data} />;
  if (view === "MCP") return <McpView data={data} onRefresh={refresh} />;
  return <ProviderView data={data} />;
}

function StudioView({ data }: { data: Overview }) {
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState<"video" | "image">("video");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    if (!brief.trim() || running) return;
    setRunning(true);
    setOutput("");
    setTools([]);
    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    const prompt = `You have the Higgsfield MCP server registered (its tools are prefixed mcp__higgsfield or similar — discover them with your MCP tooling). Use it to generate a ${kind} for this brief, then report exactly what was created with any asset URLs or job ids the MCP returned:

${brief.trim()}

If the Higgsfield MCP tools are not available or authentication fails, say precisely what failed and what the operator must run — do not pretend a generation happened.`;
    try {
      await streamNdjson(
        "/api/run",
        { agent: "claude", prompt, project: "higgsfield-studio" },
        (evt: StreamEvent) => {
          if ((evt.t === "delta" || evt.t === "final" || evt.t === "text") && evt.text) {
            acc = evt.t === "delta" ? acc + evt.text : evt.text;
            setOutput(acc);
          } else if (evt.t === "tool") {
            setTools((l) => [...l.slice(-20), `${evt.name} ${evt.detail ?? ""}`.trim()]);
          } else if (evt.t === "err" && evt.text) {
            setTools((l) => [...l.slice(-20), `error: ${evt.text}`]);
          }
        },
        ac.signal,
      );
    } catch (e) {
      setTools((l) => [...l, `error: ${e instanceof Error ? e.message : String(e)}`]);
    }
    setRunning(false);
  };

  return (
    <div className="space-y-4">
      {data.state !== "ready" && (
        <Panel className="border-[rgba(251,191,36,0.28)]">
          <p className="text-[12.5px] leading-relaxed text-amber-100">
            <Icon name="TriangleAlert" size={13} className="mr-1 inline" />
            {STATE_LABEL[data.state]}: {data.detail}. The studio dispatches through Claude Code + the registered MCP —
            set that up on the MCP tab first. You can still send a brief; the run will report honestly what failed.
          </p>
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Generation brief" subtitle="Dispatched to Claude Code, which drives the Higgsfield MCP" className="lg:col-span-1">
          <div className="space-y-3">
            <div className="flex gap-1.5">
              {(["video", "image"] as const).map((k) => (
                <button key={k} className={`btn !px-3 text-[12px] ${kind === k ? "btn-primary" : ""}`} onClick={() => setKind(k)}>
                  {k}
                </button>
              ))}
            </div>
            <textarea
              className="textarea w-full"
              rows={6}
              placeholder="e.g. A 10-second cinematic product shot of a matte-black coffee grinder on slate, morning light, slow dolly-in."
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button className="btn btn-primary" onClick={() => void run()} disabled={running || !brief.trim()}>
                {running ? <Spinner size={13} /> : <Icon name="Clapperboard" size={13} />} Generate
              </button>
              {running && (
                <button className="btn" onClick={() => abortRef.current?.abort()}>
                  Stop
                </button>
              )}
            </div>
            {tools.length > 0 && (
              <pre className="mono max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.5)] p-2.5 text-[10.5px] text-[var(--fg-mute)]">
                {tools.join("\n")}
              </pre>
            )}
          </div>
        </Panel>
        <Panel title="Result" subtitle="Verbatim report from the run — asset URLs, job ids, or the honest failure" className="lg:col-span-2">
          {output ? (
            <pre className="scroll max-h-[480px] overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--fg-soft)]">{output}</pre>
          ) : (
            <p className="text-[12.5px] text-[var(--fg-mute)]">No generation dispatched yet.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function McpView({ data, onRefresh }: { data: Overview; onRefresh: () => void }) {
  return (
    <div className="space-y-4">
      <Panel title="MCP connection" subtitle="How this machine reaches the Higgsfield provider" padded={false}>
        <ul className="divide-y divide-[var(--line)]">
          <li className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-[13px]">Registered with Claude Code</span>
            <span className="flex items-center gap-2">
              {data.mcpCommand && <span className="mono max-w-72 truncate text-[10.5px] text-[var(--fg-mute)]">{data.mcpCommand}</span>}
              <StatusPill ready={data.mcpRegistered} label={data.mcpRegistered ? "Registered" : "Not registered"} />
            </span>
          </li>
          <li className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-[13px]">Endpoint answering</span>
            <span className="flex items-center gap-2">
              <span className="mono text-[10.5px] text-[var(--fg-mute)]">{data.mcpUrl}</span>
              <StatusPill ready={data.mcpReachable} label={data.mcpReachable ? "Reachable" : "No answer"} />
            </span>
          </li>
        </ul>
      </Panel>
      {!data.mcpRegistered && (
        <Panel title="Register it" subtitle="One command, then authenticate once via the OAuth device flow">
          <pre className="mono overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.6)] p-3.5 text-[12px] text-[var(--fg-soft)]">
            {data.install}
            {"\n"}# then inside claude: /mcp → complete the sign-in
          </pre>
          <button className="btn mt-3" onClick={onRefresh}>
            Re-check
          </button>
        </Panel>
      )}
    </div>
  );
}

function ProviderView({ data }: { data: Overview }) {
  return (
    <div className="space-y-4">
      <Panel title="Provider status" subtitle="Truth-first: probed, never assumed">
        <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="eyebrow mb-1">State</dt>
            <dd>
              <StatusPill ready={data.state === "ready"} label={STATE_LABEL[data.state]} />
            </dd>
          </div>
          <div>
            <dt className="eyebrow mb-1">API keys</dt>
            <dd>
              <StatusPill
                ready={data.credentialsPresent}
                label={data.credentialsPresent ? `present (${data.credentialSource})` : "not set"}
              />
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="eyebrow mb-1">Detail</dt>
            <dd className="text-[var(--fg-dim)]">{data.detail}</dd>
          </div>
        </dl>
        <p className="mt-4 text-[12px] leading-relaxed text-[var(--fg-mute)]">
          Account, credits and generation history live on the{" "}
          <a href="https://higgsfield.ai" target="_blank" rel="noreferrer" className="underline decoration-dotted">
            Higgsfield dashboard
          </a>
          ; the MCP session carries your identity once authenticated. API keys are optional and resolve through the
          Credentials page like every other provider.
        </p>
      </Panel>
      {!data.credentialsPresent && (
        <Panel>
          <EmptyState
            icon="KeyRound"
            title="No API keys stored"
            body="Optional — the MCP OAuth flow is the primary auth. If you have platform keys, add HIGGSFIELD_API_KEY_ID and HIGGSFIELD_API_KEY_SECRET on the Credentials page."
          />
        </Panel>
      )}
    </div>
  );
}
