"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Search, UserRoundSearch } from "lucide-react";
import type { Organisation, Person } from "@/lib/apollo";
import IntegrationBanner, { useIntegration } from "./IntegrationBanner";
import { EmptyState, Panel, Spinner, Tabs } from "./ui";

type Mode = "Person" | "List" | "Company" | "Search";

function PersonRow({ person }: { person: Person }) {
  return (
    <motion.li layout className="px-5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13.5px] font-medium">{person.name}</span>
        <span className="text-[11.5px] text-[var(--fg-mute)]">
          {person.company}
          {person.employees ? ` · ${person.employees.toLocaleString()} staff` : ""}
        </span>
      </div>
      <p className="mt-0.5 text-[12.5px] text-[var(--fg-dim)]">
        {person.title}
        {person.location ? ` · ${person.location}` : ""}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {person.email && (
          <span className="pill !py-0.5 !text-[10.5px]">
            {person.email}
            {person.emailStatus ? ` · ${person.emailStatus}` : ""}
          </span>
        )}
        {person.phone && <span className="pill !py-0.5 !text-[10.5px]">{person.phone}</span>}
        {person.seniority && <span className="pill !py-0.5 !text-[10.5px]">{person.seniority}</span>}
        {person.linkedin && (
          <a href={person.linkedin} target="_blank" rel="noreferrer" className="pill !py-0.5 !text-[10.5px] hover:text-[var(--fg)]">
            linkedin
          </a>
        )}
      </div>
    </motion.li>
  );
}

/** Apollo lookups: one person, a pasted list, a company, or an ICP search. */
export default function LeadsEnrich() {
  const { connected } = useIntegration("apollo");
  const [mode, setMode] = useState<Mode>("Person");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [lines, setLines] = useState("");
  const [titles, setTitles] = useState("Founder, Head of Operations");
  const [keywords, setKeywords] = useState("");
  const [revealEmail, setRevealEmail] = useState(false);
  const [revealPhone, setRevealPhone] = useState(false);

  const [people, setPeople] = useState<Person[]>([]);
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setPeople([]);
    setOrganisation(null);
    setTotal(null);
    const res = await fetch("/api/leads/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as {
      error?: string;
      person?: Person | null;
      people?: (Person | null)[];
      organisation?: Organisation | null;
      total?: number;
    };
    setBusy(false);
    if (!res?.ok) {
      setError(json.error ?? "the lookup failed");
      return;
    }
    if (json.person) setPeople([json.person]);
    if (json.people) setPeople(json.people.filter((p): p is Person => Boolean(p)));
    if (json.organisation !== undefined) setOrganisation(json.organisation ?? null);
    if (typeof json.total === "number") setTotal(json.total);
    if (json.person === null || (json.people && !json.people.filter(Boolean).length)) {
      setError("Apollo had no match for that. A work email or a name plus company domain usually lands.");
    }
  }, []);

  return (
    <div className="space-y-4">
      <IntegrationBanner id="apollo" />

      <Tabs tabs={["Person", "List", "Company", "Search"]} active={mode} onChange={(t) => setMode(t as Mode)} />

      <Panel>
        {mode === "Person" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="ap-email" className="eyebrow mb-1.5 block">
                Work email
              </label>
              <input id="ap-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dana@example.com" className="input py-2 text-[13px]" />
            </div>
            <div>
              <label htmlFor="ap-name" className="eyebrow mb-1.5 block">
                …or name
              </label>
              <input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dana Okafor" className="input py-2 text-[13px]" />
            </div>
            <div>
              <label htmlFor="ap-domain" className="eyebrow mb-1.5 block">
                …and company domain
              </label>
              <input id="ap-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" className="input py-2 text-[13px]" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ap-li" className="eyebrow mb-1.5 block">
                …or LinkedIn URL
              </label>
              <input id="ap-li" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/…" className="input py-2 text-[13px]" />
            </div>
          </div>
        )}

        {mode === "List" && (
          <div>
            <label htmlFor="ap-lines" className="eyebrow mb-1.5 block">
              One per line — an email, or “Name, domain.com” (10 per request)
            </label>
            <textarea id="ap-lines" rows={6} value={lines} onChange={(e) => setLines(e.target.value)} placeholder={"dana@example.com\nSam Reyes, acme.io"} className="textarea py-2 text-[13px]" />
          </div>
        )}

        {mode === "Company" && (
          <div>
            <label htmlFor="ap-cdomain" className="eyebrow mb-1.5 block">
              Company domain
            </label>
            <input id="ap-cdomain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="anthropic.com" className="input py-2 text-[13px]" />
          </div>
        )}

        {mode === "Search" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ap-titles" className="eyebrow mb-1.5 block">
                Titles (comma separated)
              </label>
              <input id="ap-titles" value={titles} onChange={(e) => setTitles(e.target.value)} className="input py-2 text-[13px]" />
            </div>
            <div>
              <label htmlFor="ap-kw" className="eyebrow mb-1.5 block">
                Keywords
              </label>
              <input id="ap-kw" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="ai automation agency" className="input py-2 text-[13px]" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ap-sdomain" className="eyebrow mb-1.5 block">
                Limit to a domain (optional)
              </label>
              <input id="ap-sdomain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" className="input py-2 text-[13px]" />
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
          <div className="flex flex-wrap items-center gap-3">
            {(mode === "Person" || mode === "List") && (
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--fg-dim)]">
                <input type="checkbox" checked={revealEmail} onChange={(e) => setRevealEmail(e.target.checked)} className="accent-[var(--gold)]" />
                Reveal personal email <span className="text-[var(--fg-mute)]">(uses credits)</span>
              </label>
            )}
            {mode === "Person" && (
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--fg-dim)]">
                <input type="checkbox" checked={revealPhone} onChange={(e) => setRevealPhone(e.target.checked)} className="accent-[var(--gold)]" />
                Reveal phone <span className="text-[var(--fg-mute)]">(uses credits)</span>
              </label>
            )}
          </div>
          <button
            onClick={() =>
              void call(
                mode === "Person"
                  ? { mode: "person", email, name, domain, linkedinUrl, revealEmail, revealPhone }
                  : mode === "List"
                    ? { mode: "bulk", lines, revealEmail }
                    : mode === "Company"
                      ? { mode: "company", domain }
                      : { mode: "search", titles: titles.split(",").map((t) => t.trim()).filter(Boolean), keywords, domain: domain || undefined },
              )
            }
            disabled={!connected || busy}
            className="btn btn-primary"
          >
            {busy ? <Spinner /> : mode === "Search" ? <Search size={14} /> : <UserRoundSearch size={14} />}
            {mode === "Search" ? "Search" : "Look up"}
          </button>
        </div>

        {error && <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/6 px-3 py-2 text-[12px] text-amber-100">{error}</p>}
      </Panel>

      {organisation && (
        <Panel title={organisation.name} subtitle={organisation.domain}>
          <p className="text-[13px] leading-relaxed text-[var(--fg-soft)]">{organisation.description || "No description on file."}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {organisation.industry && <span className="pill">{organisation.industry}</span>}
            {organisation.employees && <span className="pill">{organisation.employees.toLocaleString()} staff</span>}
            {organisation.founded && <span className="pill">founded {organisation.founded}</span>}
            {organisation.location && <span className="pill">{organisation.location}</span>}
          </div>
        </Panel>
      )}

      {people.length > 0 && (
        <Panel title="Matches" subtitle={total !== null ? `${people.length} shown of ${total.toLocaleString()} found` : `${people.length} found`} padded={false}>
          <ul className="divide-y divide-[var(--line)]">
            {people.map((p, i) => (
              <PersonRow key={`${p.id ?? p.name}-${i}`} person={p} />
            ))}
          </ul>
          <div className="border-t border-[var(--line)] px-5 py-3">
            <button
              onClick={() => {
                const text = people
                  .map((p) => [p.name, p.title, p.company, p.email ?? "", p.linkedin ?? ""].join(", "))
                  .join("\n");
                void navigator.clipboard.writeText(text);
              }}
              className="btn btn-ghost !px-2 text-[12px]"
            >
              Copy as CSV rows
            </button>
          </div>
        </Panel>
      )}

      {!people.length && !organisation && !busy && (
        <Panel>
          <EmptyState
            icon="Users"
            title="Nothing looked up yet"
            body="Scoring and outreach in the Studio tab work on lists you already have — this tab is only for filling in the gaps."
          />
        </Panel>
      )}
    </div>
  );
}
