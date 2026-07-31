"use client";

import { useMemo, useState } from "react";
import { useJson } from "@/lib/client";
import { EmptyState, Icon, PageHeader, PageShell, Panel, Stat, relTime } from "@/components/ui";

const ACCENT = "#fbbf24";

interface DocumentInfo {
  name: string;
  ext: string;
  size: number;
  updatedAt: number;
  hidden: boolean;
}
interface Payload {
  dir: string;
  exists: boolean;
  documents: DocumentInfo[];
}

const EXT_ICON: Record<string, string> = {
  pdf: "FileText",
  md: "FileText",
  txt: "FileText",
  csv: "Table",
  json: "Braces",
  png: "Image",
  jpg: "Image",
  jpeg: "Image",
  webp: "Image",
  mp3: "Music",
  wav: "Music",
  mp4: "Clapperboard",
  mov: "Clapperboard",
  zip: "Archive",
};

export default function DocumentsPage() {
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [preview, setPreview] = useState<DocumentInfo | null>(null);
  const { data, refresh } = useJson<Payload>(`/api/documents${showHidden ? "?hidden=1" : ""}`);
  const { data: previewData } = useJson<{ kind: "text"; content: string } | { kind: "binary" }>(
    preview ? `/api/documents?file=${encodeURIComponent(preview.name)}&preview=1` : null,
  );

  const docs = useMemo(() => {
    const q = query.toLowerCase();
    return (data?.documents ?? []).filter((d) => !q || d.name.toLowerCase().includes(q));
  }, [data, query]);

  const setHidden = async (name: string, hidden: boolean) => {
    await fetch("/api/documents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, hidden }),
    });
    void refresh();
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Studio · Files"
        title="Documents"
        subtitle={`A read-only gallery over ${data?.dir ?? "~/Documents/Hermes"}. Hiding a file tucks it out of view — nothing here ever deletes from the source folder.`}
        accent={ACCENT}
        icon="FileText"
        actions={
          <label className="flex items-center gap-2 text-[12px] text-[var(--fg-dim)]">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
            show hidden
          </label>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Documents" value={data ? docs.length : "—"} icon="Files" accent={ACCENT} />
        <Stat
          label="Source folder"
          value={data ? (data.exists ? "Found" : "Absent") : "—"}
          hint={data?.dir}
          icon="FolderOpen"
          accent="var(--cyan)"
        />
        <Stat
          label="Newest"
          value={docs[0] ? relTime(docs[0].updatedAt) : "—"}
          hint={docs[0]?.name}
          icon="Clock"
          accent="var(--violet)"
        />
      </div>

      <Panel padded={false}>
        <div className="border-b border-[var(--line)] px-5 py-3">
          <input className="input w-full max-w-md" placeholder="Search documents…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!data ? (
          <div className="skeleton m-5 h-40" />
        ) : !data.exists ? (
          <EmptyState
            icon="FolderX"
            title="No documents folder yet"
            body={`Expected ${data.dir}. Create it (or set WORKFORCE_DOCUMENTS_DIR) and drop files in — they appear here immediately.`}
          />
        ) : docs.length === 0 ? (
          <EmptyState icon="FileText" title="No documents" body="Files dropped into the folder show up here, newest first." />
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {docs.map((d) => (
              <li key={d.name} className="flex items-center gap-3 px-5 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--line)] text-[var(--fg-mute)]">
                  <Icon name={EXT_ICON[d.ext] ?? "File"} size={14} />
                </span>
                <button className="min-w-0 flex-1 text-left" onClick={() => setPreview(d)}>
                  <span className="block truncate text-[13px] text-[var(--fg-soft)]">{d.name}</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--fg-mute)]">
                    {(d.size / 1024).toFixed(1)} kB · {relTime(d.updatedAt)}
                    {d.hidden ? " · hidden" : ""}
                  </span>
                </button>
                <a
                  href={`/api/documents?file=${encodeURIComponent(d.name)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost !px-2 !py-1 text-[11.5px]"
                >
                  <Icon name="ExternalLink" size={11} /> Open
                </a>
                <button className="btn btn-ghost !px-2 !py-1 text-[11.5px]" onClick={() => void setHidden(d.name, !d.hidden)}>
                  {d.hidden ? "Unhide" : "Hide"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setPreview(null)}>
          <div className="panel max-h-[82vh] w-full max-w-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
              <span className="mono min-w-0 truncate text-[var(--fg-dim)]">{preview.name}</span>
              <button onClick={() => setPreview(null)} className="btn btn-ghost !px-2" aria-label="Close">
                <Icon name="X" size={15} />
              </button>
            </div>
            {previewData?.kind === "text" ? (
              <pre className="scroll max-h-[66vh] overflow-y-auto whitespace-pre-wrap p-5 text-[12.5px] leading-relaxed text-[var(--fg-soft)]">
                {previewData.content}
              </pre>
            ) : /\.(png|jpe?g|webp|gif|svg)$/i.test(preview.name) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/documents?file=${encodeURIComponent(preview.name)}`} alt={preview.name} className="max-h-[66vh] w-full object-contain p-4" />
            ) : (
              <p className="p-6 text-[12.5px] text-[var(--fg-mute)]">
                Binary file — use Open to view it in a new tab.
              </p>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
