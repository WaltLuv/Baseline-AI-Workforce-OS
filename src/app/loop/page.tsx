"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Square } from "lucide-react";
import { AGENTS } from "@/lib/agents";
import { streamNdjson, useBoard, type StreamEvent } from "@/lib/client";
import VoiceButton from "@/components/VoiceButton";
import { EmptyState, PageHeader, PageShell, Panel, Spinner, relTime } from "@/components/ui";

interface Round {
  n: number;
  text: string;
  at: number;
}
interface LoopRun {
  id: string;
  goal: string;
  doneWhen: string;
  agent: string;
  rounds: Round[];
  at: number;
  finished: "done" | "max-rounds" | "stopped";
}

export default function LoopPage() {
  const { doc, setDoc } = useBoard<{ runs: LoopRun[] }>("loop", { runs: [] });
  const [goal, setGoal] = useState("");
  const [interim, setInterim] = useState("");
  const [doneWhen, setDoneWhen] = useState("there is nothing left worth fixing");
  const [maxRounds, setMaxRounds] = useState(4);
  const [agent, setAgent] = useState("claude");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [busy, setBusy] = useState(false);
  const stopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const composed = interim ? `${goal} ${interim}`.trim() : goal;

  const start = useCallback(async () => {
    const g = composed.trim();
    if (!g || busy) return;
    setBusy(true);
    setRounds([]);
    stopRef.current = false;

    const collected: Round[] = [];
    let outcome: LoopRun["finished"] = "max-rounds";

    for (let n = 1; n <= maxRounds; n++) {
      if (stopRef.current) {
        outcome = "stopped";
        break;
      }

      const prior = collected.map((r) => `--- round ${r.n} ---\n${r.text}`).join("\n\n").slice(-9000);
      const prompt =
        n === 1
          ? `${g}

Work the task now. When you are finished with this pass, end your reply with a line that is exactly:
STATUS: DONE   (if ${doneWhen})
or
STATUS: CONTINUE   (with a one-line note on what is left)`
          : `You are on round ${n} of a loop working the same goal.

Goal: ${g}

What happened in earlier rounds:
${prior}

Continue the work — fix what is still wrong, do not restate what is already done. End with the same STATUS line as before.`;

      let text = "";
      const controller = new AbortController();
      abortRef.current = controller;

      const onEvent = (evt: StreamEvent) => {
        if ((evt.t === "delta" || evt.t === "final") && evt.text) {
          text += evt.text;
          setRounds([...collected, { n, text, at: Date.now() }]);
        } else if (evt.t === "err" && evt.text) {
          text += `\n⚠️ ${evt.text}`;
        }
      };

      try {
        await streamNdjson("/api/run", { agent, project: "loop", prompt }, onEvent, controller.signal);
      } catch (e) {
        if (!controller.signal.aborted) text += `\n⚠️ ${e instanceof Error ? e.message : String(e)}`;
      }

      collected.push({ n, text, at: Date.now() });
      setRounds([...collected]);

      if (/STATUS:\s*DONE/i.test(text)) {
        outcome = "done";
        break;
      }
      if (stopRef.current) {
        outcome = "stopped";
        break;
      }
    }

    setDoc({
      runs: [
        { id: `loop_${Date.now()}`, goal: g, doneWhen, agent, rounds: collected, at: Date.now(), finished: outcome },
        ...(doc.runs ?? []),
      ].slice(0, 25),
    });
    setBusy(false);
    abortRef.current = null;
  }, [agent, busy, composed, doc.runs, doneWhen, maxRounds, setDoc]);

  const stop = useCallback(() => {
    stopRef.current = true;
    abortRef.current?.abort();
  }, []);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Orchestration"
        icon="Repeat"
        accent="#2dd4bf"
        title="Loop"
        subtitle="Run the same goal over and over until the agent says it is done — or until the round cap stops it. Every round is kept."
      />

      <Panel className="mb-5">
        <textarea
          rows={3}
          value={composed}
          onChange={(e) => {
            setInterim("");
            setGoal(e.target.value);
          }}
          placeholder="Harden the chat stream parser: find edge cases, fix them, and re-check your own fix…"
          className="textarea !border-0 !bg-transparent !px-1 focus:!shadow-none"
        />

        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-[var(--line)] pt-3">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="done-when" className="eyebrow mb-1.5 block">
              Done when
            </label>
            <input id="done-when" value={doneWhen} onChange={(e) => setDoneWhen(e.target.value)} className="input py-1.5 text-[12.5px]" />
          </div>
          <div>
            <label htmlFor="max-rounds" className="eyebrow mb-1.5 block">
              Max rounds
            </label>
            <select
              id="max-rounds"
              value={maxRounds}
              onChange={(e) => setMaxRounds(Number(e.target.value))}
              className="input !w-auto py-1.5 text-[12.5px]"
            >
              {[2, 3, 4, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="loop-agent" className="eyebrow mb-1.5 block">
              Agent
            </label>
            <select id="loop-agent" value={agent} onChange={(e) => setAgent(e.target.value)} className="input !w-auto py-1.5 text-[12.5px]">
              {AGENTS.filter((a) => a.buildsFiles).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <VoiceButton
            size={38}
            onTranscript={(t, o) => {
              if (o.final) {
                setInterim("");
                setGoal((prev) => (prev ? `${prev} ${t}` : t));
              } else {
                setInterim(t);
              }
            }}
          />
          {busy ? (
            <button onClick={stop} className="btn h-[38px] text-rose-200">
              <Square size={13} /> Stop after this round
            </button>
          ) : (
            <button onClick={() => void start()} disabled={!composed.trim()} className="btn btn-primary h-[38px]">
              <Play size={14} /> Start loop
            </button>
          )}
        </div>
        <p className="mt-3 text-[11.5px] text-[var(--fg-mute)]">
          The loop stops early only when the agent writes <span className="mono">STATUS: DONE</span>. It never runs past the cap.
        </p>
      </Panel>

      {rounds.length > 0 && (
        <div className="mb-5 space-y-3">
          {rounds.map((r) => (
            <motion.div key={r.n} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <Panel
                title={`Round ${r.n}`}
                subtitle={/STATUS:\s*DONE/i.test(r.text) ? "agent called it done" : busy && r === rounds[rounds.length - 1] ? "running…" : undefined}
                actions={busy && r === rounds[rounds.length - 1] ? <Spinner /> : undefined}
              >
                <pre className="scroll mono max-h-[320px] overflow-y-auto whitespace-pre-wrap leading-relaxed text-[var(--fg-soft)]">
                  {r.text}
                </pre>
              </Panel>
            </motion.div>
          ))}
        </div>
      )}

      <Panel title="Past loops" padded={false}>
        {doc.runs?.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {doc.runs.map((r) => (
              <li key={r.id} className="px-5 py-3">
                <p className="text-[13px] text-[var(--fg-soft)]">{r.goal}</p>
                <p className="mt-1 text-[11px] text-[var(--fg-mute)]">
                  {r.rounds.length} round{r.rounds.length === 1 ? "" : "s"} · {r.agent} · ended: {r.finished} · {relTime(r.at)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="Repeat" title="No loops yet" body="Good for cleanup passes, test hardening and edit rounds." />
        )}
      </Panel>
    </PageShell>
  );
}
