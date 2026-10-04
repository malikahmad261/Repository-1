# Setup guide: from code to an app on your phone

This takes about **30 minutes**, once. You'll create three free accounts and
copy a few values between them. You don't need to install anything on your
computer.

| Service | What it does | Cost |
|---|---|---|
| **Supabase** | Stores your expenses and receipt photos so every phone sees the same data | Free |
| **Anthropic (Claude API)** | Reads pasted text and receipt photos | Pay per use, about $1–5/month |
| **Vercel** | Hosts the app at a web address and keeps the API key secret | Free |

Keep a notes app open as you go. You'll collect four values:

```
Supabase Project URL:       https://xxxx.supabase.co
Supabase publishable key:   sb_publishable_...
Household passcode:         (you choose it)
Anthropic API key:          sk-ant-...
```

---

## Step 1: Merge the code into `master` (GitHub)

Vercel publishes whatever is on your `master` branch.

1. Open your repository on GitHub and go to the **Pull requests** tab.
2. Open the pull request for `claude/nice-bell-sjjpbp`. (If there isn't one yet, ask Claude to open it.)
3. Click **Merge pull request**, then **Confirm merge**.

From now on, every change Claude makes arrives as a new pull request. Merging
it updates the app on your phone automatically within a minute or two.

---

## Step 2: Create the database (Supabase)

1. Go to **supabase.com**, click **Start your project** and sign in with GitHub.
2. Click **New project**:
   - **Name:** `household-expenses`
   - **Database password:** click *Generate a password*. You won't need it for this app, but save it anyway.
   - **Region:** pick the closest one to Pakistan (e.g. *South Asia (Mumbai)*).
   - Click **Create new project** and wait 1–2 minutes.
3. **Create the tables.** In the left sidebar open **SQL Editor**, then **New query**.
   - In another tab, open `supabase/schema.sql` in your GitHub repo, click the **Copy raw file** button (two overlapping squares, top right of the file), and paste the whole file into the query box.
   - Click **Run**. You should see *Success. No rows returned*.
4. **Create the household login.** Go to **Authentication → Users → Add user → Create new user**:
   - **Email:** `household@example.com` (exactly this; the app fills it in for you)
   - **Password:** your **household passcode**. Use at least 8 characters; this is what protects your data.
   - Tick **Auto Confirm User**, then click **Create user**.
5. **Block anyone else from signing up** (important). Go to **Authentication → Sign In / Providers** and switch **off** *Allow new users to sign up*. Click **Save**.
6. **Copy your keys.** Open **Project Settings → API Keys** (or click **Connect** at the top of the project page):
   - Copy the **Project URL** (`https://xxxx.supabase.co`).
   - Copy the **Publishable key** (`sb_publishable_…`). If you only see "anon / public", copy that instead.
   - ⚠️ Never copy the *secret* or *service_role* key into the app.

---

## Step 3: Get a Claude API key (Anthropic)

Your Claude chat subscription doesn't cover apps, so this is a separate, pay-as-you-go account.

1. Go to **console.anthropic.com** and sign up.
2. **Settings → Billing:** add credit, e.g. **$10**. That should last a few months.
3. **Settings → Limits:** set a **monthly spend limit** (e.g. $10) so there are no surprises.
4. **Settings → API Keys → Create key**, name it `household-expenses`, and copy it (`sk-ant-…`). It's only shown once.

---

## Step 4: Put the app online (Vercel)

1. Go to **vercel.com** and **Sign up with GitHub**. Choose the free *Hobby* plan.
2. Click **Add New… → Project**. Find `Repository-1` and click **Import**.
   - If it isn't listed, click **Adjust GitHub App Permissions** and give Vercel access to that repository.
3. **Framework Preset** should say **Vite**. Leave the build settings as they are.
4. Open **Environment Variables** and add these (name on the left, value on the right):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Supabase Project URL |
   | `VITE_SUPABASE_KEY` | your Supabase publishable key |
   | `ANTHROPIC_API_KEY` | your Anthropic API key |

5. Click **Deploy**. After about a minute you get a web address like `repository-1-xxxx.vercel.app`. You can rename it under **Settings → Domains**.

> Changed an environment variable later? Go to **Deployments**, open the ⋯ menu on the latest one and click **Redeploy**. The change only applies after a redeploy.

---

## Step 5: Install it on your phones

**Android (Chrome):** open your app's address, tap **⋮ → Add to Home screen** (or **Install app**).

**iPhone (Safari, not Chrome):** open the address, tap the **Share** button, then **Add to Home Screen**.

Open the app from the new icon and enter the household passcode. Each phone only needs it once.

**Try it:**
- Type an amount, tap a category, tap **Save**.
- Paste a bank SMS and tap **Read text**.
- Tap **Photo / screenshot** and take a picture of a receipt.
- On Android, share an SMS from your messages app and pick **Expenses** in the share sheet.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Wrong passcode" | Check the user in Supabase (Authentication → Users) has the email `household@example.com`, or reset its password there. |
| "AI reading is not set up yet" | `ANTHROPIC_API_KEY` is missing in Vercel. Add it, then **Redeploy**. |
| "The Claude API key is missing or invalid" | Create a new key in the Anthropic console, replace it in Vercel and redeploy. Also check you have credit. |
| The app says "Demo mode" | The Supabase variables are missing or misspelled in Vercel. Fix them and redeploy. |
| "Couldn't load data: … permission denied" | The SQL script didn't finish. Run `supabase/schema.sql` again; it's safe to re-run. |
| The app looks outdated after an update | Close it completely and reopen it. Updates install in the background. |

---

## For later: running it on a computer (optional)

You don't need this for the app to work.

```bash
npm install
cp .env.example .env   # fill in values, or leave Supabase empty for demo mode
npm run dev            # http://localhost:5173
npm test               # unit tests
```
