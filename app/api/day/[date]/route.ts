import { NextResponse } from "next/server";
import { kvGet, KEYS } from "@/lib/kv";
import { requireUserId, unauthorized } from "@/lib/auth";
import { DailyLog } from "@/lib/types";

// Memory Lane: fetch what was focused on / accomplished on a specific past date.
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

  const log = await kvGet<DailyLog>(KEYS.dailyLog(userId, date));
  return NextResponse.json({ date, log });
}
