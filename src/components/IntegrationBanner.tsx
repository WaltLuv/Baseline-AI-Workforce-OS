"use client";

import { CheckCircle2, Plug } from "lucide-react";
import { INTEGRATION_BY_ID, type IntegrationStatus } from "@/lib/integrations";
import { useJson } from "@/lib/client";

interface Response {
  statuses: IntegrationStatus[];
}

/** Shared hook so every render panel agrees on what is connected. */
export function useIntegration(id: string) {
  const { data, refresh } = useJson<Response>("/api/integrations", { pollMs: 120_000 });
  const status = data?.statuses.find((s) => s.id === id) ?? null;
  return { integration: INTEGRATION_BY_ID[id], status, connected: Boolean(status?.connected), refresh };
}

/**
 * States plainly what this service adds, what still works without it, and the
 * exact line to add to .env.local. Shown connected or not — when it is
 * connected it shrinks to a single confirmation line.
 */
export default function IntegrationBanner({ id }: { id: string }) {
  const { integration, status } = useIntegration(id);
  if (!integration) return null;

  if (status?.connected) {
    return (
      <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-[rgba(74,222,128,0.25)] bg-[rgba(74,222,128,0.07)] px-4 py-2.5">
        <CheckCircle2 size={15} className="shrink-0 text-emerald-300" />
        <span className="text-[12.5px] text-emerald-100">
          {integration.label} is connected — {status.detail}.
        </span>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-[rgba(251,191,36,0.26)] bg-[rgba(251,191,36,0.06)] p-4">
      <div className="mb-2 flex items-center gap-2.5">
        <Plug size={15} className="shrink-0 text-amber-300" />
        <h3 className="text-[13.5px] font-semibold text-amber-100">{integration.label} is not connected</h3>
      </div>
      <p className="text-[12.5px] leading-relaxed text-[var(--fg-dim)]">
        <span className="text-[var(--fg-soft)]">What it adds:</span> {integration.adds}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--fg-dim)]">
        <span className="text-[var(--fg-soft)]">Without it:</span> {integration.withoutIt}
      </p>
      <pre className="mono mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.6)] p-3 text-[var(--fg-dim)]">
        {`# apps/workforce/.env.local\n${integration.install}`}
      </pre>
      <p className="mt-2 text-[11.5px] text-[var(--fg-mute)]">
        Restart the dev server after adding a key ·{" "}
        <a href={integration.docsUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted">
          provider docs
        </a>
      </p>
    </div>
  );
}
