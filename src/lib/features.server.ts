/**
 * Evaluates each feature's requirements against this machine, so a page can
 * say exactly what is missing and how to fix it.
 */

import { FEATURES, type Feature, type FeatureStatus, type RequirementStatus } from "./features";
import { AGENT_BY_ID } from "./agents";
import { resolveBin } from "./agents.server";
import { loadConfig, which } from "./config";

function evaluate(req: Feature["requires"][number]): RequirementStatus {
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
  }
}

export function featureStatus(feature: Feature): FeatureStatus {
  const requirements = feature.requires.map(evaluate);
  // A feature is "ready" when its first requirement is met — the first entry is
  // always the one the core of the page needs. Later entries unlock extras and
  // are reported individually.
  const ready = requirements.length === 0 || requirements[0].met;
  return { id: feature.id, ready, requirements };
}

export function allFeatureStatuses(): FeatureStatus[] {
  return FEATURES.map(featureStatus);
}
