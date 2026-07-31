"use client";

import { useEffect, useState } from "react";
import { Check, Save } from "lucide-react";
import { AGENTS } from "@/lib/agents";
import { useJson } from "@/lib/client";
import { PageHeader, PageShell, Panel } from "@/components/ui";

interface SubscriptionEntry {
  id: string;
  name: string;
  provider?: string;
  monthlyPriceUsd: number;
  note?: string;
}
interface CustomAgentEntry {
  id: string;
  name: string;
  bin: string;
  argv?: string[];
  streamMode?: "ndjson" | "text";
  accent?: string;
  tagline?: string;
}
interface ConfigShape {
  userName: string;
  vaultRoot: string | null;
  vaultFolder: string;
  workspaceRoot: string;
  claudeModel: string;
  permissionMode: "acceptEdits" | "plan" | "default";
  bins: Record<string, string>;
  goalCategories: string[];
  locationLabel: string;
  a2aBaseUrl: string;
  subscriptions: SubscriptionEntry[];
  hourlyRateUsd: number;
  customAgents: CustomAgentEntry[];
}
interface ConfigResponse {
  config: ConfigShape;
  configPath: string;
  home: string;
  vaultExists: boolean;
}

export default function SettingsPage() {
  const { data, refresh } = useJson<ConfigResponse>("/api/config");
  const [form, setForm] = useState<Partial<ConfigShape>>({});
  const [bins, setBins] = useState<Record<string, string>>({});
  const [subs, setSubs] = useState<SubscriptionEntry[]>([]);
  const [customs, setCustoms] = useState<CustomAgentEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      userName: data.config.userName,
      vaultRoot: data.config.vaultRoot ?? "",
      vaultFolder: data.config.vaultFolder,
      workspaceRoot: data.config.workspaceRoot,
      claudeModel: data.config.claudeModel,
      permissionMode: data.config.permissionMode,
      locationLabel: data.config.locationLabel,
      goalCategories: data.config.goalCategories,
      a2aBaseUrl: data.config.a2aBaseUrl,
      hourlyRateUsd: data.config.hourlyRateUsd,
    });
    setBins(data.config.bins ?? {});
    setSubs(data.config.subscriptions ?? []);
    setCustoms(data.config.customAgents ?? []);
  }, [data]);

  async function save() {
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      ...form,
      bins: Object.fromEntries(Object.entries(bins).filter(([, v]) => v)),
      subscriptions: subs.filter((s) => s.name.trim()),
      hourlyRateUsd: Number(form.hourlyRateUsd) > 0 ? Number(form.hourlyRateUsd) : 120,
      customAgents: customs.filter((c) => c.id.trim() && c.bin.trim()),
    };
    if (payload.vaultRoot === "") payload.vaultRoot = null;
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "Could not save");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    void refresh();
  }

  const field = (key: keyof ConfigShape, label: string, placeholder: string, hint?: string) => (
    <div>
      <label htmlFor={`f-${key}`} className="eyebrow mb-1.5 block">
        {label}
      </label>
      <input
        id={`f-${key}`}
        value={(form[key] as string) ?? ""}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="input"
      />
      {hint && <p className="mt-1.5 text-[11.5px] text-[var(--fg-mute)]">{hint}</p>}
    </div>
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Self"
        icon="Settings"
        accent="#a59783"
        title="Settings"
        subtitle="One JSON file on this machine. No account, no sync, no telemetry."
        actions={
          <button onClick={() => void save()} disabled={saving} className="btn btn-primary">
            {saved ? <Check size={14} /> : <Save size={14} />} {saving ? "Saving…" : saved ? "Saved" : "Save"}
          </button>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/8 px-3.5 py-2.5 text-[12.5px] text-rose-200">{error}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="You">
          <div className="space-y-4">
            {field("userName", "Name", "Operator", "Shown in the Mission Control greeting.")}
            {field("locationLabel", "Location label", "Local", "Cosmetic — appears in the header.")}
            <div>
              <label htmlFor="f-cats" className="eyebrow mb-1.5 block">
                Goal categories
              </label>
              <input
                id="f-cats"
                value={(form.goalCategories ?? []).join(", ")}
                onChange={(e) => setForm((f) => ({ ...f, goalCategories: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))}
                placeholder="Business, Build, Health"
                className="input"
              />
            </div>
          </div>
        </Panel>

        <Panel title="Storage">
          <div className="space-y-4">
            {field(
              "vaultRoot",
              "Obsidian vault path",
              "/Users/you/Documents/Vault",
              data?.vaultExists ? "Found — goals and journal mirror here as markdown." : "Leave empty to skip markdown mirroring.",
            )}
            {field("vaultFolder", "Folder inside the vault", "Baseline AI Workforce")}
            {field("workspaceRoot", "Workspace root", "~/.baseline-workforce/workspace", "Where agent builds land.")}
            <p className="text-[11.5px] text-[var(--fg-mute)]">
              Config file: <span className="mono break-all">{data?.configPath}</span>
            </p>
          </div>
        </Panel>

        <Panel title="Models">
          <div className="space-y-4">
            {field("claudeModel", "Claude model", "claude-opus-4-8", "Passed to the Claude Code CLI as --model.")}
            <div>
              <label htmlFor="f-perm" className="eyebrow mb-1.5 block">
                File permissions
              </label>
              <select
                id="f-perm"
                value={form.permissionMode ?? "acceptEdits"}
                onChange={(e) => setForm((f) => ({ ...f, permissionMode: e.target.value as ConfigShape["permissionMode"] }))}
                className="input"
              >
                <option value="acceptEdits">Accept edits inside the workspace (default)</option>
                <option value="plan">Plan only — never write files</option>
                <option value="default">Ask every time (headless runs will stall)</option>
              </select>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--fg-mute)]">
                Agents are spawned inside their own workspace project. On “ask every time” a headless run has nobody to
                answer the prompt, so builds stop at the first write.
              </p>
            </div>
            <p className="text-[11.5px] leading-relaxed text-[var(--fg-mute)]">
              HTTP-backed agents (GLM, OmniRoute, Hy3, Sakana) read their keys from apps/workforce/.env.local. Keys are never
              written into this config file.
            </p>
          </div>
        </Panel>

        <Panel
          title="Subscriptions"
          subtitle="Your own flat-fee AI plans — powers the spend ledger on the home page. A personal ledger, never a paywall."
        >
          <div className="space-y-2.5">
            {subs.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <input
                  className="input flex-1 py-1.5 text-[12.5px]"
                  placeholder="Claude Max 20x"
                  value={s.name}
                  onChange={(e) => setSubs((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <input
                  className="input w-40 py-1.5 text-[12.5px]"
                  placeholder="Anthropic · OAuth"
                  value={s.provider ?? ""}
                  onChange={(e) => setSubs((p) => p.map((x, j) => (j === i ? { ...x, provider: e.target.value } : x)))}
                />
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[var(--fg-mute)]">$</span>
                  <input
                    className="input w-24 py-1.5 pl-6 text-[12.5px]"
                    type="number"
                    min={0}
                    placeholder="200"
                    value={s.monthlyPriceUsd || ""}
                    onChange={(e) =>
                      setSubs((p) => p.map((x, j) => (j === i ? { ...x, monthlyPriceUsd: Number(e.target.value) || 0 } : x)))
                    }
                  />
                </div>
                <button
                  className="btn btn-ghost !px-2 !py-1 text-[11.5px]"
                  onClick={() => setSubs((p) => p.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="btn !px-2.5 text-[12px]"
              onClick={() => setSubs((p) => [...p, { id: `sub-${Date.now().toString(36)}`, name: "", monthlyPriceUsd: 0 }])}
            >
              + Add subscription
            </button>
            <div className="flex items-center gap-3 pt-1">
              <label htmlFor="f-rate" className="w-[130px] shrink-0 text-[12.5px] text-[var(--fg-dim)]">
                Hourly rate ($)
              </label>
              <input
                id="f-rate"
                type="number"
                min={1}
                className="input w-28 py-1.5 text-[12.5px]"
                value={form.hourlyRateUsd ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, hourlyRateUsd: Number(e.target.value) }))}
              />
              <span className="text-[11.5px] text-[var(--fg-mute)]">used wherever time saved becomes dollars</span>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <label htmlFor="f-a2a" className="w-[130px] shrink-0 text-[12.5px] text-[var(--fg-dim)]">
                A2A server URL
              </label>
              <input
                id="f-a2a"
                className="input flex-1 py-1.5 text-[12.5px]"
                placeholder="http://127.0.0.1:8484"
                value={form.a2aBaseUrl ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, a2aBaseUrl: e.target.value }))}
              />
            </div>
          </div>
        </Panel>

        <Panel
          title="Custom CLIs (CLI-Anything)"
          subtitle="Any CLI on this machine becomes a chat agent — it gets a page, status probe and history like the built-ins."
        >
          <div className="space-y-2.5">
            {customs.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  className="input w-28 py-1.5 text-[12.5px]"
                  placeholder="id (slug)"
                  value={c.id}
                  onChange={(e) =>
                    setCustoms((p) => p.map((x, j) => (j === i ? { ...x, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") } : x)))
                  }
                />
                <input
                  className="input w-36 py-1.5 text-[12.5px]"
                  placeholder="Display name"
                  value={c.name}
                  onChange={(e) => setCustoms((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <input
                  className="input w-32 py-1.5 text-[12.5px] mono"
                  placeholder="binary"
                  value={c.bin}
                  onChange={(e) => setCustoms((p) => p.map((x, j) => (j === i ? { ...x, bin: e.target.value } : x)))}
                />
                <input
                  className="input min-w-0 flex-1 py-1.5 text-[12.5px] mono"
                  placeholder='args, e.g. run {prompt}'
                  value={(c.argv ?? []).join(" ")}
                  onChange={(e) =>
                    setCustoms((p) => p.map((x, j) => (j === i ? { ...x, argv: e.target.value.split(/\s+/).filter(Boolean) } : x)))
                  }
                />
                <button className="btn btn-ghost !px-2 !py-1 text-[11.5px]" onClick={() => setCustoms((p) => p.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
            <button className="btn !px-2.5 text-[12px]" onClick={() => setCustoms((p) => [...p, { id: "", name: "", bin: "", argv: ["{prompt}"] }])}>
              + Add custom CLI
            </button>
            <p className="text-[11.5px] leading-relaxed text-[var(--fg-mute)]">
              <span className="mono">{"{prompt}"}</span> in the args is replaced with your message (appended when absent). Output
              streams as plain text. Custom ids can&apos;t shadow built-in agents.
            </p>
          </div>
        </Panel>

        <Panel title="Binary overrides" subtitle="Only needed when a CLI is not on PATH">
          <div className="space-y-3">
            {AGENTS.filter((a) => a.backend === "cli").map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <label htmlFor={`bin-${a.id}`} className="w-[130px] shrink-0 text-[12.5px] text-[var(--fg-dim)]">
                  {a.name}
                </label>
                <input
                  id={`bin-${a.id}`}
                  value={bins[a.id] ?? ""}
                  onChange={(e) => setBins((b) => ({ ...b, [a.id]: e.target.value }))}
                  placeholder={`auto (${a.bins[0] ?? "—"})`}
                  className="input py-1.5 text-[12.5px]"
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--fg-mute)]">
            Need different flags for your version of a CLI? Add an <span className="mono">argv</span> map to the config file —
            each entry is the argument list, with <span className="mono">{"{prompt}"}</span> and <span className="mono">{"{model}"}</span>{" "}
            substituted.
          </p>
        </Panel>
      </div>
    </PageShell>
  );
}
