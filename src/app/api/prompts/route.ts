import { NextResponse } from "next/server";
import { ALL_PROMPTS, PROMPT_CATEGORIES } from "@/lib/prompts";
import { writeVaultFile } from "@/lib/vaultWriter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save the whole library into the vault as one markdown file per category. */
export async function POST() {
  const written: string[] = [];
  for (const cat of PROMPT_CATEGORIES) {
    const prompts = ALL_PROMPTS.filter((p) => p.category === cat);
    if (!prompts.length) continue;
    const md = [
      `# Prompts — ${cat}`,
      "",
      ...prompts.flatMap((p) => [`## ${cat} #${p.id}`, "", "```", p.text, "```", ""]),
    ].join("\n");
    const abs = await writeVaultFile(["Prompts", `${cat.replace(/[\\/:*?"<>|]/g, "-")}.md`], md);
    if (abs) written.push(abs);
  }
  if (!written.length) {
    return NextResponse.json({ error: "No vault configured — set your vault path in Settings first." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, written });
}
