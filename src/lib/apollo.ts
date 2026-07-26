/**
 * Apollo — lead enrichment.
 *
 * People enrichment is `POST /api/v1/people/match` with the key in `X-Api-Key`.
 * Personal emails and phone numbers cost credits and are only requested when
 * the caller explicitly asks, so a routine lookup never quietly bills you.
 */

const BASE = (process.env.APOLLO_BASE_URL ?? "https://api.apollo.io/api/v1").replace(/\/$/, "");

function key(): string {
  const k = process.env.APOLLO_API_KEY;
  if (!k) throw new Error("APOLLO_API_KEY is not set");
  return k;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "X-Api-Key": key(),
      "Content-Type": "application/json",
      Accept: "application/json",
      "Cache-Control": "no-cache",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* Apollo returns HTML for auth failures */
  }
  if (!res.ok) {
    const msg = (json as { error?: string; message?: string } | null)?.error
      ?? (json as { message?: string } | null)?.message
      ?? text.slice(0, 300);
    throw new Error(`Apollo ${res.status}: ${msg}`);
  }
  return json as T;
}

export interface Person {
  id: string | null;
  name: string;
  title: string;
  company: string;
  domain: string;
  email: string | null;
  emailStatus: string | null;
  phone: string | null;
  linkedin: string | null;
  location: string;
  seniority: string;
  employees: number | null;
  industry: string;
}

interface RawPerson {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  email_status?: string;
  linkedin_url?: string;
  city?: string;
  country?: string;
  seniority?: string;
  phone_numbers?: { sanitized_number?: string; raw_number?: string }[];
  organization?: {
    name?: string;
    primary_domain?: string;
    website_url?: string;
    estimated_num_employees?: number;
    industry?: string;
  };
}

function normalise(raw: RawPerson | undefined | null): Person | null {
  if (!raw) return null;
  const org = raw.organization ?? {};
  return {
    id: raw.id ?? null,
    name: raw.name || [raw.first_name, raw.last_name].filter(Boolean).join(" ") || "(no name)",
    title: raw.title ?? "",
    company: org.name ?? "",
    domain: org.primary_domain ?? org.website_url ?? "",
    email: raw.email ?? null,
    emailStatus: raw.email_status ?? null,
    phone: raw.phone_numbers?.[0]?.sanitized_number ?? raw.phone_numbers?.[0]?.raw_number ?? null,
    linkedin: raw.linkedin_url ?? null,
    location: [raw.city, raw.country].filter(Boolean).join(", "),
    seniority: raw.seniority ?? "",
    employees: org.estimated_num_employees ?? null,
    industry: org.industry ?? "",
  };
}

export interface MatchInput {
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  domain?: string;
  linkedinUrl?: string;
  /** Both cost Apollo credits — off unless asked for. */
  revealEmail?: boolean;
  revealPhone?: boolean;
}

export async function enrichPerson(input: MatchInput): Promise<Person | null> {
  const body: Record<string, unknown> = {};
  if (input.email) body.email = input.email;
  if (input.name) body.name = input.name;
  if (input.firstName) body.first_name = input.firstName;
  if (input.lastName) body.last_name = input.lastName;
  if (input.domain) body.domain = input.domain;
  if (input.linkedinUrl) body.linkedin_url = input.linkedinUrl;
  if (input.revealEmail) body.reveal_personal_emails = true;
  if (input.revealPhone) body.reveal_phone_number = true;

  if (!Object.keys(body).length) throw new Error("Give at least an email, a name + domain, or a LinkedIn URL");

  const json = await call<{ person?: RawPerson }>("/people/match", { method: "POST", body: JSON.stringify(body) });
  return normalise(json.person);
}

/** Bulk match, so a pasted list is one request instead of fifty. */
export async function enrichPeople(details: MatchInput[], reveal = false): Promise<(Person | null)[]> {
  const capped = details.slice(0, 10); // Apollo's per-request ceiling
  const json = await call<{ matches?: (RawPerson | null)[] }>("/people/bulk_match", {
    method: "POST",
    body: JSON.stringify({
      reveal_personal_emails: reveal,
      details: capped.map((d) => ({
        email: d.email,
        name: d.name,
        first_name: d.firstName,
        last_name: d.lastName,
        domain: d.domain,
        linkedin_url: d.linkedinUrl,
      })),
    }),
  });
  return (json.matches ?? []).map(normalise);
}

export interface Organisation {
  name: string;
  domain: string;
  employees: number | null;
  industry: string;
  description: string;
  linkedin: string | null;
  founded: number | null;
  location: string;
}

export async function enrichOrganisation(domain: string): Promise<Organisation | null> {
  const json = await call<{
    organization?: {
      name?: string;
      primary_domain?: string;
      estimated_num_employees?: number;
      industry?: string;
      short_description?: string;
      linkedin_url?: string;
      founded_year?: number;
      city?: string;
      country?: string;
    };
  }>(`/organizations/enrich?domain=${encodeURIComponent(domain)}`);

  const o = json.organization;
  if (!o) return null;
  return {
    name: o.name ?? domain,
    domain: o.primary_domain ?? domain,
    employees: o.estimated_num_employees ?? null,
    industry: o.industry ?? "",
    description: o.short_description ?? "",
    linkedin: o.linkedin_url ?? null,
    founded: o.founded_year ?? null,
    location: [o.city, o.country].filter(Boolean).join(", "),
  };
}

export interface SearchInput {
  titles?: string[];
  domains?: string[];
  locations?: string[];
  employeeRanges?: string[];
  keywords?: string;
  page?: number;
  perPage?: number;
}

export async function searchPeople(input: SearchInput): Promise<{ people: Person[]; total: number }> {
  const json = await call<{ people?: RawPerson[]; pagination?: { total_entries?: number } }>("/mixed_people/search", {
    method: "POST",
    body: JSON.stringify({
      person_titles: input.titles?.length ? input.titles : undefined,
      q_organization_domains_list: input.domains?.length ? input.domains : undefined,
      person_locations: input.locations?.length ? input.locations : undefined,
      organization_num_employees_ranges: input.employeeRanges?.length ? input.employeeRanges : undefined,
      q_keywords: input.keywords || undefined,
      page: input.page ?? 1,
      per_page: Math.min(25, input.perPage ?? 10),
    }),
  });

  return {
    people: (json.people ?? []).map(normalise).filter((p): p is Person => p !== null),
    total: json.pagination?.total_entries ?? 0,
  };
}
