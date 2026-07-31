/**
 * Hunter.io — find email addresses behind a company domain.
 * Free tier friendly: domain search + email finder + verifier. Key resolves
 * env → 1Password → local store like every other provider.
 */

import { resolveSecret } from "./credentials.server";

const BASE = "https://api.hunter.io/v2";

export interface HunterContact {
  firstName: string;
  lastName: string;
  email: string;
  position: string;
  confidence: number;
}

export interface HunterDomainResult {
  domain: string;
  organization: string;
  pattern: string | null;
  contacts: HunterContact[];
}

function key(): string {
  const k = resolveSecret("hunter");
  if (!k) throw new Error("Hunter.io is not connected — add HUNTER_API_KEY on the Credentials page (free tier works).");
  return k.value;
}

export async function domainSearch(domain: string, limit = 10): Promise<HunterDomainResult> {
  const url = `${BASE}/domain-search?domain=${encodeURIComponent(domain)}&limit=${limit}&api_key=${key()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Hunter answered ${res.status}${res.status === 429 ? " (rate limited)" : ""}`);
  const json = (await res.json()) as {
    data?: {
      domain?: string;
      organization?: string;
      pattern?: string | null;
      emails?: { first_name?: string; last_name?: string; value?: string; position?: string; confidence?: number }[];
    };
  };
  const d = json.data ?? {};
  return {
    domain: d.domain ?? domain,
    organization: d.organization ?? "",
    pattern: d.pattern ?? null,
    contacts: (d.emails ?? []).map((e) => ({
      firstName: e.first_name ?? "",
      lastName: e.last_name ?? "",
      email: e.value ?? "",
      position: e.position ?? "",
      confidence: e.confidence ?? 0,
    })),
  };
}

export async function emailFinder(domain: string, firstName: string, lastName: string): Promise<{ email: string | null; confidence: number }> {
  const url = `${BASE}/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${key()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Hunter answered ${res.status}`);
  const json = (await res.json()) as { data?: { email?: string | null; score?: number } };
  return { email: json.data?.email ?? null, confidence: json.data?.score ?? 0 };
}
