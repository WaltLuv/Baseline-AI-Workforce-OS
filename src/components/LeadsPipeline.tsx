"use client";

/**
 * The find → enrich → score pipeline behind the Leads page's second tab.
 *
 * Free tier first: CSV paste and scoring need no keys at all; Hunter runs on
 * a free key; Apollo is the volume add-on. The scoring rubric is plain code
 * on this page — transparent, not a black box.
 */

import { useMemo, useState } from "react";
import { useBoard } from "@/lib/client";
import LeadsEnrich from "@/components/LeadsEnrich";
import { EmptyState, Icon, Panel, Spinner, StatusPill, Tabs } from "@/components/ui";

const TABS = ["Enrich (Apollo)", "Hunter", "Import & Score"];

interface Lead {
  id: string;
  name: string;
  title: string;
  company: string;
  domain: string;
  email: string;
  score: number;
  reasons: string[];
}
interface BoardDoc {
  leads: Lead[];
  icpKeywords: string;
}

export default function LeadsPipeline() {
  const [tab, setTab] = useState(TABS[0]);
  return (
    <div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "Enrich (Apollo)" && <LeadsEnrich />}
      {tab === "Hunter" && <HunterTab />}
      {tab === "Import & Score" && <ImportScoreTab />}
    </div>
  );
}

function HunterTab() {
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    domain: string;
    organization: string;
    pattern: string | null;
    contacts: { firstName: string; lastName: string; email: string; position: string; confidence: number }[];
  } | null>(null);

  const search = async () => {
    if (!domain.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/leads/hunter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "domain", domain: domain.trim() }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) setError((json as { error?: string }).error ?? "Hunter request failed");
    else setResult(json);
  };

  return (
    <div className="space-y-4">
      <Panel title="Domain search" subtitle="Who is reachable behind a company domain — a free Hunter key is enough">
        <div className="flex items-center gap-2">
          <input
            className="input flex-1"
            placeholder="acme.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void search()}
          />
          <button className="btn btn-primary" onClick={() => void search()} disabled={busy || !domain.trim()}>
            {busy ? <Spinner size={13} /> : <Icon name="Search" size={13} />} Find people
          </button>
        </div>
        {error && <p className="mt-2 text-[12.5px] text-[var(--rose,#fb7185)]">{error}</p>}
      </Panel>
      {result && (
        <Panel
          title={result.organization || result.domain}
          subtitle={result.pattern ? `email pattern: ${result.pattern}@${result.domain}` : undefined}
          padded={false}
        >
          {result.contacts.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {result.contacts.map((c, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-[var(--fg-soft)]">
                      {`${c.firstName} ${c.lastName}`.trim() || "(name unknown)"}
                    </span>
                    <span className="block text-[11.5px] text-[var(--fg-mute)]">{c.position || "—"}</span>
                  </span>
                  <span className="mono text-[12px] text-[var(--fg-dim)]">{c.email}</span>
                  <span className="pill !text-[10px]">{c.confidence}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="SearchX" title="No public contacts for that domain" />
          )}
        </Panel>
      )}
    </div>
  );
}

/** Transparent scoring: title seniority + ICP keyword hits + having an email. */
function scoreLead(lead: Omit<Lead, "score" | "reasons">, icpKeywords: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const title = lead.title.toLowerCase();
  if (/founder|ceo|owner|principal/.test(title)) {
    score += 30;
    reasons.push("decision maker (+30)");
  } else if (/head|director|vp|chief/.test(title)) {
    score += 20;
    reasons.push("senior (+20)");
  } else if (/manager|lead/.test(title)) {
    score += 10;
    reasons.push("manager (+10)");
  }
  const kws = icpKeywords.toLowerCase().split(",").map((k) => k.trim()).filter(Boolean);
  const hay = `${lead.title} ${lead.company}`.toLowerCase();
  const hits = kws.filter((k) => hay.includes(k));
  if (hits.length) {
    score += Math.min(40, hits.length * 15);
    reasons.push(`ICP keywords ${hits.join(", ")} (+${Math.min(40, hits.length * 15)})`);
  }
  if (lead.email) {
    score += 20;
    reasons.push("reachable email (+20)");
  }
  if (lead.domain) {
    score += 10;
    reasons.push("known domain (+10)");
  }
  return { score: Math.min(100, score), reasons };
}

function parseCsv(text: string): Omit<Lead, "score" | "reasons">[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const col = (names: string[]) => headers.findIndex((h) => names.some((n) => h.includes(n)));
  const iName = col(["name"]);
  const iTitle = col(["title", "position", "role"]);
  const iCompany = col(["company", "organization", "org"]);
  const iDomain = col(["domain", "website", "url"]);
  const iEmail = col(["email"]);
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    return {
      id: `lead-${i}-${Date.now().toString(36)}`,
      name: iName >= 0 ? (cells[iName] ?? "") : "",
      title: iTitle >= 0 ? (cells[iTitle] ?? "") : "",
      company: iCompany >= 0 ? (cells[iCompany] ?? "") : "",
      domain: iDomain >= 0 ? (cells[iDomain] ?? "") : "",
      email: iEmail >= 0 ? (cells[iEmail] ?? "") : "",
    };
  });
}

function ImportScoreTab() {
  const { doc, setDoc, loaded } = useBoard<BoardDoc>("leads-pipeline", { leads: [], icpKeywords: "" });
  const [csv, setCsv] = useState("");
  const [icp, setIcp] = useState<string | null>(null);
  const keywords = icp ?? doc.icpKeywords;

  const importCsv = () => {
    const parsed = parseCsv(csv);
    if (!parsed.length) return;
    const scored: Lead[] = parsed.map((l) => ({ ...l, ...scoreLead(l, keywords) }));
    scored.sort((a, b) => b.score - a.score);
    setDoc({ leads: scored, icpKeywords: keywords });
    setCsv("");
  };

  const rescore = () => {
    const scored = doc.leads
      .map((l) => ({ ...l, ...scoreLead(l, keywords) }))
      .sort((a, b) => b.score - a.score);
    setDoc({ leads: scored, icpKeywords: keywords });
  };

  const qualified = useMemo(() => doc.leads.filter((l) => l.score >= 60).length, [doc.leads]);

  return (
    <div className="space-y-4">
      <Panel title="Import a CSV" subtitle="Always free, no keys — headers like name, title, company, domain, email are auto-detected">
        <textarea
          className="textarea mono w-full"
          rows={5}
          placeholder={"name,title,company,domain,email\nJane Doe,Founder,Acme,acme.com,jane@acme.com"}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            className="input flex-1"
            placeholder="ICP keywords, comma-separated (e.g. agency, automation, ai)"
            value={keywords}
            onChange={(e) => setIcp(e.target.value)}
          />
          <button className="btn btn-primary" onClick={importCsv} disabled={!csv.trim()}>
            <Icon name="FileUp" size={13} /> Import & score
          </button>
          {doc.leads.length > 0 && (
            <button className="btn" onClick={rescore}>
              Re-score
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-[var(--fg-mute)]">
          Scoring is plain code on this page: seniority (up to +30) · ICP keyword hits (up to +40) · reachable email (+20) ·
          known domain (+10). Nothing hidden.
        </p>
      </Panel>

      {loaded && doc.leads.length > 0 && (
        <Panel title="Scored list" subtitle={`${doc.leads.length} leads · ${qualified} clear the 60-point bar`} padded={false}>
          <ul className="divide-y divide-[var(--line)]">
            {doc.leads.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-5 py-2.5" title={l.reasons.join(" · ")}>
                <span
                  className="mono w-10 shrink-0 text-center text-[13px] font-semibold"
                  style={{ color: l.score >= 60 ? "var(--emerald)" : l.score >= 35 ? "#fbbf24" : "var(--fg-mute)" }}
                >
                  {l.score}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-[var(--fg-soft)]">
                    {l.name || "(no name)"} {l.title ? `· ${l.title}` : ""}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--fg-mute)]">
                    {[l.company, l.domain, l.email].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <StatusPill ready={l.score >= 60} label={l.score >= 60 ? "Qualified" : "Below bar"} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
