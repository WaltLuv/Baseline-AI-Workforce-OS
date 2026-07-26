"use client";

import { useEffect, useState } from "react";
import { Check, Save } from "lucide-react";
import { AGENTS } from "@/lib/agents";
import { useJson } from "@/lib/client";
import { PageHeader, PageShell, Panel } from "@/components/ui";

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
    });
    setBins(data.config.bins ?? {});
  }, [data]);

  async function save() {
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = { ...form, bins: Object.fromEntries(Object.entries(bins).filter(([, v]) => v)) };
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
              HTTP-backed agents (GLM, OmniRoute, Hy3, Sakana) read their keys from .env.local. Keys are never
              written into this config file.
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
