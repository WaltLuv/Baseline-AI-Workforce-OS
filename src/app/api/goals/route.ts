import { NextResponse } from "next/server";
import { addGoal, readGoals, writeGoals } from "@/lib/vaultWriter";
import { loadConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [goals, cfg] = [await readGoals(), loadConfig()];
  return NextResponse.json({
    goals,
    categories: cfg.goalCategories,
    vault: cfg.vaultRoot ? `${cfg.vaultRoot}/${cfg.vaultFolder}/Goals` : null,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string; category?: string };
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "empty goal" }, { status: 400 });
  const goal = await addGoal(text, body.category);
  return NextResponse.json({ goal });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    done?: boolean;
    text?: string;
    category?: string;
  };
  const goals = await readGoals();
  const goal = goals.find((g) => g.id === body.id);
  if (!goal) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (typeof body.done === "boolean") {
    goal.done = body.done;
    goal.doneAt = body.done ? new Date().toISOString() : undefined;
  }
  if (typeof body.text === "string" && body.text.trim()) goal.text = body.text.slice(0, 500).trim();
  if (typeof body.category === "string") goal.category = body.category.slice(0, 40).trim() || undefined;
  const { vaultPath } = await writeGoals(goals);
  return NextResponse.json({ goal, vaultPath });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const goals = (await readGoals()).filter((g) => g.id !== id);
  await writeGoals(goals);
  return NextResponse.json({ ok: true, total: goals.length });
}
