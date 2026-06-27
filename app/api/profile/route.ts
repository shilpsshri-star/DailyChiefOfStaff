import { NextResponse } from "next/server";

// Superseded by /api/goals (the Profile shape changed to the
// goal -> milestone -> step workflow).
export async function GET() {
  return NextResponse.json({ error: "Moved to /api/goals" }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: "Moved to /api/goals" }, { status: 410 });
}
