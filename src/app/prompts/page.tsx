"use client";

import { useMemo, useState } from "react";
import { ALL_PROMPTS, PROMPT_CATEGORIES } from "@/lib/prompts";
import { Icon, PageHeader, PageShell, Panel, Spinner, Stat } from "@/components/ui";

const ACCENT = "#facc15";

export default function PromptsPage() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const prompts = useMemo(() => {
    const q = query.toLowerCase();
    return ALL_PROMPTS.filter((p) => (!cat || p.category === cat) && (!q || p.text.toLowerCase().includes(q)));
  }, [query, cat]);

  const copy = async (id: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* clipboard blocked — the text is visible to select manually */
    }
  };

  const saveAll = async () => {
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch("/api/prompts", { method: "POST" });
    const json = (await res.json()) as { ok?: boolean; written?: string[]; error?: string };
    setSaving(false);
    setSaveMsg(json.ok ? `Saved ${json.written?.length ?? 0} files into your vault under Prompts/.` : (json.error ?? "Could not save"));
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Studio · Library"
        title="Prompt Library"
        subtitle={`${ALL_PROMPTS.length} battle-tested prompts across ${PROMPT_CATEGORIES.length} categories. Click to copy, or save the whole library into your vault as markdown.`}
        accent={ACCENT}
        icon="ScrollText"
        actions={
          <button className="btn btn-primary" onClick={() => void saveAll()} disabled={saving}>
            {saving ? <Spinner size={13} /> : <Icon name="FolderSync" size={13} />} Save all to vault
          </button>
        }
      />
      {saveMsg && <p className="mb-4 text-[12.5px] text-[var(--fg-dim)]">{saveMsg}</p>}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Prompts" value={ALL_PROMPTS.length} icon="ScrollText" accent={ACCENT} />
        <Stat label="Categories" value={PROMPT_CATEGORIES.length} icon="Tags" accent="var(--violet)" />
        <Stat label="Showing" value={prompts.length} icon="Filter" accent="var(--cyan)" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <button className={`btn !px-2.5 text-[12px] ${cat === null ? "btn-primary" : ""}`} onClick={() => setCat(null)}>
          All
        </button>
        {PROMPT_CATEGORIES.map((c) => (
          <button key={c} className={`btn !px-2.5 text-[12px] ${cat === c ? "btn-primary" : ""}`} onClick={() => setCat(cat === c ? null : c)}>
            {c}
          </button>
        ))}
      </div>

      <input className="input mb-4 w-full max-w-md" placeholder="Search prompts…" value={query} onChange={(e) => setQuery(e.target.value)} />

      <div className="grid gap-3 md:grid-cols-2">
        {prompts.map((p) => (
          <Panel key={p.id} className="panel-hover">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="pill !text-[10px]">{p.category}</span>
              <button className="btn btn-ghost !px-2 !py-1 text-[11.5px]" onClick={() => void copy(p.id, p.text)}>
                <Icon name={copied === p.id ? "Check" : "Copy"} size={11} /> {copied === p.id ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-[12.5px] leading-relaxed text-[var(--fg-soft)]">{p.text}</p>
          </Panel>
        ))}
      </div>
    </PageShell>
  );
}
