import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Small helper so every API route can do:
//   const userId = await requireUserId();
//   if (!userId) return unauthorized();
export async function requireUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

export function unauthorized() {
  return NextResponse.json(
    { error: "Sign in with Google or LinkedIn to use this." },
    { status: 401 }
  );
}
