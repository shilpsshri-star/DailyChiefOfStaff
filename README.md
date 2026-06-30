# Daily Chief of Staff

A personal AI chief of staff built with Next.js. It turns a handful of free-text goals into a concrete, daily-driven execution plan.

## The workflow

1. **Onboarding** (once per user) — write 1-5 goals as free text, no structure required. Saved permanently per user in Supabase (Postgres). Guests can try this without signing in (saved locally in the browser); signing in migrates the draft to the permanent account.
2. **Goal Activation** (`/goals`, per goal, user-triggered) — pick a goal and activate it:
   - Claude breaks the goal into 3-5 milestones. You confirm or edit each one.
   - Confirming kicks off step generation for **every** milestone at once (not just the first): each gets 5-7 concrete steps, and each step names a specific action, a suggested resource or tool, a clear deliverable output, and an estimated time in hours. You can review and edit any milestone's steps before they activate.
3. **Daily Loop** (`/daily`) — the day-to-day driver:
   - **Morning:** Claude picks the top 3 focus items from across every confirmed, not-yet-completed milestone on every active goal (not just one milestone) and explains why each one matters today.
   - **Evening:** you mark each item done / blocked / skipped with a one-line reason. Claude adjusts the plan based on what actually happened.
4. **Weekly Review** (`/weekly`, auto-triggered every 7 days) — Claude summarizes what moved, what's stuck, replans the next sprint, and calls out an explicit win to celebrate.
5. **Progress Dashboard** (`/dashboard`) — daily/weekly/monthly completion stats, a streak counter, achievement badges, and a Memory Lane you can click through to see what you worked on on any past day.

All of this (except Onboarding for guests) requires sign-in.

Data is stored in Supabase (Postgres), namespaced per user via row-level `user_id` columns. The AI is powered by the Anthropic API (`claude-sonnet-4-6`). Authentication is handled by **Clerk**, with **Google and LinkedIn sign-in only** — there's never a username or password.

---

## Get this code onto GitHub (no command line)

1. Unzip the file you downloaded somewhere on your computer. You should see a folder with `app`, `lib`, `components`, `package.json`, etc. inside.
2. Go to your repo: https://github.com/shilpsshri-star/DailyChiefOfStaff
3. Click **Add file → Upload files**.
4. Open the unzipped folder, select **everything inside it** (not the folder itself — its contents), and drag all of it into the GitHub upload box. Most browsers (Chrome, Edge) preserve folder structure as you drag a selection that includes subfolders.
   - If drag-and-drop flattens folders or skips files in your browser, do it in a couple of batches: drag `app`, `components`, and `lib` in one batch, then drag the root files (`package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `.gitignore`, `.env.example`, `README.md`, `middleware.ts`, `migration.sql`) in another.
5. Scroll down, add a commit message, and click **Commit changes** (commit directly to `main`).
6. Refresh the repo page and confirm you see the `app/`, `lib/`, and `components/` folders with files inside them.

You do **not** need to upload a `node_modules` folder — Vercel installs dependencies automatically during deployment.

---

## Deploy on Vercel (no command line)

1. Go to https://vercel.com and sign in (you can use your GitHub account).
2. Click **Add New… → Project**.
3. Select your `DailyChiefOfStaff` GitHub repo and click **Import**.
4. Leave the framework preset as **Next.js** (Vercel auto-detects it).
5. Before deploying, open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` → your key from https://console.anthropic.com/settings/keys
   - `ANTHROPIC_MODEL` → `claude-sonnet-4-6`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` → from the Clerk setup below (you can deploy first and add these after if it's easier — just redeploy once they're in).
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` → from the Supabase setup below.
   - `CLERK_WEBHOOK_SIGNING_SECRET` → optional but recommended, from the webhook setup below.
6. Click **Deploy**. The first deploy may show errors about missing Supabase/Clerk variables — that's expected, fix it next.

### Set up Clerk (Google + LinkedIn sign-in, no passwords)

1. Go to https://dashboard.clerk.com and sign up (free tier is plenty for this app).
2. Click **Create application**. Give it a name like "Daily Chief of Staff".
3. On the "How will your users sign in?" screen (or under **User & Authentication → Social Connections** afterward):
   - Turn **ON** Google.
   - Turn **ON** LinkedIn.
   - Turn **OFF** Email and **OFF** Password (and any other sign-in method) — this guarantees the only options users ever see are "Continue with Google" and "Continue with LinkedIn."
4. Go to **API Keys** in the left sidebar. Copy the **Publishable key** and **Secret key**.
5. In your Vercel project, go to **Settings → Environment Variables** and add:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → the publishable key
   - `CLERK_SECRET_KEY` → the secret key
6. Go to the **Deployments** tab and **Redeploy** so the new variables take effect.
7. Back in Clerk, go to **Domains** and add your live Vercel URL (e.g. `daily-chief-of-staff.vercel.app`) as an allowed domain so sign-in works in production, not just locally.

That's it — no extra code changes needed. Google/LinkedIn-only is a Clerk Dashboard setting, not something hardcoded in the app.

### Switch to a Clerk Production instance (fixes the "development keys" warning)

Every Clerk application has two separate instances — **Development** and **Production** — each with its own keys (`pk_test_…`/`sk_test_…` vs `pk_live_…`/`sk_live_…`) and its own Google/LinkedIn OAuth setup. If your live site's browser console shows `Clerk has been loaded with development keys`, it means the Vercel env vars are still pointing at the dev instance's `pk_test_`/`sk_test_` keys. Development instances have strict rate limits and aren't meant for real users, so this needs to be fixed before sharing the site.

1. In the Clerk Dashboard, open your app and switch to the **Production** instance using the environment switcher near the top of the left sidebar (it defaults to Development).
2. Go to **Domains** and add your real production domain (`stostr.com`, and `www.stostr.com` if you use that too).
3. Go to **User & Authentication → Social Connections** in the Production instance and turn Google and LinkedIn back **ON** (this is a separate toggle from Development — it does not carry over). For a production instance, Clerk requires you to supply your **own** OAuth credentials instead of using its shared dev ones:
   - **Google**: create an OAuth Client ID in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (type "Web application"), add the **Authorized redirect URI** Clerk shows you on that Social Connections screen, then paste the **Client ID** and **Client Secret** into Clerk.
   - **LinkedIn**: same idea, via the [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps) — create an app, request the "Sign In with LinkedIn" product, add Clerk's redirect URI, then paste the Client ID/Secret into Clerk.
4. Go to **API Keys** in the Production instance and copy the **Publishable key** (`pk_live_…`) and **Secret key** (`sk_live_…`).
5. In Vercel, go to **Settings → Environment Variables**, edit `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to the new `pk_live_`/`sk_live_` values (make sure they're set for the **Production** environment), then go to **Deployments** and **Redeploy**.
6. Reload the live site and check the browser console — the development-keys warning should be gone, and Google/LinkedIn sign-in should still work end to end.

Keep the Development instance around for local testing (`npm run dev`) — just make sure your local `.env.local` keeps the `pk_test_`/`sk_test_` keys while Vercel's production env vars use the `pk_live_`/`sk_live_` ones.

### Set up the Clerk webhook (recommended, not required)

Every authenticated API route already creates a user's Supabase row on its own (via `requireUserId()` in `lib/auth.ts`), so the app works without this step. Setting up the webhook just means the row gets the user's **email** attached immediately at sign-up, instead of only an id.

1. In Clerk, go to **Webhooks** in the left sidebar → **Add Endpoint**.
2. **Endpoint URL** → `https://<your-live-domain>/api/webhooks/clerk`
3. **Subscribe to events** → check `user.created` and `user.updated`.
4. Create the endpoint, then copy the **Signing Secret** it shows you.
5. In Vercel, add `CLERK_WEBHOOK_SIGNING_SECRET` with that value, then **Redeploy**.

### Set up Supabase (Postgres database)

1. Go to https://supabase.com and sign in (free tier is plenty for this app). Click **New project**, give it a name, and pick a database password (you won't need it day-to-day — the app connects via API keys, not the Postgres password).
2. Once the project is ready, open the **SQL Editor** in the left sidebar, click **New query**, paste in the entire contents of `migration.sql` from this codebase, and click **Run**. This creates the `users`, `goals`, `milestones`, `steps`, `daily_logs`, and `weekly_reviews` tables. **This step is required** — if you skip it, every Supabase read/write will fail (visibly, in the Vercel logs, once you have the latest code) because the tables don't exist yet.
3. Go to **Settings → API**. You'll need three values from this page:
   - **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (click "Reveal" — keep this one secret, never expose it to the browser) → this is `SUPABASE_SERVICE_ROLE_KEY`. **Double-check you copied the service_role key and not the anon key** — they're easy to mix up, and pasting the anon key into `SUPABASE_SERVICE_ROLE_KEY` is the single most common cause of "nothing is being saved" reports, because RLS (enabled with no policies, see below) silently blocks every anon-key write.
4. In your Vercel project, go to **Settings → Environment Variables** and add all three.
5. Go to the **Deployments** tab, open the latest deployment, and click **Redeploy** so it picks up the new variables.

The app only ever talks to Supabase from server-side API routes using the service role key, after first verifying the Clerk session — so the anon key isn't actually used yet (it's wired up for possible future client-side use). Row Level Security is enabled on every table with no policies, which blocks any accidental client-side access using the anon key.

### Verify it works

1. Open your live URL (Vercel shows it on the project Overview page).
2. Go to `/onboarding` — add 1-5 goals as a guest (saved locally) or signed in (saved to your account).
3. Sign in with Google or LinkedIn, then go to `/goals`, pick a goal, and activate it (confirm milestones — this generates steps for every milestone automatically).
4. Go to `/daily` and generate today's focus items, then submit an evening check-in.
5. After 7 days of activity, `/weekly` will generate your first Weekly Review.
6. Check `/dashboard` for streaks, badges, and Memory Lane.
7. In Supabase, open **Table Editor** and confirm the `users`, `goals`, `milestones`, and `steps` tables actually have rows in them after the steps above.

### Troubleshooting: "Supabase tables are empty"

Every Supabase call in this app now logs the underlying error to the console before throwing (tagged `[db:...]` or `[supabase:init]`), so the real cause is visible in **Vercel → your project → Logs** (or **Observability → Logs**) right after you reproduce the problem. Look for one of these:

- **`[supabase:init] Supabase is not configured: missing ...`** — one or both of `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` isn't set in Vercel's Environment Variables, or you deployed before adding them and never redeployed after.
- **`[supabase:init] SUPABASE_SERVICE_ROLE_KEY looks like a "anon" key, not a "service_role" key`** — you pasted the wrong key from Supabase's API settings page. Go back to **Settings → API**, click **Reveal** next to **service_role**, and use that value instead.
- **A Postgres error mentioning `relation "..." does not exist`** — `migration.sql` was never run against this Supabase project (or was run against a different one than the keys point to). Run it from the Supabase SQL Editor.
- **A Postgres error mentioning `row-level security policy`** — same root cause as the wrong-key case above: the anon key is being used somewhere it shouldn't be.
- **No errors logged at all, but tables still empty** — confirm you're looking at the same Supabase project the live app's env vars point to (it's easy to create a second project while testing and forget to update Vercel), and confirm you're signed in (not browsing as a guest, which only saves to `localStorage` in your own browser).

A `users` row is created automatically the first time a signed-in user hits any authenticated API route (see `lib/auth.ts`), and again at sign-up if you've set up the Clerk webhook above — you don't need to do anything else to make that happen.

---

## MCP server: talk to your plan from Claude Desktop

`mcp-server/index.ts` is a small standalone [MCP](https://modelcontextprotocol.io) server that exposes your own goals/milestones/steps as tools — so you can ask Claude Desktop things like "what's my focus today", "mark step X done", or "push milestone Y's date back a week" without opening the web app. It reuses the exact same `lib/db.ts`, `lib/goals.ts`, and `lib/planner.ts` the web app uses, just over MCP instead of HTTP.

This is a **personal, single-user tool**, not a multi-tenant API — every call is scoped to one Clerk user id you set yourself. Don't share this server or its config with anyone else; it talks straight to Supabase with the service role key.

**Tools it exposes:**
- `list_goals` — every goal, with milestone status/progress/target dates.
- `get_daily_focus` — the AI's top 3 recommended steps right now (same picker the Daily Loop uses).
- `list_milestone_steps` — every step under a milestone, with status/resource/output/notes.
- `set_step_status` — mark a step pending/active/done/blocked/skipped (rolls up milestone/goal completion).
- `set_milestone_target_date` — set or clear a milestone's target date. If `GOOGLE_CALENDAR_ACCESS_TOKEN` is set (see below), this also creates an all-day event on your Google Calendar for the new date — this server acting as an MCP *client*, calling out to Google's own Calendar MCP server.

**Setup:**
1. `npm install` (adds `@modelcontextprotocol/sdk`, `zod`, and `tsx` alongside the existing dependencies). Needs Node 20.6+ (for `--env-file`, which `npm run mcp` uses to load `.env.local` the same way Next.js does) — `node -v` to check, upgrade if you're on an older Node.
2. In `.env.local`, set `MCP_USER_ID` to your own Clerk user id — open Supabase → Table editor → `users`, copy the `id` column for your row — plus the same `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `ANTHROPIC_API_KEY` the web app already uses. `GOOGLE_CALENDAR_ACCESS_TOKEN` is optional, only needed for the calendar sync described above.
3. Test it runs: `npm run mcp` (it should print "Daily Chief of Staff MCP server running on stdio." to stderr and then sit waiting for input — Ctrl+C to stop).
4. Add it to Claude Desktop: **Settings → Developer → Edit Config**, add an entry under `mcpServers`:
   ```json
   {
     "mcpServers": {
       "daily-chief-of-staff": {
         "command": "npx",
         "args": ["tsx", "/absolute/path/to/daily-chief-of-staff/mcp-server/index.ts"],
         "env": {
           "MCP_USER_ID": "user_...",
           "NEXT_PUBLIC_SUPABASE_URL": "https://...supabase.co",
           "SUPABASE_SERVICE_ROLE_KEY": "...",
           "ANTHROPIC_API_KEY": "sk-ant-...",
           "GOOGLE_CALENDAR_ACCESS_TOKEN": "optional, see above"
         }
       }
     }
   }
   ```
   Restart Claude Desktop, then start a new chat and ask it about your goals — it'll call these tools directly.

---

## Project structure

- `lib/types.ts` — the Goal → Milestone → Step data model, plus `DailyLog`, `WeeklyReview`, `UserStats`, and `Badge`.
- `lib/supabase.ts` — the Supabase admin client (service role key, server-side only). Validates env vars and the key's JWT role on first use, logging exactly what's wrong if misconfigured.
- `lib/db.ts` — the repository layer: loads/saves the whole Goal → Milestone → Step tree, daily logs, weekly reviews, and per-user onboarding/review-date metadata as Supabase queries. Every query logs its error (tagged `[db:...]`) before throwing.
- `lib/auth.ts` — wraps Clerk's `auth()`; also ensures the caller's Supabase `users` row exists on every authenticated request.
- `app/api/webhooks/clerk/route.ts` — optional Clerk webhook that creates/updates the `users` row (with email) the moment someone signs up.
- `migration.sql` — run this once in the Supabase SQL editor to create all the tables.
- `lib/planner.ts` — Anthropic Claude prompt helpers: breaking goals into milestones, milestones into steps, picking daily focus, replanning from results, and the weekly review.
- `lib/goals.ts` — pure helpers for walking and recomputing status across the goal tree.
- `lib/stats.ts` — streak, badge, and completion-stat engine, backed by the `stats` jsonb column on the `users` table.
- `app/onboarding`, `app/goals`, `app/daily`, `app/weekly`, `app/dashboard` — the five pages described above.
- `app/api/...` — the corresponding API routes for goals/milestones/steps, the daily loop, the weekly review, and stats.
- `mcp-server/index.ts` — standalone MCP server exposing your goals/milestones/steps as tools for Claude Desktop (or any MCP client). See "MCP server" above.
- `mcp-server/calendar-client.ts` — the MCP *client* half: connects out to Google's hosted Calendar MCP server to create an event when a milestone's target date is set. Optional, best-effort, skipped entirely if `GOOGLE_CALENDAR_ACCESS_TOKEN` isn't set.

The old Morning Briefing, Chat, and End of Day pages/routes have been retired in favor of the Goal Activation and Daily Loop flow above; they now redirect or return `410 Gone`.

`lib/kv.ts` is a leftover deprecation stub from the previous Vercel KV storage layer — nothing imports it anymore and it's safe to delete.
