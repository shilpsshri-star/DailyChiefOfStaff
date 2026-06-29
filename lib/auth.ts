import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureUser } from "./db";

// Small helper so every API route can do:
//   const userId = await requireUserId();
//   if (!userId) return unauthorized();
//
// Also doubles as the safety net that guarantees a `users` row exists for
// every signed-in caller -- even if the Clerk webhook (app/api/webhooks/clerk)
// hasn't been configured in the Clerk Dashboard yet, or fired before this
// request landed. This runs on every authenticated API call, so the very
// first authenticated request after sign-in creates the row. Failures here
// are logged (by ensureUser/getSupabaseAdmin) but never block the request --
// if Supabase is genuinely unreachable, the route's own query just below
// this will fail loudly with the same logged error anyway.
export async function requireUserId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  try {
    await ensureUser(userId);
  } catch (err) {
    // Already logged inside ensureUser with a "[db:ensureUser]" tag. Don't
    // throw here -- let the calling route's own Supabase call surface the
    // real error with full context instead of a generic one from this
    // shared helper.
    console.error("[auth:requireUserId] ensureUser failed", err);
  }

  return userId;
}

export function unauthorized() {
  return NextResponse.json(
    { error: "Sign in with Google or LinkedIn to use this." },
    { status: 401 }
  );
}
