/**
 * Where credentials actually live, and the one resolution order used
 * everywhere a key is needed:
 *
 *   1. process.env                       — you exported it yourself
 *   2. 1Password (`op read op://…`)      — when the op CLI is signed in and a
 *                                          reference is mapped for the provider
 *   3. ~/.baseline-workforce/credentials.local.json — the local store, written
 *                                          chmod 600 by this module only
 *
 * Raw secret values never leave the server: every API response carries only
 * presence, source, and a masked preview.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PROVIDERS, PROVIDER_BY_ID, type ProviderStatus } from "./credentials";
import { WORKFORCE_HOME } from "./config";
import { opRead, readOpMappings } from "./onepassword.server";

const STORE_PATH = path.join(WORKFORCE_HOME, "credentials.local.json");

type Store = Record<string, { value: string; savedAt: string }>;

function readStore(): Store {
  try {
    if (!existsSync(STORE_PATH)) return {};
    return JSON.parse(readFileSync(STORE_PATH, "utf8")) as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  mkdirSync(WORKFORCE_HOME, { recursive: true });
  const tmp = `${STORE_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
  renameSync(tmp, STORE_PATH);
  // rename preserves the tmp file's mode, but belt-and-braces on platforms
  // where the store already existed with a looser mode:
  try {
    chmodSync(STORE_PATH, 0o600);
  } catch {
    /* best effort */
  }
}

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 6) return `${"•".repeat(value.length)} (${value.length} chars)`;
  return `${value.slice(0, 4)}…${value.slice(-3)} (${value.length} chars)`;
}

export interface ResolvedSecret {
  value: string;
  source: "env" | "op" | "file";
  envKeyUsed: string | null;
}

/** The one lookup every integration uses. Returns null when nothing is set anywhere. */
export function resolveSecret(providerId: string): ResolvedSecret | null {
  const provider = PROVIDER_BY_ID[providerId];
  for (const key of provider?.envKeys ?? []) {
    const v = process.env[key];
    if (v) return { value: v, source: "env", envKeyUsed: key };
  }
  const mapping = readOpMappings()[providerId];
  if (mapping) {
    const v = opRead(mapping);
    if (v) return { value: v, source: "op", envKeyUsed: null };
  }
  const stored = readStore()[providerId]?.value;
  if (stored) return { value: stored, source: "file", envKeyUsed: null };
  return null;
}

export function providerStatus(providerId: string): ProviderStatus {
  const mapping = readOpMappings()[providerId] ?? null;
  const resolved = resolveSecret(providerId);
  return {
    id: providerId,
    present: Boolean(resolved),
    source: resolved?.source ?? null,
    maskedPreview: resolved ? maskSecret(resolved.value) : null,
    envKeyUsed: resolved?.envKeyUsed ?? null,
    opReference: mapping,
  };
}

export function allProviderStatuses(): ProviderStatus[] {
  return PROVIDERS.map((p) => providerStatus(p.id));
}

export function setStoredSecret(providerId: string, value: string): void {
  if (!PROVIDER_BY_ID[providerId]) throw new Error(`unknown provider: ${providerId}`);
  const store = readStore();
  store[providerId] = { value, savedAt: new Date().toISOString() };
  writeStore(store);
}

export function deleteStoredSecret(providerId: string): void {
  const store = readStore();
  delete store[providerId];
  writeStore(store);
}

/**
 * Bridge for libraries that read process.env directly (apollo.ts, heygen.ts…):
 * when a key resolves from 1Password or the local store but the env var is
 * unset, export it into this process so downstream code just works. The value
 * still never crosses to the browser.
 */
export function ensureProviderEnv(providerId: string): boolean {
  const provider = PROVIDER_BY_ID[providerId];
  if (!provider) return false;
  for (const key of provider.envKeys) if (process.env[key]) return true;
  const resolved = resolveSecret(providerId);
  if (!resolved) return false;
  const key = provider.envKeys[0];
  if (key) process.env[key] = resolved.value;
  return true;
}

export const CREDENTIALS_STORE_PATH = STORE_PATH;
