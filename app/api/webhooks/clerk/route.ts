import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { ensureUser } from "@/lib/db";

// Clerk webhook: creates/updates the Supabase `users` row the moment someone
// signs up or changes their email, rather than waiting for their first
// authenticated API call. (lib/auth.ts's requireUserId() also calls
// ensureUser() as a safety net on every request, so the user row gets
// created even if this webhook isn't configured -- but configuring it gives
// the row a real email immediately, instead of only an id.)
//
// Setup (Clerk Dashboard -> Webhooks -> Add Endpoint):
//   URL:          https://<your-domain>/api/webhooks/clerk
//   Events:       user.created, user.updated
//   After creating it, copy the "Signing Secret" into the
//   CLERK_WEBHOOK_SIGNING_SECRET environment variable in Vercel and redeploy.
export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error("[webhooks:clerk] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const user = evt.data;
    const primaryEmail =
      user.email_addresses?.find(
        (e) => e.id === user.primary_email_address_id
      )?.email_address ?? user.email_addresses?.[0]?.email_address ?? null;

    try {
      await ensureUser(user.id, primaryEmail);
    } catch (err) {
      // Already logged inside ensureUser. Still return 500 so Clerk retries
      // the webhook delivery instead of silently dropping it.
      console.error("[webhooks:clerk] ensureUser failed", err);
      return NextResponse.json({ error: "Failed to sync user" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
