import { NextResponse } from "next/server";
import { kvGet, KEYS } from "@/lib/kv";
import { requireUserId, unauthorized } from "@/lib/auth";
import { Briefing, EndOfDaySummary } from "@/lib/types";

// Memory Lane: fetch what happened on a specific past date.
export async function GET(
  _req: Request,
  { params }: { params: { date: string } }
) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const date = params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  const [briefing, eod] = await Promise.all([
    kvGet<Briefing>(KEYS.briefing(userId, date)),
    kvGet<EndOfDaySummary>(KEYS.eod(userId, date)),
  ]);

  return NextResponse.json({ date, briefing, eod });
}
