import { NextResponse } from "next/server";
import { enrichOrganisation, enrichPeople, enrichPerson, searchPeople, type MatchInput } from "@/lib/apollo";
import { requireIntegration } from "@/lib/integrations.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * mode:
 *   person  — one lookup by email, name + domain, or LinkedIn URL
 *   bulk    — a pasted list, one per line
 *   company — domain lookup
 *   search  — find people matching an ICP
 *
 * reveal* flags cost Apollo credits, so they are opt-in per request and the UI
 * says so next to the switch.
 */
export async function POST(req: Request) {
  try {
    requireIntegration("apollo");
    const body = (await req.json().catch(() => ({}))) as {
      mode?: string;
      email?: string;
      name?: string;
      domain?: string;
      linkedinUrl?: string;
      lines?: string;
      titles?: string[];
      locations?: string[];
      employeeRanges?: string[];
      keywords?: string;
      revealEmail?: boolean;
      revealPhone?: boolean;
      page?: number;
    };

    switch (body.mode ?? "person") {
      case "person": {
        const person = await enrichPerson({
          email: body.email,
          name: body.name,
          domain: body.domain,
          linkedinUrl: body.linkedinUrl,
          revealEmail: body.revealEmail,
          revealPhone: body.revealPhone,
        });
        return NextResponse.json({ person });
      }

      case "bulk": {
        const details: MatchInput[] = String(body.lines ?? "")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 10)
          .map((line) => {
            // Accept "email", "Name, domain.com", or "Name <email>".
            const emailMatch = line.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
            if (emailMatch) return { email: emailMatch[0] };
            const [name, domain] = line.split(/[,;|]/).map((s) => s.trim());
            return { name, domain };
          });
        if (!details.length) return NextResponse.json({ error: "nothing to look up" }, { status: 400 });
        const people = await enrichPeople(details, Boolean(body.revealEmail));
        return NextResponse.json({ people, requested: details.length });
      }

      case "company": {
        const domain = String(body.domain ?? "").trim();
        if (!domain) return NextResponse.json({ error: "a domain is required" }, { status: 400 });
        return NextResponse.json({ organisation: await enrichOrganisation(domain) });
      }

      case "search": {
        const result = await searchPeople({
          titles: body.titles,
          domains: body.domain ? [body.domain] : undefined,
          locations: body.locations,
          employeeRanges: body.employeeRanges,
          keywords: body.keywords,
          page: body.page,
        });
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: `unknown mode: ${body.mode}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
