import { NextResponse } from "next/server";

// Superseded by /api/daily/evening.
export async function GET() {
  return NextResponse.json({ error: "Moved to /api/daily/evening" }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: "Moved to /api/daily/evening" }, { status: 410 });
}
