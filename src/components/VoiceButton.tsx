"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff } from "lucide-react";

/**
 * Push-to-talk using the browser's own speech recognition. No API keys, no
 * audio leaves the page beyond whatever the browser itself does for
 * recognition. Chrome and Safari support it; everywhere else the button says so
 * instead of pretending.
 */

type Recognition = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

interface SpeechResultEvent {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: { isFinal: boolean; 0: { transcript: string } };
  };
}

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface Props {
  /** Called with interim text while speaking, and the final text when done. */
  onTranscript: (text: string, opts: { final: boolean }) => void;
  size?: number;
  className?: string;
  title?: string;
}

export default function VoiceButton({ onTranscript, size = 38, className = "", title }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");

  useEffect(() => {
    setSupported(Boolean(recognitionCtor()));
    return () => {
      try { recRef.current?.abort(); } catch { /* not started */ }
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setError("This browser has no speech recognition. Chrome or Safari will work.");
      return;
    }
    setError(null);
    finalRef.current = "";
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";

    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) final += text;
        else interim += text;
      }
      if (final) {
        finalRef.current += final;
        onTranscript(final.trim(), { final: true });
      } else if (interim) {
        onTranscript(interim.trim(), { final: false });
      }
    };
    rec.onerror = (e) => {
      const code = e.error ?? "error";
      setError(
        code === "not-allowed"
          ? "Microphone blocked — allow it for this site and try again."
          : code === "no-speech"
            ? "Didn't catch that."
            : `Voice error: ${code}`,
      );
      setLive(false);
    };
    rec.onend = () => setLive(false);

    recRef.current = rec;
    try {
      rec.start();
      setLive(true);
    } catch (e) {
      setError(String(e));
    }
  }, [onTranscript]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    setLive(false);
  }, []);

  if (supported === false) {
    return (
      <button
        type="button"
        disabled
        title="Voice input needs Chrome or Safari"
        className={`grid place-items-center rounded-xl border border-[var(--line)] text-[var(--fg-mute)] opacity-50 ${className}`}
        style={{ width: size, height: size }}
      >
        <MicOff size={size * 0.44} />
      </button>
    );
  }

  return (
    <div className="relative shrink-0">
      <motion.button
        type="button"
        onClick={live ? stop : start}
        whileTap={{ scale: 0.93 }}
        title={title ?? (live ? "Stop listening" : "Click to talk")}
        aria-pressed={live}
        aria-label={live ? "Stop voice input" : "Start voice input"}
        className={`grid place-items-center rounded-xl border transition ${live ? "mic-live" : ""} ${className}`}
        style={{
          width: size,
          height: size,
          borderColor: live ? "rgba(251,113,133,0.65)" : "var(--line)",
          background: live ? "rgba(251,113,133,0.14)" : "rgba(244,239,230,0.045)",
          color: live ? "#fb7185" : "var(--fg-dim)",
        }}
      >
        <Mic size={size * 0.44} />
      </motion.button>
      {live && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_8px_#fb7185]" />}
      {error && (
        <span className="absolute left-1/2 top-full z-20 mt-2 w-max max-w-[240px] -translate-x-1/2 rounded-lg border border-[var(--line)] bg-[var(--bg-elev)] px-2.5 py-1.5 text-[11px] text-rose-300 shadow-lg">
          {error}
        </span>
      )}
    </div>
  );
}
