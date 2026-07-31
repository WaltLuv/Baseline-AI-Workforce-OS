"use client";

/**
 * The one-box orchestrator: describe the mission, watch the lead integrator
 * plan it, run each Agency specialist on its assigned harness, and integrate.
 * Used by /missions and by the Orchestrate tab on the Oh My Pi agent page.
 */

import { useRef, useState } from "react";
import { streamNdjson, useJson, type StreamEvent } from "@/lib/client";
import AgentAvatar from "@/components/AgentAvatar";
import { EmptyState, Icon, Panel, Spinner, StatusPill, alpha, relTime } from "@/components/ui";

const ACCENT = "#a78bfa";

interface PlanStep {
  specialist: string;
  specialistName: string;
  division: string;
  harness: string;
  task: string;
  reassignedFrom: string | null;
}
interface StepLive {
  state: "pending" | "running" | "done" | "failed" | "empty";
  text: string;
}
interface MissionRecord {
  id: string;
  goal: string;
  lead: string;
  leadStandIn: boolean;
  createdAt: number;
  status: string;
  steps: { specialistName: string; division: string; harness: string; task: string; output?: string; ok?: boolean }[];
  final: string;
  error?: string;
}

const EXAMPLES = [
  "Write a landing page hero + pricing section copy for my AI workforce dashboard, then review it like a brutal editor.",
  "Audit this idea: a paid community for agency owners learning AI automation. Market take, positioning, and a launch plan.",
  "Design a cold-outreach sequence for technical founders, then stress-test it as a skeptical recipient.",
];

export default function MissionRunner({ compact = false }: { compact?: boolean }) {
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [lead, setLead] = useState<{ name: string; id: string; standIn: boolean; detail: string } | null>(null);
  const [phase, setPhase] = useState<string>("");
  const [plan, setPlan] = useState<PlanStep[]>([]);
  const [live, setLive] = useState<Record<number, StepLive>>({});
  const [planText, setPlanText] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { data: history, refresh: refreshHistory } = useJson<{ missions: MissionRecord[] }>("/api/missions");
  const [openMission, setOpenMission] = useState<MissionRecord | null>(null);

  const run = async () => {
    if (!goal.trim() || running) return;
    setRunning(true);
    setLead(null);
    setPhase("starting");
    setPlan([]);
    setLive({});
    setPlanText("");
    setNotes([]);
    setFinalText("");
    setError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamNdjson(
        "/api/missions",
        { goal: goal.trim() },
        (raw: StreamEvent) => {
          const evt = raw as unknown as Record<string, unknown>;
          const t = String(evt.t);
          if (t === "mission-lead") {
            setLead({
              name: String(evt.leadName),
              id: String(evt.lead),
              standIn: Boolean(evt.standIn),
              detail: String(evt.detail),
            });
          } else if (t === "mission-phase") {
            setPhase(String(evt.phase));
          } else if (t === "mission-plan") {
            const steps = evt.steps as PlanStep[];
            setPlan(steps);
            setPhase("running");
            setLive(Object.fromEntries(steps.map((_, i) => [i, { state: "pending", text: "" }])));
          } else if (t === "mission-step") {
            const i = Number(evt.index);
            setLive((p) => ({ ...p, [i]: { state: String(evt.state) as StepLive["state"], text: p[i]?.text ?? "" } }));
          } else if (t === "mission-delta") {
            const tag = String(evt.tag);
            const text = String(evt.text ?? "");
            if (tag === "plan") setPlanText((p) => (p + text).slice(-600));
            else if (tag === "integrate") setFinalText((p) => p + text);
            else if (tag.startsWith("step-")) {
              const i = Number(tag.slice(5));
              setLive((p) => ({ ...p, [i]: { state: p[i]?.state ?? "running", text: (p[i]?.text ?? "") + text } }));
            }
          } else if (t === "mission-note") {
            setNotes((n) => [...n, String(evt.text)]);
          } else if (t === "mission-final") {
            setFinalText(String(evt.text ?? ""));
            setPhase("done");
          } else if (t === "err" && evt.text) {
            setError(String(evt.text));
          }
        },
        ac.signal,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setRunning(false);
    void refreshHistory();
  };

  return (
    <div className="space-y-4">
      {/* The one box */}
      <Panel>
        <div className="flex items-start gap-3">
          <span className="mt-1 hidden sm:block">
            <AgentAvatar agent="ohmypi" size={38} />
          </span>
          <div className="min-w-0 flex-1">
            <textarea
              className="textarea w-full"
              rows={compact ? 3 : 4}
              placeholder="Describe the mission. The lead integrator picks the specialists, assigns each to the best connected harness, runs them, and hands you one integrated result."
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button className="btn btn-primary" onClick={() => void run()} disabled={running || !goal.trim()}>
                {running ? <Spinner size={13} /> : <Icon name="Rocket" size={13} />} {running ? "Mission running…" : "Run mission"}
              </button>
              {running && (
                <button className="btn" onClick={() => abortRef.current?.abort()}>
                  Stop
                </button>
              )}
              {!running &&
                !compact &&
                EXAMPLES.map((e) => (
                  <button key={e} className="btn btn-ghost !px-2 !py-1 text-[11px]" onClick={() => setGoal(e)}>
                    {e.slice(0, 46)}…
                  </button>
                ))}
            </div>
          </div>
        </div>
      </Panel>

      {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/8 px-3.5 py-2.5 text-[12.5px] text-rose-200">{error}</p>}

      {/* Lead + planning */}
      {lead && (
        <Panel padded={false}>
          <div className="flex items-center gap-3 px-5 py-3">
            <AgentAvatar agent={lead.id} size={30} live={running && phase === "planning"} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">
                Lead integrator: {lead.name}
                {lead.standIn ? " (standing in for Oh My Pi)" : ""}
              </span>
              <span className="block text-[11.5px] text-[var(--fg-mute)]">{lead.detail}</span>
            </span>
            {phase === "planning" && (
              <span className="flex items-center gap-2 text-[12px] text-[var(--fg-dim)]">
                <Spinner size={12} /> picking the team…
              </span>
            )}
          </div>
          {phase === "planning" && planText && (
            <pre className="mono border-t border-[var(--line)] px-5 py-2.5 text-[10.5px] text-[var(--fg-mute)]">{planText.slice(-260)}</pre>
          )}
        </Panel>
      )}

      {notes.map((n, i) => (
        <p key={i} className="text-[11.5px] text-amber-200/80">
          <Icon name="Info" size={11} className="mr-1 inline" />
          {n}
        </p>
      ))}

      {/* The team + live steps */}
      {plan.length > 0 && (
        <div className="space-y-3">
          {plan.map((s, i) => {
            const st = live[i] ?? { state: "pending", text: "" };
            return (
              <Panel key={i} padded={false}>
                <div className="flex items-center gap-3 px-5 py-3">
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-[13px]"
                    style={{ borderColor: alpha(ACCENT, 28), background: alpha(ACCENT, 9) }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-medium">{s.specialistName}</span>
                      <span className="pill !text-[10px]">{s.division}</span>
                      <span className="flex items-center gap-1.5 text-[11px] text-[var(--fg-dim)]">
                        on <AgentAvatar agent={s.harness} size={16} /> {s.harness}
                        {s.reassignedFrom ? ` (reassigned from ${s.reassignedFrom})` : ""}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-[var(--fg-mute)]" title={s.task}>
                      {s.task}
                    </span>
                  </span>
                  {st.state === "running" ? (
                    <Spinner size={14} />
                  ) : (
                    <StatusPill
                      ready={st.state === "done"}
                      label={st.state === "pending" ? "Queued" : st.state === "done" ? "Done" : st.state === "failed" ? "Failed" : st.state}
                    />
                  )}
                </div>
                {st.text && (
                  <pre
                    className={`scroll whitespace-pre-wrap border-t border-[var(--line)] px-5 py-3 text-[12px] leading-relaxed text-[var(--fg-dim)] ${st.state === "running" ? "max-h-40" : "max-h-72"} overflow-y-auto`}
                  >
                    {st.state === "running" ? st.text.slice(-800) : st.text}
                  </pre>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      {/* Integrated result */}
      {(phase === "integrating" || finalText) && plan.length > 0 && (
        <Panel
          title="Integrated result"
          subtitle={phase === "integrating" ? "the lead is weaving the outputs together…" : "one deliverable, assembled by the lead from every specialist's work"}
        >
          {finalText ? (
            <pre className="scroll max-h-[560px] overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--fg-soft)]">{finalText}</pre>
          ) : (
            <p className="flex items-center gap-2 text-[12.5px] text-[var(--fg-mute)]">
              <Spinner size={12} /> integrating…
            </p>
          )}
        </Panel>
      )}

      {/* History */}
      {!compact && (
        <Panel title="Past missions" padded={false}>
          {history?.missions.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {history.missions.map((m) => (
                <li key={m.id}>
                  <button className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-[rgba(244,239,230,0.04)]" onClick={() => setOpenMission(m)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-[var(--fg-soft)]">{m.goal}</span>
                      <span className="mt-0.5 block text-[11px] text-[var(--fg-mute)]">
                        {m.steps.map((s) => s.specialistName).join(" · ") || "no team"} · lead {m.lead}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-[var(--fg-mute)]">{relTime(m.createdAt)}</span>
                    <StatusPill ready={m.status === "done"} label={m.status} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="Rocket" title="No missions yet" body="Every mission is saved here, on this machine." />
          )}
        </Panel>
      )}

      {openMission && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOpenMission(null)}>
          <div className="panel max-h-[84vh] w-full max-w-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
              <span className="min-w-0 truncate text-[13px] font-medium">{openMission.goal}</span>
              <button onClick={() => setOpenMission(null)} className="btn btn-ghost !px-2" aria-label="Close">
                <Icon name="X" size={15} />
              </button>
            </div>
            <div className="scroll max-h-[70vh] space-y-4 overflow-y-auto p-5">
              {openMission.steps.map((s, i) => (
                <div key={i}>
                  <p className="mb-1 text-[12px] font-medium text-[var(--fg-dim)]">
                    {i + 1}. {s.specialistName} <span className="text-[var(--fg-mute)]">({s.division} · on {s.harness})</span>
                  </p>
                  <pre className="whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.5)] p-3 text-[12px] leading-relaxed text-[var(--fg-dim)]">
                    {s.output ?? "(no output)"}
                  </pre>
                </div>
              ))}
              {openMission.final && (
                <div>
                  <p className="mb-1 text-[12px] font-medium text-[var(--fg-soft)]">Integrated result</p>
                  <pre className="whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.5)] p-3 text-[12.5px] leading-relaxed text-[var(--fg-soft)]">
                    {openMission.final}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
