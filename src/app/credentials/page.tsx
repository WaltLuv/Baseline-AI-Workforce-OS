"use client";

import { useMemo, useState } from "react";
import { useJson } from "@/lib/client";
import {
  CATEGORY_LABELS,
  type Provider,
  type ProviderCategory,
  type ProviderStatus,
} from "@/lib/credentials";
import {
  EmptyState,
  Icon,
  PageHeader,
  PageShell,
  Panel,
  SetupNeeded,
  Spinner,
  Stat,
  StatusPill,
  Tabs,
} from "@/components/ui";

const ACCENT = "var(--gold)";
const TABS = ["Providers", "1Password", "Environment"];

interface CredentialsPayload {
  providers: Provider[];
  statuses: ProviderStatus[];
  storePath: string;
}

interface OpPayload {
  status: { installed: boolean; bin: string | null; signedIn: boolean; account: string | null; detail: string };
  mappings: Record<string, string>;
  template: string;
  defaultVault: string;
  mappingPath: string;
}

const IMPORTANCE_LABEL: Record<string, string> = {
  required: "required",
  recommended: "recommended",
  as_needed: "as needed",
};

export default function CredentialsPage() {
  const [tab, setTab] = useState(TABS[0]);
  const { data, refresh } = useJson<CredentialsPayload>("/api/credentials");
  const { data: op, refresh: refreshOp } = useJson<OpPayload>("/api/credentials/onepassword");

  const statusById = useMemo(() => {
    const m: Record<string, ProviderStatus> = {};
    for (const s of data?.statuses ?? []) m[s.id] = s;
    return m;
  }, [data]);

  const present = data?.statuses.filter((s) => s.present).length ?? 0;

  return (
    <PageShell>
      <PageHeader
        eyebrow="System · Keys & secrets"
        title="API Keys & Credentials"
        subtitle="Every key your stack can use, resolved env → 1Password → local file. Values never reach the browser — only masked previews."
        accent={ACCENT}
        icon="KeyRound"
        actions={
          <button className="btn" onClick={() => void Promise.all([refresh(), refreshOp()])}>
            Refresh
          </button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Providers configured" value={data ? `${present}/${data.providers.length}` : "—"} icon="KeyRound" accent={ACCENT} />
        <Stat
          label="1Password runtime"
          value={op ? (op.status.signedIn ? "Signed in" : op.status.installed ? "Not signed in" : "Not installed") : "—"}
          hint={op?.status.account ?? undefined}
          icon="ShieldCheck"
          accent="var(--violet)"
        />
        <Stat
          label="Local store"
          value={data?.statuses.filter((s) => s.source === "file").length ?? "—"}
          hint="chmod 600 · never committed"
          icon="FileLock2"
          accent="var(--cyan)"
        />
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "Providers" && <ProvidersTab data={data} statusById={statusById} onChanged={refresh} />}
      {tab === "1Password" && <OnePasswordTab op={op} providers={data?.providers ?? []} statusById={statusById} onChanged={() => Promise.all([refresh(), refreshOp()])} />}
      {tab === "Environment" && <EnvironmentTab data={data} statusById={statusById} />}
    </PageShell>
  );
}

function ProvidersTab({
  data,
  statusById,
  onChanged,
}: {
  data: CredentialsPayload | null;
  statusById: Record<string, ProviderStatus>;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  if (!data) return <Panel><p className="text-[12.5px] text-[var(--fg-mute)]">Reading the catalogue…</p></Panel>;

  const q = query.toLowerCase();
  const filtered = data.providers.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.id.includes(q) || p.envKeys.some((k) => k.toLowerCase().includes(q)),
  );
  const categories = [...new Set(filtered.map((p) => p.category))] as ProviderCategory[];

  const save = async (id: string) => {
    if (!value.trim()) return;
    setBusy(true);
    await fetch(`/api/credentials?id=${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: value.trim() }),
    });
    setBusy(false);
    setEditing(null);
    setValue("");
    onChanged();
  };

  const remove = async (id: string) => {
    setBusy(true);
    await fetch(`/api/credentials?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(false);
    onChanged();
  };

  return (
    <div className="space-y-4">
      <input
        className="input w-full max-w-md"
        placeholder="Filter providers, keys…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {categories.map((cat) => (
        <Panel key={cat} title={CATEGORY_LABELS[cat]} padded={false}>
          <ul className="divide-y divide-[var(--line)]">
            {filtered
              .filter((p) => p.category === cat)
              .map((p) => {
                const s = statusById[p.id];
                return (
                  <li key={p.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-[13px] font-medium">{p.name}</span>
                          <span className="pill !text-[10px]">{IMPORTANCE_LABEL[p.importance]}</span>
                        </span>
                        <span className="mono mt-0.5 block truncate text-[11px] text-[var(--fg-mute)]">
                          {s?.present
                            ? `${s.maskedPreview} · from ${s.source === "env" ? `env (${s.envKeyUsed})` : s.source === "op" ? "1Password" : "local store"}`
                            : p.envKeys.join(" · ") || "no env key — configure in-app"}
                        </span>
                      </span>
                      <StatusPill ready={Boolean(s?.present)} label={s?.present ? "Set" : "Not set"} />
                      {p.setupUrl && (
                        <a href={p.setupUrl} target="_blank" rel="noreferrer" className="btn btn-ghost !px-2 !py-1 text-[11.5px]">
                          <Icon name="ExternalLink" size={11} /> Get key
                        </a>
                      )}
                      {s?.source === "file" ? (
                        <button className="btn btn-ghost !px-2 !py-1 text-[11.5px]" disabled={busy} onClick={() => void remove(p.id)}>
                          Remove
                        </button>
                      ) : (
                        <button
                          className="btn btn-ghost !px-2 !py-1 text-[11.5px]"
                          onClick={() => {
                            setEditing(editing === p.id ? null : p.id);
                            setValue("");
                          }}
                        >
                          {editing === p.id ? "Cancel" : "Add key"}
                        </button>
                      )}
                    </div>
                    {editing === p.id && (
                      <div className="mt-2.5 flex items-center gap-2">
                        <input
                          type="password"
                          className="input flex-1"
                          placeholder="Paste the key — stored locally, chmod 600"
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && void save(p.id)}
                        />
                        <button className="btn btn-primary" disabled={busy || !value.trim()} onClick={() => void save(p.id)}>
                          {busy ? <Spinner size={12} /> : "Save"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        </Panel>
      ))}
      <p className="text-[11.5px] text-[var(--fg-mute)]">
        Stored at <span className="mono">{data.storePath}</span> · written mode 600 · gitignored · read only by this app.
      </p>
    </div>
  );
}

function OnePasswordTab({
  op,
  providers,
  statusById,
  onChanged,
}: {
  op: OpPayload | null;
  providers: Provider[];
  statusById: Record<string, ProviderStatus>;
  onChanged: () => void;
}) {
  const [refDrafts, setRefDrafts] = useState<Record<string, string>>({});
  const [validating, setValidating] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, string>>({});

  if (!op) return <Panel><p className="text-[12.5px] text-[var(--fg-mute)]">Checking for the op CLI…</p></Panel>;

  const requirement = [
    {
      label: "1Password CLI",
      met: op.status.signedIn,
      detail: op.status.detail,
      install: "brew install 1password-cli   # then: op signin",
    },
  ];

  const saveMapping = async (id: string, ref: string | null) => {
    await fetch("/api/credentials/onepassword", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ref }),
    });
    onChanged();
  };

  const validate = async (id: string, ref: string) => {
    setValidating(id);
    const res = await fetch("/api/credentials/onepassword", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "validate", ref }),
    });
    const v = (await res.json()) as { parses: boolean; resolves: boolean };
    setVerdicts((prev) => ({
      ...prev,
      [id]: !v.parses ? "not a valid op:// reference" : v.resolves ? "resolves ✓" : "parses, but does not resolve (check vault/item/field and sign-in)",
    }));
    setValidating(null);
  };

  return (
    <div className="space-y-4">
      {!op.status.signedIn && (
        <SetupNeeded
          title="1Password runtime not active"
          requirements={requirement}
          note={`Mappings can be edited now; they resolve once op is signed in. Default vault: ${op.defaultVault}. Keys fall back to the local store meanwhile.`}
        />
      )}

      <Panel
        title="Provider → op:// reference mappings"
        subtitle="References only — the mapping file never contains a secret value"
        padded={false}
      >
        <ul className="divide-y divide-[var(--line)]">
          {providers.map((p) => {
            const mapped = op.mappings[p.id] ?? "";
            const draft = refDrafts[p.id] ?? mapped;
            const s = statusById[p.id];
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2.5 px-5 py-2.5">
                <span className="w-44 shrink-0 truncate text-[12.5px] font-medium">{p.name}</span>
                <input
                  className="input mono min-w-0 flex-1 !py-1.5 text-[11.5px]"
                  placeholder={`op://${op.defaultVault}/${p.id}/credential`}
                  value={draft}
                  onChange={(e) => setRefDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                />
                {s?.source === "op" && <StatusPill ready label="Live via op" />}
                {verdicts[p.id] && <span className="text-[11px] text-[var(--fg-mute)]">{verdicts[p.id]}</span>}
                <button
                  className="btn btn-ghost !px-2 !py-1 text-[11.5px]"
                  disabled={!draft.trim() || validating === p.id}
                  onClick={() => void validate(p.id, draft.trim())}
                >
                  {validating === p.id ? <Spinner size={11} /> : "Validate"}
                </button>
                <button
                  className="btn btn-ghost !px-2 !py-1 text-[11.5px]"
                  disabled={draft.trim() === mapped}
                  onClick={() => void saveMapping(p.id, draft.trim() || null)}
                >
                  Save
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title=".env template for op run" subtitle="References only — safe to commit. Regenerated from the mappings above.">
        <pre className="mono scroll max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.6)] p-3.5 text-[11.5px] text-[var(--fg-dim)]">
          {op.template}
        </pre>
        <p className="mt-2 text-[11.5px] text-[var(--fg-mute)]">
          Run any command with secrets injected and nothing on disk:{" "}
          <span className="mono">op run --env-file=.env.op.template -- npm run dev</span>
        </p>
      </Panel>

      <LeakScanner />
    </div>
  );
}

function LeakScanner() {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<{ pattern: string; line: number; excerpt: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  const scan = async () => {
    setBusy(true);
    const res = await fetch("/api/credentials/onepassword", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "scan", text }),
    });
    setHits(((await res.json()) as { hits: typeof hits }).hits ?? []);
    setBusy(false);
  };

  return (
    <Panel title="Leak scanner" subtitle="Paste anything you are about to share — commit, doc, prompt — and check it for key-shaped strings first.">
      <textarea className="textarea w-full" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste text to scan…" />
      <div className="mt-2 flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void scan()}>
          {busy ? <Spinner size={12} /> : <Icon name="ScanSearch" size={13} />} Scan
        </button>
        {hits !== null && (
          <span className={`text-[12.5px] ${hits.length ? "text-[var(--rose,#fb7185)]" : "text-[var(--emerald)]"}`}>
            {hits.length ? `${hits.length} secret-shaped string${hits.length === 1 ? "" : "s"} found` : "Nothing secret-shaped found"}
          </span>
        )}
      </div>
      {!!hits?.length && (
        <ul className="mt-3 space-y-1.5">
          {hits.map((h, i) => (
            <li key={i} className="mono text-[11.5px] text-[var(--fg-dim)]">
              line {h.line} · {h.pattern} · {h.excerpt}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function EnvironmentTab({
  data,
  statusById,
}: {
  data: CredentialsPayload | null;
  statusById: Record<string, ProviderStatus>;
}) {
  if (!data) return <Panel><p className="text-[12.5px] text-[var(--fg-mute)]">Reading…</p></Panel>;
  const withEnv = data.providers.filter((p) => p.envKeys.length);
  return (
    <Panel title="Environment keys" subtitle="Which env vars are set right now — presence only, values stay on the server" padded={false}>
      {withEnv.length ? (
        <ul className="grid gap-px bg-[var(--line)] md:grid-cols-2">
          {withEnv.map((p) => {
            const s = statusById[p.id];
            const viaEnv = s?.source === "env";
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 bg-[var(--bg-card)] px-4 py-2.5">
                <span className="mono min-w-0 flex-1 truncate text-[11.5px] text-[var(--fg-soft)]" title={p.envKeys.join(", ")}>
                  {viaEnv && s?.envKeyUsed ? s.envKeyUsed : p.envKeys[0]}
                </span>
                <StatusPill ready={viaEnv} label={viaEnv ? "set" : s?.present ? `via ${s.source}` : "not set"} />
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon="Variable" title="No env-keyed providers" />
      )}
    </Panel>
  );
}
