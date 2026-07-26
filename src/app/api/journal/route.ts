import { NextResponse } from "next/server";
import {
  appendJournalEntry,
  deleteJournalEntry,
  listJournalDays,
  readJournal,
  todayISO,
} from "@/lib/vaultWriter";
import { loadConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date") ?? todayISO();
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const [entries, days] = await Promise.all([readJournal(date), listJournalDays()]);
  const cfg = loadConfig();
  return NextResponse.json({
    date,
    entries,
    days,
    vault: cfg.vaultRoot ? `${cfg.vaultRoot}/${cfg.vaultFolder}/Journal/${date}.md` : null,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string; date?: string; mood?: string };
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "empty entry" }, { status: 400 });
  if (text.length > 10_000) return NextResponse.json({ error: "entry too long" }, { status: 413 });
  const date = body.date && DATE_RE.test(body.date) ? body.date : todayISO();
  const { entry, vaultPath } = await appendJournalEntry(date, text, body.mood);
  const entries = await readJournal(date);
  return NextResponse.json({ entry, entries, date, vaultPath });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? todayISO();
  const id = url.searchParams.get("id");
  if (!id || !DATE_RE.test(date)) return NextResponse.json({ error: "date and id required" }, { status: 400 });
  const entries = await deleteJournalEntry(date, id);
  return NextResponse.json({ ok: true, entries });
}
