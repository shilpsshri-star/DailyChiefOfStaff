# Daily Chief of Staff

A personal AI chief of staff built with Next.js. It has five pages:

1. **Onboarding** — set your 5 goals and your task list. Free to try as a guest, no sign-in required.
2. **Morning Briefing** — Claude reads your goals/tasks and gives your top 3 priorities for today, with reasoning. *(Requires sign-in.)*
3. **Chat** — talk to your chief of staff any time; it always has your goals and tasks as context. *(Requires sign-in.)*
4. **End of Day** — check off what you got done; Claude writes a short summary and a nudge for tomorrow. *(Requires sign-in.)*
5. **Progress Dashboard** — daily/weekly/monthly completion stats, a streak counter, achievement badges, and a Memory Lane timeline of every past day. *(Requires sign-in.)*

Data is stored in Vercel KV (a free, serverless key-value store), namespaced per user. The AI is powered by the Anthropic API (Claude). Authentication is handled by **Clerk**, with **Google and LinkedIn sign-in only** — there's never a username or password. Anyone can try Onboarding as a guest (saved locally in their browser); signing in migrates that draft to their permanent account and unlocks everything else.

---

## Get this code onto GitHub (no command line)

1. Unzip the file you downloaded (`daily-chief-of-staff.zip`) somewhere on your computer. You should see a folder called `daily-chief-of-staff` with `app`, `lib`, `components`, `package.json`, etc. inside.
2. Go to your repo: https://github.com/shilpsshri-star/DailyChiefOfStaff
3. Click **Add file → Upload files**.
4. Open the unzipped `daily-chief-of-staff` folder on your computer, select **everything inside it** (not the folder itself — its contents), and drag all of it into the GitHub upload box. Most browsers (Chrome, Edge) will preserve the folder structure (e.g. `app/onboarding/page.tsx`) as you drag a selection that includes subfolders.
   - If drag-and-drop flattens folders or skips files in your browser, do it in a couple of batches: drag `app`, `components`, and `lib` in one batch, then drag the root files (`package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `.gitignore`, `.env.example`, `README.md`, `middleware.ts`) in another.
5. Scroll down, add a commit message like "Initial app", and click **Commit changes** (commit directly to `main`).
6. Refresh the repo page and confirm you see the `app/`, `lib/`, and `components/` folders with files inside them.

You do **not** need to upload a `node_modules` folder — it isn't included in the zip, and Vercel installs dependencies automatically during deployment.

---

## Deploy on Vercel (no command line)

1. Go to https://vercel.com and sign in (you can sign in with your GitHub account).
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

1. In your new Vercel project, go to the **Storage** tab.
2. Click **Create Database → KV** (Upstash-backed Redis under the hood), give it a name, and create it.
3. On the screen that follows, click **Connect Project** and select your `DailyChiefOfStaff` project. This automatically adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` (and a couple of related variables) to your project's environment variables — you don't need to type these in yourself.
4. Go to the **Deployments** tab, open the latest deployment, and click **Redeploy** so it picks up the new KV variables.

### Verify it works

1. Open your live URL (Vercel shows it on the project Overview page, something like `daily-chief-of-staff.vercel.app`).
2. Go to `/onboarding` — you can fill in goals/tasks right away as a guest (sav