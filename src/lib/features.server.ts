/**
 * Evaluates each feature's requirements against this machine, so a page can
 * say exactly what is missing and how to fix it.
 */

import { FEATURES, type Feature, type FeatureStatus, type RequirementStatus } from "./features";
import { AGENT_BY_ID } from "./agents";
import { resolveBin } from "./agents.server";
import { loadConfig, which } from "./config";

/** Short-lived cache for http probes so a sidebar poll doesn't hammer local services. */
const httpProbeCache = new Map<string, { at: number; ok: boolean; detail: string }>();
const HTTP_PROBE_TTL_MS = 5_000;

async function probeHttp(url: string): Promise<{ ok: boolean; detail: string }> {
  const cached = httpProbeCache.get(url);
  if (cached && Date.now() - cached.at < HTTP_PROBE_TTL_MS) return cached;
  let ok = false;
  let detail = "";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    ok = res.ok;
    detail = ok ? `${url} answered` : `${url} returned ${res.status}`;
  } catch {
    detail = `nothing answering at ${url}`;
  }
  const entry = { at: Date.now(), ok, detail };
  httpProbeCache.set(url, entry);
  return entry;
}

async function evaluate(req: Feature["requires"][number]): Promise<RequirementStatus> {
  switch (req.kind) {
    case "cli": {
      const found = which(req.bin);
      return {
        label: req.label,
        met: Boolean(found),
        detail: found ?? `\`${req.bin}\` not found on PATH`,
        install: req.install,
      };
    }
    case "env": {
      const set = Boolean(process.env[req.key]);
      return {
        label: req.label,
        met: set,
        detail: set ? `${req.key} is set` : `${req.key} is not set`,
        install: req.install,
      };
    }
    case "agent": {
      const spec = AGENT_BY_ID[req.id];
      const bin = spec ? resolveBin(spec) : null;
      return {
        label: req.label,
        met: Boolean(bin),
        detail: bin ?? `${req.label} is not installed`,
        install: req.install,
      };
    }
    case "vault": {
      const root = loadConfig().vaultRoot;
      return {
        label: req.label,
        met: Boolean(root),
        detail: root ?? "no vault configured",
        install: req.install,
      };
    }
    case "http": {
      const url = req.url.replace("{a2a}", loadConfig().a2aBaseUrl);
      const probe = await probeHttp(url);
      return { label: req.label, met: probe.ok, detail: probe.detail, install: req.install };
    }
  }
}

export async function featureStatus(feature: Feature): Promise<FeatureStatus> {
  const requirements = await Promise.all(feature.requires.map(evaluate));
  // A feature is "ready" when its first requirement is met — the first entry is
  // always the one the core of the page needs. Later entries unlock extras and
  // are reported individually.
  const ready = requirements.length === 0 || requirements[0].met;
  return { id: feature.id, ready, requirements };
}

export async function allFeatureStatuses(): Promise<FeatureStatus[]> {
  return Promise.all(FEATURES.map(featureStatus));
}
