import { NextResponse } from "next/server";

// Free-form chat was removed in favor of the structured goal workflow.
export async function GET() {
  return NextResponse.json({ error: "Chat has been removed." }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: "Chat has been removed." }, { status: 410 });
}
