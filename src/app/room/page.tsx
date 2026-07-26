"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Play, Sparkles } from "lucide-react";
import { AGENTS, type AgentStatus } from "@/lib/agents";
import { streamNdjson, useBoard, useJson, type StreamEvent } from "@/lib/client";
import AgentAvatar from "@/components/AgentAvatar";
import VoiceButton from "@/components/VoiceButton";
import { EmptyState, PageHeader, PageShell, Panel, Spinner, relTime } from "@/components/ui";

interface AgentsResponse {
  statuses: AgentStatus[];
}
interface RoomRound {
  id: string;
  question: string;
  at: number;
  answers: { agentId: string; text: string }[];
  synthesis: string;
}

export default function RoomPage() {
  const { data } = useJson<AgentsResponse>("/api/agents");
  const { doc, setDoc } = useBoard<{ rounds: RoomRound[] }>("room", { rounds: [] });

  const [question, setQuestion] = useState("");
  const [interim, setInterim] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string[]>([]);
  const [synth, setSynth] = useState("");
  const [synthRunning, setSynthRunning] = useState(false);

  const connected = AGENTS.filter((a) => data?.statuses.find((s) => s.id === a.id)?.connected && a.id !== "fusion");
  const selected = picked.length ? picked : connected.slice(0, 4).map((a) => a.id);
  const composed = interim ? `${question} ${interim}`.trim() : question;

  const ask = useCallback(async () => {
    const q = composed.trim();
    if (!q || running.length) return;
    setAnswers({});
    setSynth("");
    setRunning(selected);

    const collected: Record<string, string> = {};

    await Promise.all(
      selected.map(async (agentId) => {
        let text = "";
        const onEvent = (evt: StreamEvent) => {
          if ((evt.t === "delta" || evt.t === "final") && evt.text) {
            text += evt.text;
            setAnswers((prev) => ({ ...prev, [agentId]: text }));
          } else if (evt.t === "err" && evt.text && !text) {
            setAnswers((prev) => ({ ...prev, [agentId]: `⚠️ ${evt.text}` }));
          }
        };
        try {
          await streamNdjson(
            "/api/run",
            {
              agent: agentId,
              prompt: `${q}\n\nAnswer in under 200 words. Lead with your actual recommendation, then the one reason it could be wrong.`,
              project: "mastermind",
              extract: false,
            },
            onEvent,
          );
        } catch (e) {
          setAnswers((prev) => ({ ...prev, [agentId]: `⚠️ ${e instanceof Error ? e.message : String(e)}` }));
        }
        collected[agentId] = text;
        setRunning((r) => r.filter((id) => id !== agentId));
      }),
    );

    setDoc({
      rounds: [
        {
          id: `round_${Date.now()}`,
          question: q,
          at: Date.now(),
          answers: Object.entries(collected).map(([agentId, text]) => ({ agentId, text })),
          synthesis: "",
        },
        ...(doc.rounds ?? []),
      ].slice(0, 30),
    });
    setQuestion("");
    setInterim("");
  }, [composed, doc.rounds, running.length, selected, setDoc]);

  const synthesise = useCallback(async () => {
    const entries = Object.entries(answers).filter(([, v]) => v.trim());
    if (!entries.length || synthRunning) return;
    setSynthRunning(true);
    setSynth("");

    const transcript = entries
      .map(([id, text]) => `### ${AGENTS.find((a) => a.id === id)?.name ?? id}\n${text}`)
      .join("\n\n");

    let out = "";
    await streamNdjson(
      "/api/run",
      {
        agent: "claude",
        project: "mastermind",
        extract: false,
        prompt: `Several agents answered the same question. Synthesise honestly.

Question: ${doc.rounds?.[0]?.question ?? composed}

${transcript}

Give me: where they agree, where they genuinely disagree (quote the disagreement), who is most likely right and why, and the decision I should make. Do not average the answers into mush — if one is wrong, say so.`,
      },
      (evt) => {
        if ((evt.t === "delta" || evt.t === "final") && evt.text) {
          out += evt.text;
          setSynth(out);
        }
      },
    ).catch(() => {});

    setSynthRunning(false);
    setDoc({
      rounds: (doc.rounds ?? []).map((r, i) => (i === 0 ? { ...r, synthesis: out } : r)),
    });
  }, [answers, composed, doc.rounds, setDoc, synthRunning]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Orchestration"
        icon="MessagesSquare"
        accent="#a855f7"
        title="Agent Mastermind"
        subtitle="Put one question to every connected agent at once, read the answers side by side, then have Claude referee."
      />

      <Panel className="mb-5">
        <textarea
          rows={3}
          value={composed}
          onChange={(e) => {
            setInterim("");
            setQuestion(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void ask();
          }}
          placeholder="Should I ship the dashboard as one app or split the studios out? Argue it properly."
          className="textarea !border-0 !bg-transparent !px-1 focus:!shadow-none"
        />

        <div className="mt-3 border-t border-[var(--line)] pt-3">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {connected.length ? (
              connected.map((a) => {
                const on = selected.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() =>
                      setPicked((p) => {
                        const base = p.length ? p : selected;
                        return base.includes(a.id) ? base.filter((x) => x !== a.id) : [...base, a.id];
                      })
                    }
                    className="pill transition"
                    style={{
                      color: on ? a.accent : "var(--fg-mute)",
                      borderColor: on ? `${a.accent}55` : "var(--line)",
                      background: on ? `${a.accent}14` : "transparent",
                    }}
                  >
                    <AgentAvatar agent={a.id} size={14} />
                    {a.name}
                  </button>
                );
              })
            ) : (
              <span className="text-[12.5px] text-[var(--fg-mute)]">
                No agents connected yet — install one from Setup and they show up here.
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <VoiceButton
              size={38}
              title="Ask out loud"
              onTranscript={(t, o) => {
                if (o.final) {
                  setInterim("");
                  setQuestion((prev) => (prev ? `${prev} ${t}` : t));
                } else {
                  setInterim(t);
                }
              }}
            />
            <button
              onClick={() => void ask()}
              disabled={!composed.trim() || running.length > 0 || !connected.length}
              className="btn btn-primary"
            >
              {running.length ? <Spinner /> : <Play size={14} />}
              {running.length ? `${running.length} still thinking…` : `Ask ${selected.length} agent${selected.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </Panel>

      {Object.keys(answers).length > 0 && (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            {selected.map((id) => {
              const spec = AGENTS.find((a) => a.id === id);
              if (!spec) return null;
              const text = answers[id] ?? "";
              const busy = running.includes(id);
              return (
                <motion.div key={id} layout className="panel p-4">
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <AgentAvatar agent={id} size={26} live={busy} />
                    <span className="text-[13.5px] font-medium">{spec.name}</span>
                    {busy && <Spinner />}
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--fg-soft)]">
                    {text || (busy ? "thinking…" : "no answer")}
                  </p>
                </motion.div>
              );
            })}
          </div>

          <Panel
            title="Synthesis"
            subtitle="Claude reads every answer and calls it"
            actions={
              <button onClick={() => void synthesise()} disabled={synthRunning || running.length > 0} className="btn">
                {synthRunning ? <Spinner /> : <Sparkles size={14} />} Referee
              </button>
            }
          >
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--fg-soft)]">
              {synth || (synthRunning ? "reading the answers…" : "Run the referee once every agent has replied.")}
            </p>
          </Panel>
        </>
      )}

      {!Object.keys(answers).length && (
        <Panel title="Past rounds" padded={false}>
          {doc.rounds?.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {doc.rounds.map((r) => (
                <li key={r.id} className="px-5 py-3">
                  <p className="text-[13px] text-[var(--fg-soft)]">{r.question}</p>
                  <p className="mt-1 text-[11px] text-[var(--fg-mute)]">
                    {r.answers.length} answer{r.answers.length === 1 ? "" : "s"} · {relTime(r.at)}
                    {r.synthesis ? " · refereed" : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="MessagesSquare" title="No rounds yet" body="Ask something worth disagreeing about." />
          )}
        </Panel>
      )}
    </PageShell>
  );
}
