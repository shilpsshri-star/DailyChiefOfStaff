// Supabase client. Server-only -- every call site in this app is an API
// route that has already verified the Clerk session via requireUserId()
// before touching the database, so the admin client (service role key)
// is used throughout and Row Level Security is left with no policies
// (see migration.sql) to block any accidental client-side use of the
// anon key from reading/writing this data.
//
// IMPORTANT: SUPABASE_SERVICE_ROLE_KEY must be the *service_role* key from
// Supabase (Project Settings -> API -> "service_role" -- click Reveal),
// NOT the "anon public" key. The service role key bypasses Row Level
// Security; the anon key does not. Since migration.sql enables RLS with
// zero policies on every table, using the anon key here will make every
// single insert/select silently fail with a Postgres "permission denied"
// / "row-level security policy" error -- which is the single most common
// cause of "nothing is being written to Supabase" bug reports for this app.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;
let loggedInit = false;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    const message =
      `Supabase is not configured: missing ${missing.join(", ")}. ` +
      "Set these in Vercel -> Project -> Settings -> Environment Variables " +
      "(values come from your Supabase project's Settings -> API page), " +
      "then redeploy.";
    console.error("[supabase:init]", message);
    throw new Error(message);
  }

  // A common misconfiguration: pasting the "anon public" key into
  // SUPABASE_SERVICE_ROLE_KEY by mistake. Both are JWTs, but the anon key's
  // payload has role "anon" instead of "service_role" -- decode just the
  // payload (no signature check needed, this is just a sanity check, not
  // an auth boundary) to catch this before it causes confusing silent RLS
  // failures on every single query.
  try {
    const payloadB64 = serviceKey!.split(".")[1];
    if (payloadB64) {
      const json = Buffer.from(payloadB64, "base64").toString("utf8");
      const payload = JSON.parse(json) as { role?: string };
      if (payload.role && payload.role !== "service_role") {
        console.error(
          "[supabase:init]",
          `SUPABASE_SERVICE_ROLE_KEY looks like a "${payload.role}" key, not ` +
            'a "service_role" key. Copy the service_role key from Supabase ' +
            "Settings -> API instead (click Reveal next to service_role), " +
            "or every insert will silently fail Row Level Security."
        );
      }
    }
  } catch {
    // Not a decodable JWT shape -- ignore, this is just a best-effort check.
  }

  adminClient = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!loggedInit) {
    console.log("[supabase:init] Supabase admin client initialized.");
    loggedInit = true;
  }

  return adminClient;
}
