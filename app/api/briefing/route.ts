import { NextResponse } from "next/server";

// Superseded by /api/daily/morning.
export async function GET() {
  return NextResponse.json({ error: "Moved to /api/daily/morning" }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: "Moved to /api/daily/morning" }, { status: 410 });
}
