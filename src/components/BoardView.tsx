"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Sparkles, Trash2, X } from "lucide-react";
import { AGENTS } from "@/lib/agents";
import { streamNdjson, useBoard, type StreamEvent } from "@/lib/client";
import VoiceButton from "./VoiceButton";
import { EmptyState, Panel, Spinner, relTime } from "./ui";

export interface Card {
  id: string;
  text: string;
  column: string;
  at: number;
  notes?: string;
  agent?: string;
  result?: string;
  files?: string[];
}

interface Props {
  boardName: string;
  columns: string[];
  /** When set, each card gets a "run" action that hands it to an agent. */
  dispatch?: {
    project: string;
    label: string;
    buildPrompt: (card: Card, column: string) => string;
  };
  placeholder: string;
  accent?: string;
}

/**
 * One board, drag-and-drop between columns, persisted locally. Used by Kanban,
 * Agent Kanban and Pipeline — the only difference between them is the column
 * set and whether cards can be handed to an agent.
 */
export default function BoardView({ boardName, columns, dispatch, placeholder, accent = "var(--gold)" }: Props) {
  const { doc, setDoc, loaded } = useBoard<{ cards: Card[] }>(boardName, { cards: [] });
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [column, setColumn] = useState(columns[0]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [open, setOpen] = useState<Card | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const [agent, setAgent] = useState("claude");

  const cards = doc.cards ?? [];
  const composed = interim ? `${text} ${interim}`.trim() : text;

  const add = useCallback(() => {
    const value = composed.trim();
    if (!value) return;
    setDoc({
      cards: [{ id: `c_${Date.now()}${Math.random().toString(36).slice(2, 5)}`, text: value, column, at: Date.now() }, ...cards],
    });
    setText("");
    setInterim("");
  }, [cards, column, composed, setDoc]);

  const move = useCallback(
    (id: string, to: string) => {
      setDoc({ cards: cards.map((c) => (c.id === id ? { ...c, column: to } : c)) });
    },
    [cards, setDoc],
  );

  const remove = useCallback(
    (id: string) => {
      setDoc({ cards: cards.filter((c) => c.id !== id) });
      setOpen(null);
    },
    [cards, setDoc],
  );

  const runCard = useCallback(
    async (card: Card) => {
      if (!dispatch || running) return;
      setRunning(card.id);
      setLive("");
      let out = "";
      let files: string[] = [];

      const onEvent = (evt: StreamEvent) => {
        if ((evt.t === "delta" || evt.t === "final") && evt.text) {
          out += evt.text;
          setLive(out);
        } else if (evt.t === "files") {
          files = evt.files ?? [];
        }
      };

      try {
        await streamNdjson(
          "/api/run",
          { agent, project: dispatch.project, prompt: dispatch.buildPrompt(card, card.column) },
          onEvent,
        );
      } catch (e) {
        out += `\n⚠️ ${e instanceof Error ? e.message : String(e)}`;
      }

      const next = cards.map((c) =>
        c.id === card.id
          ? {
              ...c,
              agent,
              result: out.slice(0, 40_000),
              files,
              column: columns[Math.min(columns.length - 1, columns.indexOf(c.column) + 1)],
            }
          : c,
      );
      setDoc({ cards: next });
      setOpen(next.find((c) => c.id === card.id) ?? null);
      setRunning(null);
    },
    [agent, cards, columns, dispatch, running, setDoc],
  );

  return (
    <>
      <Panel className="mb-5">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="card-text" className="eyebrow mb-1.5 block">
              New card
            </label>
            <input
              id="card-text"
              value={composed}
              onChange={(e) => {
                setInterim("");
                setText(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              placeholder={placeholder}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="card-col" className="eyebrow mb-1.5 block">
              Column
            </label>
            <select id="card-col" value={column} onChange={(e) => setColumn(e.target.value)} className="input !w-auto">
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {dispatch && (
            <div>
              <label htmlFor="card-agent" className="eyebrow mb-1.5 block">
                Agent
              </label>
              <select id="card-agent" value={agent} onChange={(e) => setAgent(e.target.value)} className="input !w-auto">
                {AGENTS.filter((a) => a.buildsFiles).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <VoiceButton
            size={40}
            onTranscript={(t, o) => {
              if (o.final) {
                setInterim("");
                setText((prev) => (prev ? `${prev} ${t}` : t));
              } else {
                setInterim(t);
              }
            }}
          />
          <button onClick={add} disabled={!composed.trim()} className="btn btn-primary h-[40px]">
            <Plus size={15} /> Add
          </button>
        </div>
      </Panel>

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))` }}>
        {columns.map((col) => {
          const inCol = cards.filter((c) => c.column === col);
          return (
            <div
              key={col}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col);
              }}
              onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
              onDrop={() => {
                if (dragId) move(dragId, col);
                setDragId(null);
                setOverCol(null);
              }}
              className="panel min-h-[320px] p-3 transition"
              style={{ borderColor: overCol === col ? accent : undefined }}
            >
              <div className="mb-2.5 flex items-center justify-between px-1">
                <span className="eyebrow">{col}</span>
                <span className="text-[11px] text-[var(--fg-mute)]">{inCol.length}</span>
              </div>

              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {inCol.map((card) => (
                    <motion.div
                      key={card.id}
                      layout
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      draggable
                      onDragStart={() => setDragId(card.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setOpen(card)}
                      className="panel-flat cursor-grab p-3 active:cursor-grabbing"
                      style={{ opacity: dragId === card.id ? 0.45 : 1 }}
                    >
                      <p className="text-[13px] leading-snug text-[var(--fg-soft)]">{card.text}</p>
                      <div className="mt-2 flex items-center justify-between text-[10.5px] text-[var(--fg-mute)]">
                        <span>{relTime(card.at)}</span>
                        {card.result && <span className="pill !py-0 !text-[9.5px]">{card.agent} ran it</span>}
                        {running === card.id && <Spinner size={11} />}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {!inCol.length && loaded && (
                  <p className="px-1 py-6 text-center text-[11.5px] text-[var(--fg-mute)]">Drop a card here</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!cards.length && loaded && (
        <div className="mt-4">
          <Panel>
            <EmptyState
              icon="Columns3"
              title="Board is empty"
              body={dispatch ? "Add a card, then hand it to an agent to work." : "Add a card above to start."}
            />
          </Panel>
        </div>
      )}

      {/* Card detail */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOpen(null)}>
          <div className="panel max-h-[82vh] w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-[14px] font-medium">{open.text}</p>
                <p className="mt-0.5 text-[11px] text-[var(--fg-mute)]">
                  {open.column} · {relTime(open.at)}
                </p>
              </div>
              <button onClick={() => setOpen(null)} className="btn btn-ghost !px-2" aria-label="Close">
                <X size={15} />
              </button>
            </div>

            <div className="scroll max-h-[58vh] overflow-y-auto p-5">
              {dispatch && (
                <div className="mb-4 flex items-center gap-2">
                  <button onClick={() => void runCard(open)} disabled={Boolean(running)} className="btn btn-primary">
                    {running === open.id ? <Spinner /> : <Sparkles size={14} />} {dispatch.label}
                  </button>
                  <select value={agent} onChange={(e) => setAgent(e.target.value)} className="input !w-auto py-1.5 text-[12.5px]">
                    {AGENTS.filter((a) => a.buildsFiles).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(running === open.id ? live : open.result) && (
                <pre className="mono whitespace-pre-wrap leading-relaxed text-[var(--fg-soft)]">
                  {running === open.id ? live : open.result}
                </pre>
              )}

              {!!open.files?.length && (
                <ul className="mt-4 space-y-1.5">
                  {open.files.map((f) => (
                    <li key={f}>
                      <a
                        href={`/api/preview/${dispatch?.project ?? boardName}/${f}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mono text-[12px] text-[var(--gold)] underline decoration-dotted"
                      >
                        {f}
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              {!open.result && running !== open.id && (
                <p className="text-[13px] text-[var(--fg-mute)]">
                  {dispatch ? "Nothing has run on this card yet." : "Drag the card between columns to track it."}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[var(--line)] px-5 py-3">
              <div className="flex flex-wrap gap-1.5">
                {columns.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      move(open.id, c);
                      setOpen({ ...open, column: c });
                    }}
                    className="pill transition"
                    style={{ color: c === open.column ? accent : undefined, borderColor: c === open.column ? accent : undefined }}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <button onClick={() => remove(open.id)} className="btn btn-ghost !px-2 text-rose-300">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
