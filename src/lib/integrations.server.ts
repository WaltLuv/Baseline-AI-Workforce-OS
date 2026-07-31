import { INTEGRATIONS, type Integration, type IntegrationStatus } from "./integrations";
import { which } from "./config";
import { ensureProviderEnv } from "./credentials.server";

/** Which env key (if any) is switching this integration on. */
export function activeKey(integration: Integration): string | null {
  // A key stored on the Credentials page (local file or 1Password) counts too —
  // it is exported into this process's env so downstream libs read it as usual.
  if (integration.providerId) ensureProviderEnv(integration.providerId);
  for (const key of integration.envKeys) {
    if (process.env[key]) return key;
  }
  return null;
}

export function integrationStatus(integration: Integration): IntegrationStatus {
  if (integration.cli) {
    const bin = which(integration.cli);
    const key = activeKey(integration);
    return {
      id: integration.id,
      connected: Boolean(bin),
      detail: bin ?? `\`${integration.cli}\` is not installed${key ? ` (${key} is set)` : ""}`,
    };
  }
  const key = activeKey(integration);
  return {
    id: integration.id,
    connected: Boolean(key),
    detail: key ? `${key} is set` : `set ${integration.envKeys.join(" or ")}`,
  };
}

export function allIntegrationStatuses(): IntegrationStatus[] {
  return INTEGRATIONS.map(integrationStatus);
}

/** Throws a message worth showing the user when the service is not configured. */
export function requireIntegration(id: string): Integration {
  const integration = INTEGRATIONS.find((i) => i.id === id);
  if (!integration) throw new Error(`unknown integration: ${id}`);
  const status = integrationStatus(integration);
  if (!status.connected) {
    throw new Error(`${integration.label} is not connected — ${status.detail}. ${integration.install.split("\n")[0]}`);
  }
  return integration;
}
