# Daily Chief of Staff

A personal AI chief of staff built with Next.js. It turns a handful of free-text goals into a concrete, daily-driven execution plan.

## The workflow

1. **Onboarding** (once per user) — write 1-5 goals as free text, no structure required. Saved permanently per user in Vercel KV. Guests can try this without signing in (saved locally in the browser); signing in migrates the draft to the permanent account.
2. **Goal Activation** (`/goals`, per goal, user-triggered) — pick a goal and activate it:
   - Claude breaks the goal into 3-5 milestones. You confirm or edit each one.
   - Claude breaks the first milestone into 5-7 concrete steps, each with a clear output, an estimated number of days, and dependencies on earlier steps. You confirm before it activates.
3. **Daily Loop** (`/daily`) — the day-to-day driver:
   - **Morning:** Claude picks 3 focus items from your active steps and explains why each one matters today.
   - **Evening:** you mark each item done / blocked / skipped with a one-line reason. Claude adjusts the plan based on what actually happened.
4. **Weekly Review** (`/weekly`, auto-triggered every 7 days) — Claude summarizes what moved, what's stuck, replans the next sprint, and calls out an explicit win to celebrate.
5. **Progress Dashboard** (`/dashboard`) — daily/weekly/monthly completion stats, a streak counter, achievement badges, and a Memory Lane you can click through to see what you worked on on any past day.

All of this (except Onboarding for guests) requires sign-in.

Data is stored in Vercel KV (a free, serverless key-value store), namespaced per user. The AI is powered by the Anthropic API (`claude-sonnet-4-6`). Authentication is handled by **Clerk**, with **Google and LinkedIn sign-in only** — there's never a username or password.

---

## Get this code onto GitHub (no command line)

1. Unzip the file you downloaded somewhere on your computer. You should see a folder with `app`, `lib`, `components`, `package.json`, etc. inside.
2. Go to your repo: https://github.com/shilpsshri-star/DailyChiefOfStaff
3. Click **Add file → Upload files**.
4. Open the unzipped folder, select **everything inside it** (not the folder itself — its contents), and drag all of it into the GitHub upload box. Most browsers (Chrome, Edge) preserve folder structure as you drag a selection that includes subfolders.
   - If drag-and-drop flattens folders or skips files in your browser, do it in a couple of batches: drag `app`, `components`, and `lib` in one batch, then drag the root files (`package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `.gitignore`, `.env.example`, `README.md`, `middleware.ts`) in another.
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
6. Click **Deploy**. The first deploy may show errors about missing KV/Clerk variables — that's expected, fix it next.

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

### Add Vercel KV storage

1. In your Vercel project, go to the **Storage** tab.
2. Click **Create Database → KV** (Upstash-backed Redis under the hood), give it a name, and create it.
3. On the screen that follows, click **Connect Project** and select your `DailyChiefOfStaff` project. This automatically adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` (and related variables) to your project's environment variables — you don't need to type these in yourself.
4. Go to the **Deployments** tab, open the latest deployment, and click **Redeploy** so it picks up the new KV variables.

### Verify it works

1. Open your live URL (Vercel shows it on the project Overview page).
2. Go to `/onboarding` — add 1-5 goals as a guest (saved locally) or signed in (saved to your account).
3. Sign in with Google or LinkedIn, then go to `/goals`, pick a goal, and activate it (confirm milestones, then confirm steps for the first milestone).
4. Go to `/daily` and generate today's 3 focus items, then submit an evening check-in.
5. After 7 days of activity, `/weekly` will generate your first Weekly Review.
6. Check `/dashboard` for streaks, badges, and Memory Lane.

---

## Project structure

- `lib/types.ts` — the Goal → Milestone → Step data model, plus `DailyLog`, `WeeklyReview`, `UserStats`, and `Badge`.
- `lib/kv.ts` — Vercel KV access, namespaced per Clerk `userId`, with an in-memory fallback for local dev.
- `lib/planner.ts` — Anthropic Claude prompt helpers: breaking goals into milestones, milestones into steps, picking daily focus, replanning from results, and the weekly review.
- `lib/goals.ts` — pure helpers for walking and recomputing status across the goal tree.
- `lib/stats.ts` — streak, badge, and completion-stat engine.
- `app/onboarding`, `app/goals`, `app/daily`, `app/weekly`, `app/dashboard` — the five pages described above.
- `app/api/...` — the corresponding API routes for goals/milestones/steps, the daily loop, the weekly review, and stats.

The old Morning Briefing, Chat, and End of Day pages/routes have been retired in favor of the Goal Activation and Daily Loop flow above; they now redirect or return `410 Gone`.
