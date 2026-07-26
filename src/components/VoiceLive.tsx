"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic, PhoneOff, Radio } from "lucide-react";
import { streamNdjson, type StreamEvent } from "@/lib/client";
import IntegrationBanner, { useIntegration } from "./IntegrationBanner";
import { Panel, Spinner, Tabs } from "./ui";

interface Turn {
  role: "you" | "agent";
  text: string;
  at: number;
}

interface Props {
  agentId: string;
  agentName: string;
  /** Persona text handed to the realtime model as its instructions. */
  instructions?: string;
}

/**
 * Two ways to talk, and the page is clear about which one is running.
 *
 *  · Realtime — speech to speech over WebRTC. Interruptible, sub-second, needs
 *    OPENAI_API_KEY. The browser gets a short-lived client secret, never the key.
 *  · Push-to-talk — the browser's own recognition and speech synthesis wrapped
 *    around whichever agent you have connected. No keys, works offline-ish.
 */
export default function VoiceLive({ agentId, agentName, instructions }: Props) {
  const { connected: realtimeReady } = useIntegration("realtime");
  const [mode, setMode] = useState<"Realtime" | "Push-to-talk">("Push-to-talk");
  const [live, setLive] = useState(false);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const speakingRef = useRef(false);

  useEffect(() => {
    if (realtimeReady) setMode("Realtime");
  }, [realtimeReady]);

  const say = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 4000));
    utterance.rate = 1.02;
    speakingRef.current = true;
    utterance.onend = () => {
      speakingRef.current = false;
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  // ── Realtime (WebRTC) ─────────────────────────────────────────────────────

  const startRealtime = useCallback(async () => {
    setError(null);
    setStatus("minting a client secret…");
    try {
      const res = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions }),
      });
      const json = (await res.json()) as { secret?: string; model?: string; error?: string };
      if (!res.ok || !json.secret) throw new Error(json.error ?? "no client secret returned");

      setStatus("asking for the microphone…");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = media;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (e) => {
        if (!audioRef.current) return;
        audioRef.current.srcObject = e.streams[0];
        void audioRef.current.play().catch(() => {});
      };
      media.getTracks().forEach((track) => pc.addTrack(track, media));

      const channel = pc.createDataChannel("oai-events");
      channel.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data) as { type?: string; transcript?: string; delta?: string };
          if (evt.type?.endsWith("input_audio_transcription.completed") && evt.transcript) {
            setTurns((t) => [...t, { role: "you", text: evt.transcript!, at: Date.now() }]);
          } else if (evt.type?.endsWith("output_audio_transcript.done") && evt.transcript) {
            setTurns((t) => [...t, { role: "agent", text: evt.transcript!, at: Date.now() }]);
          }
        } catch {
          /* non-JSON frame */
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setStatus("connecting…");
      const model = json.model ?? "gpt-realtime";
      // The call endpoint moved between releases; try the current one, then the older query form.
      const endpoints = [
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`,
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      ];
      let answer: string | null = null;
      let lastError = "";
      for (const url of endpoints) {
        const sdpRes = await fetch(url, {
          method: "POST",
          body: offer.sdp,
          headers: { Authorization: `Bearer ${json.secret}`, "Content-Type": "application/sdp" },
        });
        if (sdpRes.ok) {
          answer = await sdpRes.text();
          break;
        }
        lastError = `${sdpRes.status} ${(await sdpRes.text()).slice(0, 200)}`;
      }
      if (!answer) throw new Error(`the realtime endpoint refused the offer: ${lastError}`);

      await pc.setRemoteDescription({ type: "answer", sdp: answer });
      setLive(true);
      setStatus("listening — just talk, and interrupt whenever you like");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
      pcRef.current?.close();
      pcRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
  }, [instructions]);

  // ── Push-to-talk (no keys) ────────────────────────────────────────────────

  const ask = useCallback(
    async (text: string) => {
      setTurns((t) => [...t, { role: "you", text, at: Date.now() }]);
      setThinking(true);
      let reply = "";
      const onEvent = (evt: StreamEvent) => {
        if ((evt.t === "delta" || evt.t === "final") && evt.text) reply += evt.text;
      };
      await streamNdjson(
        "/api/run",
        {
          agent: agentId,
          project: "voice",
          extract: false,
          prompt: `${instructions ? `${instructions}\n\n` : ""}You are being spoken to out loud and your reply will be read aloud. Answer in at most three sentences, plainly, no lists or markdown.\n\n${text}`,
        },
        onEvent,
      ).catch((e) => {
        reply = `I could not reach ${agentName}: ${e instanceof Error ? e.message : String(e)}`;
      });
      setThinking(false);
      const clean = reply.trim() || `${agentName} returned nothing.`;
      setTurns((t) => [...t, { role: "agent", text: clean, at: Date.now() }]);
      say(clean);
    },
    [agentId, agentName, instructions, say],
  );

  const startPushToTalk = useCallback(() => {
    setError(null);
    const w = window as unknown as {
      SpeechRecognition?: new () => never;
      webkitSpeechRecognition?: new () => never;
    };
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as unknown as
      | (new () => {
          continuous: boolean;
          interimResults: boolean;
          lang: string;
          start: () => void;
          stop: () => void;
          abort: () => void;
          onresult: ((e: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } }) => void) | null;
          onerror: ((e: { error?: string }) => void) | null;
          onend: (() => void) | null;
        })
      | undefined;

    if (!Ctor) {
      setError("This browser has no speech recognition. Chrome or Safari will work, or use realtime mode.");
      return;
    }

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result.isFinal) continue;
        const text = result[0].transcript.trim();
        // Ignore what the browser hears while it is the one talking.
        if (text && !speakingRef.current) void ask(text);
      }
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech") setError(`Voice error: ${e.error ?? "unknown"}`);
    };
    rec.onend = () => {
      // Chrome stops after a pause; restart while the session is meant to be live.
      if (recRef.current) {
        try { rec.start(); } catch { /* already restarting */ }
      }
    };

    recRef.current = { stop: () => rec.stop(), abort: () => rec.abort() };
    try {
      rec.start();
      setLive(true);
      setStatus(`listening — talk to ${agentName}`);
    } catch (e) {
      setError(String(e));
    }
  }, [agentName, ask]);

  const hangUp = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    rec?.abort();

    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setLive(false);
    setStatus("idle");
  }, []);

  useEffect(() => () => hangUp(), [hangUp]);

  return (
    <div className="space-y-4">
      <IntegrationBanner id="realtime" />

      <Tabs
        tabs={["Realtime", "Push-to-talk"]}
        active={mode}
        onChange={(t) => {
          if (live) hangUp();
          setMode(t as typeof mode);
        }}
      />

      <Panel
        title={mode === "Realtime" ? "Speech to speech" : "Push-to-talk"}
        subtitle={
          mode === "Realtime"
            ? "Interruptible, low latency, over WebRTC. Needs OPENAI_API_KEY."
            : `Browser recognition in, ${agentName} in the middle, browser speech out. No keys.`
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          {live ? (
            <button onClick={hangUp} className="btn text-rose-200">
              <PhoneOff size={14} /> End
            </button>
          ) : (
            <button
              onClick={() => (mode === "Realtime" ? void startRealtime() : startPushToTalk())}
              disabled={mode === "Realtime" && !realtimeReady}
              className="btn btn-primary"
            >
              {mode === "Realtime" ? <Radio size={14} /> : <Mic size={14} />} Start talking
            </button>
          )}

          <span className="flex items-center gap-2 text-[12.5px] text-[var(--fg-dim)]">
            {live && (
              <motion.span
                animate={{ opacity: [1, 0.35, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_10px_#fb7185]"
              />
            )}
            {thinking && <Spinner />}
            {status}
          </span>
        </div>

        {error && <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/6 px-3 py-2 text-[12px] text-rose-200">{error}</p>}

        <audio ref={audioRef} autoPlay className="hidden" />
      </Panel>

      {turns.length > 0 && (
        <Panel title="Transcript" subtitle="Kept in this tab only" padded={false}>
          <ul className="divide-y divide-[var(--line)]">
            {turns.map((t, i) => (
              <li key={`${t.at}-${i}`} className="px-5 py-3">
                <span className="eyebrow">{t.role === "you" ? "You" : agentName}</span>
                <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--fg-soft)]">{t.text}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
