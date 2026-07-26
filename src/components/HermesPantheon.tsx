"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Save, Trash2, X } from "lucide-react";
import { useJson } from "@/lib/client";
import type { HermesOverview, Persona } from "@/lib/hermes";
import VoiceButton from "./VoiceButton";
import { EmptyState, Panel, Spinner, relTime } from "./ui";

interface Response {
  personas: Persona[];
  overview: HermesOverview;
}

const BLANK = { slug: "", name: "", role: "", model: "", temperature: "", systemPrompt: "", tags: "" };

/** Create, edit and retire the personas Hermes loads from disk. */
export default function HermesPantheon() {
  const { data, refresh } = useJson<Response>("/api/hermes/personas");
  const [editing, setEditing] = useState<typeof BLANK | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const personas = data?.personas ?? [];
  const home = data?.overview.home;

  useEffect(() => {
    if (error) setBusy(false);
  }, [error]);

  const open = useCallback((p?: Persona) => {
    setError(null);
    setEditing(
      p
        ? {
            slug: p.slug,
            name: p.name,
            role: p.role,
            model: p.model,
            temperature: p.temperature === null ? "" : String(p.temperature),
            systemPrompt: p.systemPrompt,
            tags: p.tags.join(", "),
          }
        : { ...BLANK },
    );
  }, []);

  const save = useCallback(async () => {
    if (!editing?.name.trim()) {
      setError("a persona needs a name");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/hermes/personas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: editing.slug || undefined,
        name: editing.name,
        role: editing.role,
        model: editing.model,
        temperature: editing.temperature === "" ? null : Number(editing.temperature),
        systemPrompt: editing.systemPrompt,
        tags: editing.tags.split(",").map((t) => t.trim()).filter(Boolean),
      }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res?.ok) {
      setError(json.error ?? "could not save");
      return;
    }
    setEditing(null);
    void refresh();
  }, [editing, refresh]);

  const remove = useCallback(
    async (slug: string) => {
      await fetch(`/api/hermes/personas?slug=${encodeURIComponent(slug)}`, { method: "DELETE" }).catch(() => {});
      setEditing(null);
      void refresh();
    },
    [refresh],
  );

  return (
    <div className="space-y-4">
      <Panel
        title="Pantheon"
        subtitle={home ? `${home}/pantheon/personas` : "Hermes home not found"}
        actions={
          <button onClick={() => open()} className="btn btn-primary !py-1.5 text-[12.5px]">
            <Plus size={14} /> New persona
          </button>
        }
        padded={false}
      >
        {personas.length ? (
          <ul className="divide-y divide-[var(--line)]">
            <AnimatePresence initial={false}>
              {personas.map((p) => (
                <motion.li key={p.slug} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <button onClick={() => open(p)} className="w-full px-5 py-3.5 text-left transition hover:bg-[rgba(244,239,230,0.04)]">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13.5px] font-medium">{p.name}</span>
                      <span className="text-[11px] text-[var(--fg-mute)]">{p.updatedAt ? relTime(p.updatedAt) : "unreadable"}</span>
                    </div>
                    {p.role && <p className="mt-0.5 text-[12.5px] text-[var(--fg-dim)]">{p.role}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {p.model && <span className="pill !py-0.5 !text-[10px]">{p.model}</span>}
                      {p.temperature !== null && <span className="pill !py-0.5 !text-[10px]">temp {p.temperature}</span>}
                      {p.tags.map((t) => (
                        <span key={t} className="pill !py-0.5 !text-[10px]">
                          {t}
                        </span>
                      ))}
                    </div>
                    {p.systemPrompt && (
                      <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-[var(--fg-mute)]">{p.systemPrompt}</p>
                    )}
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <EmptyState
            icon="Users"
            title="No personas found"
            body={
              data?.overview.exists
                ? "Hermes is installed but its pantheon folder is empty. Create the first persona above."
                : "No Hermes home on this machine yet. You can still write personas here — they land in ~/.hermes/pantheon/personas ready for when it is installed."
            }
          />
        )}
      </Panel>

      <p className="text-[11.5px] leading-relaxed text-[var(--fg-mute)]">
        Saving writes YAML into the Hermes pantheon folder and keeps a <span className="mono">.bak</span> of the previous
        version. Deleting renames the file out of the way rather than destroying it, and any keys this editor does not model
        are preserved exactly as they were.
      </p>

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="panel max-h-[86vh] w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
              <h2 className="text-[14px] font-semibold">{editing.slug ? `Edit ${editing.slug}` : "New persona"}</h2>
              <button onClick={() => setEditing(null)} className="btn btn-ghost !px-2" aria-label="Close">
                <X size={15} />
              </button>
            </div>

            <div className="scroll max-h-[62vh] space-y-3 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="p-name" className="eyebrow mb-1.5 block">
                    Name *
                  </label>
                  <input id="p-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="input py-2 text-[13px]" />
                </div>
                <div>
                  <label htmlFor="p-role" className="eyebrow mb-1.5 block">
                    Role
                  </label>
                  <input id="p-role" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })} placeholder="Handles inbound and triage" className="input py-2 text-[13px]" />
                </div>
                <div>
                  <label htmlFor="p-model" className="eyebrow mb-1.5 block">
                    Model
                  </label>
                  <input id="p-model" value={editing.model} onChange={(e) => setEditing({ ...editing, model: e.target.value })} placeholder="leave blank for the Hermes default" className="input py-2 text-[13px]" />
                </div>
                <div>
                  <label htmlFor="p-temp" className="eyebrow mb-1.5 block">
                    Temperature
                  </label>
                  <input id="p-temp" value={editing.temperature} onChange={(e) => setEditing({ ...editing, temperature: e.target.value })} placeholder="0.7" className="input py-2 text-[13px]" />
                </div>
              </div>

              <div>
                <label htmlFor="p-tags" className="eyebrow mb-1.5 block">
                  Tags
                </label>
                <input id="p-tags" value={editing.tags} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} placeholder="ops, outreach" className="input py-2 text-[13px]" />
              </div>

              <div>
                <label htmlFor="p-sys" className="eyebrow mb-1.5 block">
                  System prompt
                </label>
                <div className="flex items-end gap-2">
                  <textarea
                    id="p-sys"
                    rows={8}
                    value={editing.systemPrompt}
                    onChange={(e) => setEditing({ ...editing, systemPrompt: e.target.value })}
                    placeholder="You are… Speak plainly. Refuse to guess at numbers."
                    className="textarea py-2 text-[13px]"
                  />
                  <VoiceButton size={38} onTranscript={(t, o) => o.final && setEditing((cur) => (cur ? { ...cur, systemPrompt: `${cur.systemPrompt} ${t}`.trim() } : cur))} />
                </div>
              </div>

              {error && <p className="rounded-lg border border-rose-500/25 bg-rose-500/6 px-3 py-2 text-[12px] text-rose-200">{error}</p>}
            </div>

            <div className="flex items-center justify-between border-t border-[var(--line)] px-5 py-3">
              {editing.slug ? (
                <button onClick={() => void remove(editing.slug)} className="btn btn-ghost !px-2 text-rose-300">
                  <Trash2 size={14} /> Retire
                </button>
              ) : (
                <span />
              )}
              <button onClick={() => void save()} disabled={busy} className="btn btn-primary">
                {busy ? <Spinner /> : <Save size={14} />} Save persona
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
