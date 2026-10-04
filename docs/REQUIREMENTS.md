# Household Expense Tracker — Requirements (v0.1, draft for review)

> Status: **Approved (v1.0).** Phase 1 is built. Your decisions are recorded in
> [Section 10](#10-decisions).

---

## 1. Goal

Make adding a household expense, with the right category, take **under 10
seconds**, so you actually log everything. The data should then be good enough
to answer, later on:

- Where does our money go?
- How much of it is **necessary** and how much is **discretionary**?
- Are we on track against our budgets this month?

**Phase 1 (this deliverable):** fast capture, categorisation, budgets and budget alerts.
**Phase 2 (later):** analysis dashboards, trends, planning.

### Out of scope for Phase 1
- User accounts, sign-up and roles (see the one exception in §7.3: a single shared passcode to keep the data private)
- Bank account linking or automatic import
- Analytics dashboards beyond a simple "this month" summary
- Multiple households

---

## 2. Platform: one web app that installs like a phone app

The app is a **Progressive Web App (PWA)**: a website that you "Add to Home
Screen" on Android or iPhone. It then opens full-screen with its own icon, like
a native app, and you don't need the App Store or Play Store.

| Concern | Approach |
|---|---|
| Android | Chrome → menu → *Install app* |
| iPhone | Safari → Share → *Add to Home Screen* (needed for notifications on iOS 16.4+) |
| Desktop | Works in any browser too, which is handy for bulk review |
| Offline | Manual entries work offline and sync when you're back online. AI parsing needs a connection. |

---

## 3. Data structure (two levels)

### 3.1 The core idea: Transaction → Line items

Every expense is stored as a **Transaction** (the receipt or payment) with one
or more **Line items** (what was actually bought). **Category and
necessary/discretionary are set on each line item**, not on the transaction.
That's what allows a single grocery bill to be split correctly.

```
Transaction: Tesco, 12 Oct, £23.40, Card
 ├─ Line item: Bread, eggs, milk      £8.20   Groceries › Staples      NECESSARY
 ├─ Line item: Chicken, vegetables    £9.70   Groceries › Fresh food   NECESSARY
 └─ Line item: Crisps, chocolate      £5.50   Groceries › Snacks       DISCRETIONARY
```

A simple expense (for example "Uber £12") is just a transaction with **one**
line item. You never see the two levels unless you need them: the quick-add
screen creates the single line item for you.

### 3.2 Entities and fields

**Transaction**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | auto | |
| date | date (+ optional time) | ✅ | Defaults to today |
| merchant | text | – | "Tesco", "Uber". Used to learn categories. |
| total_amount | decimal | ✅ | Must equal the sum of line items (see 3.4) |
| currency | ISO code | ✅ | PKR |
| payment_method | enum | – | Card / Cash / Bank transfer / Mobile wallet / Other |
| notes | text | – | |
| source | enum | auto | `manual`, `text`, `photo`, `share` |
| raw_input | text | auto | The original pasted text, kept for audit and re-parsing |
| receipt_image | file | – | Kept for 60 days after upload, then deleted automatically |
| status | enum | auto | `confirmed` or `needs_review` (see §4.6) |
| created_at / updated_at | timestamp | auto | |

**Line item**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | auto | |
| transaction_id | uuid | ✅ | Parent |
| description | text | – | "Bread, eggs" |
| amount | decimal | ✅ | |
| category_id | ref | ✅ | Must be a **subcategory** (leaf) |
| necessity | enum | ✅ | `necessary` · `discretionary` (defaults from the subcategory, can be overridden per item) |
| quantity | number | – | Optional, for receipts |

### 3.3 Categories are also two levels

**Category → Subcategory.** Each subcategory carries a **default necessity**,
so most items are classified automatically. You can override it on any item:
a "Clothing" item can be necessary (school shoes) or discretionary (a third
jacket).

Proposed starter set (fully editable in Settings):

| Category | Subcategories (default necessity: **N** = necessary, **D** = discretionary) |
|---|---|
| Groceries | Staples **N**, Fresh food **N**, Household supplies **N**, Snacks & sweets **D**, Drinks & alcohol **D** |
| Eating out | Restaurants **D**, Takeaway/delivery **D**, Coffee & snacks **D**, Work lunches **N** |
| Housing | Rent/mortgage **N**, Maintenance **N**, Furniture & decor **D** |
| Utilities | Electricity/gas **N**, Water **N**, Internet & phone **N**, Streaming subscriptions **D** |
| Transport | Fuel **N**, Public transport **N**, Taxi/ride-hail **D**, Car maintenance **N**, Parking **N** |
| Health | Medical **N**, Pharmacy **N**, Fitness **D** |
| Children | School & childcare **N**, Clothing **N**, Activities **D**, Toys **D** |
| Personal | Clothing **D**, Personal care **N**, Hobbies **D**, Gifts **D** |
| Insurance & finance | Insurance **N**, Bank fees **N**, Loan repayments **N** |
| Travel | Flights **D**, Accommodation **D**, Holiday spending **D** |
| Other | Uncategorised (**needs review**) |

### 3.4 Rules and edge cases

- **Line items must add up to the total.** If they don't (tax, discounts, delivery fees, rounding), the app shows the difference. You can either spread it proportionally across the items (the default) or add it as its own line item.
- **Refunds** are transactions with a negative amount. They reduce spending in that category.
- **Merchant memory:** when you categorise "Costa" as *Eating out › Coffee*, the app remembers it and pre-fills that category next time. This is the biggest time-saver.
- **Item memory (AI):** the AI is told your past corrections (e.g. "Pringles → Snacks, discretionary") so its suggestions get better over time.
- **Splitting an existing expense:** any single-item transaction can be split into more line items later.

### 3.5 Budgets

| Field | Notes |
|---|---|
| scope | A **category** or a **subcategory** (e.g. all of *Eating out*, or just *Takeaway*). Optionally "all discretionary spending". |
| amount | per period |
| period | Monthly (Phase 1). Starts on the 1st |
| thresholds | Default **50%, 75%, 90%, 100%**, editable per budget |
| alerted_thresholds | Tracks which alerts have already fired this period, so you aren't alerted twice |

Budgets are calculated from **line items**, so the snacks on a grocery bill
count toward a "Snacks" budget and not toward "Staples".

---

## 4. Data input

### 4.1 Home screen = capture screen

Opening the app goes straight to a capture screen with one large input box and
four ways to add:

```
┌─────────────────────────────────┐
│  October: £1,240 spent          │
│  Eating out ███████░░░ 72%      │  ← budget bars
├─────────────────────────────────┤
│  [ Paste or type anything… ]    │  ← smart box
│                                 │
│  [📷 Photo] [✍️ Manual] [📋 Paste]│
├─────────────────────────────────┤
│  Recent  ·  Needs review (2)    │
└─────────────────────────────────┘
```

### 4.2 Method A: Manual quick-add (works offline, no AI)

1. Type the amount (the number pad opens automatically).
2. Tap a category chip. Your **6 most-used subcategories** are shown first, with search for the rest.
3. Optionally add a merchant (autocomplete), a date (defaults to today) and a note.
4. Tap **Save**. That's 2 taps plus typing the amount.

The necessity flag is filled in from the subcategory. A "Split into items"
button turns the entry into a multi-item transaction.

### 4.3 Method B: Paste free text (AI)

Paste anything: a bank SMS, an email receipt, a WhatsApp message, or your own
shorthand.

Examples the app must handle:
- `Your card ending 4321 was charged GBP 23.40 at TESCO STORES 2041 on 12/10`
- `uber 12.50 yesterday`
- `tesco 23.40 — bread eggs milk 8.20, chicken veg 9.70, crisps 5.50`
- A full order-confirmation email from Amazon or Deliveroo with several items

The AI returns a **draft transaction** with line items, categories, necessity
and a confidence level for each field. You then see the **review screen**
(§4.5).

### 4.4 Method C: Photo or screenshot (AI)

- Take a photo of a paper receipt, or pick a screenshot (banking app, order page).
- The AI reads the merchant, date, total and **individual items**, groups them by subcategory, and produces a draft as in 4.3.
- Long receipts: similar items are grouped (e.g. "Fresh food: 7 items, £14.20") so you don't have to review 40 rows. You can expand a group to see what's in it.

### 4.5 Method D: Share to app (Android, Phase 1 if feasible)

On Android, the installed app appears in the **Share** menu, so you can share
an SMS or screenshot straight into it. iOS doesn't allow this for web apps. The
workaround there is an iOS **Shortcut**, which I can set up as a follow-up.

### 4.6 Review and "ask for missing context"

Every AI-parsed entry goes through a **review card** before it's saved:

- Fields the AI was confident about are shown normally.
- Fields that are **missing or low-confidence** are highlighted and turned into **specific one-tap questions**, never a blank form. For example:
  - *"Which category is 'AMZN Mktp £34.99'?"* → chips: Household · Personal · Children · Other
  - *"Were the 'snacks' for the household (necessary) or a treat (discretionary)?"*
  - *"Date not found. Was this today or yesterday?"*
  - *"Items add up to £21.40 but the total is £23.40. Add £2.00 as 'Delivery fee'?"*
  - *"Is this a single purchase or should I split it by item?"* (when the text hints at multiple items)
- **Save** stays available at all times. Skipping a question saves the entry as `needs_review`, and it appears in the **Needs review** list. Capture is never blocked.
- One-tap **"Always categorise this merchant this way"** checkbox.

### 4.7 Duplicate detection

If a new entry matches an existing one (same amount and merchant within ±2
days), for example when you paste the bank SMS after already photographing the
receipt, the app warns you and offers to **merge** the two.

---

## 5. Budget alerts

### 5.1 How alerts work

A budget can only cross a threshold **when an expense is added**, so the check
runs every time a transaction is saved.

| Channel | Phase | Who sees it |
|---|---|---|
| **In-app alert** after saving (e.g. "Eating out is at 76% of £300, £72 left, 18 days to go") | **Phase 1** | The person adding the expense |
| Coloured budget bars on the home screen (green < 75%, amber 75–99%, red ≥ 100%) | **Phase 1** | Everyone |
| Push notifications to other phones | Not planned (not needed for now) | – |
| Weekly summary notification | Phase 2 | Everyone |


### 5.2 Alert rules
- Each threshold fires **once per budget per period**.
- If one expense jumps several thresholds (e.g. 40% → 80%), only the highest one is shown.
- Deleting or editing an expense recalculates the budget, but alerts that already fired aren't repeated.
- Alerts include **pace**: "You've used 76% of the budget with 60% of the month gone."

---

## 6. Other Phase 1 screens

- **Transactions list:** search, filter by month or category, tap to edit, swipe to delete.
- **Needs review:** entries with unanswered questions.
- **This month summary:** total spent, necessary vs discretionary split, and the budget list. This is a simple view; full analytics come in Phase 2.
- **Settings:** categories and subcategories (with default necessity), budgets, household members, currency, merchant rules, and **Export to CSV** (your data is always yours).

---

## 7. Technical approach

### 7.1 Stack (existing libraries to keep the build small)

| Layer | Choice | Why |
|---|---|---|
| UI framework | **React + TypeScript + Vite** | Industry standard, fast |
| Component library | **Mantine UI** | Polished mobile-friendly components out of the box (forms, chips, number inputs, drawers, notifications), so there's almost no custom styling |
| PWA | **vite-plugin-pwa** | Installable app, offline support |
| Database + sync | **Supabase** (hosted Postgres, free tier) | Data is shared across all household phones, has built-in file storage for receipts, and needs no server to manage |
| AI parsing | **Claude API** via a small serverless function | Reads text and receipt photos into structured line items |
| Hosting | **Vercel** (free tier), connected to the GitHub repo | Every push to GitHub redeploys automatically |

### 7.2 About your Claude subscription (important)

Your **Claude chat subscription (Pro/Max) can't be used by an app**. The app
needs a separate **Claude API key** from console.anthropic.com, which is billed
per use.

Rough cost for this app, based on current API prices:

| Model | Approx. cost per receipt photo | ~150 entries / month |
|---|---|---|
| Claude Opus 5.5 (most accurate, my default) | ~2–3¢ | ~$3–5 |
| Claude Sonnet 5.5 | ~1–2¢ | ~$2–3 |
| Claude Haiku 4.5 (cheapest) | < 1¢ | < $1 |

Pasted text costs less than photos. You can set a **monthly spend limit** in
the Anthropic console (e.g. $10) so there are no surprises. Manual entry
never uses the API.

What your Claude subscription *is* good for is this conversation: designing,
building and fixing the app with Claude Code.

### 7.3 Privacy and security without "user management"
- There are no accounts. The app is protected by **one household passcode** (entered once per device and remembered). Without it, anyone who found the URL could read your finances.
- The Claude API key lives only on the server (Vercel), never in the app code, and never in GitHub.
- Receipt photos are stored privately in Supabase and are only viewable inside the app.

---

## 8. What you'll need to do (I'll guide you step by step)

I'll give you click-by-click instructions for each of these when we get there:

1. **GitHub:** nothing yet. I'll push code to this repo on the branch `claude/nice-bell-sjjpbp` and open a pull request for you to review and merge.
2. **Supabase:** create a free account and project (about 5 min), then paste 2 values into Vercel.
3. **Anthropic API:** create an account at console.anthropic.com, add a small credit (e.g. $5–10), set a spend limit, and create an API key.
4. **Vercel:** sign in with GitHub, import this repo, paste the keys as "Environment Variables", and click Deploy. You get a URL like `your-app.vercel.app`.
5. **Phones:** open the URL and choose *Add to Home Screen*.

Running cost: **$0 hosting** (free tiers) plus **API usage only** (~$1–5/month).

---

## 9. Delivery plan

| Milestone | Contents | You can… |
|---|---|---|
| **M1: Skeleton** | App shell, PWA install, categories, manual quick-add, transaction list, local storage | Install it on your phone and log expenses manually |
| **M2: Sync** | Supabase, passcode, shared data across phones, CSV export | Use it as a household |
| **M3: Smart input** | Paste text and photo → AI draft → review card with questions, merchant memory, duplicate check | Log a whole grocery receipt in seconds |
| **M4: Budgets** | Budgets, progress bars, in-app threshold alerts | Get warned at 50/75/90/100% |
| *Phase 2* | Analytics, trends, necessary-vs-discretionary reports, planning | Plan and budget |

Each milestone is a pull request you can try on a preview link before merging.

### Acceptance criteria for Phase 1
- [ ] A manual expense can be saved in ≤ 3 taps plus the amount.
- [ ] Pasting a typical bank SMS produces a correct draft (amount, merchant, date, category) without edits in most cases.
- [ ] A photo of a mixed grocery receipt produces separate necessary and discretionary line items that add up to the total.
- [ ] Missing information is asked as specific questions, and saving is never blocked.
- [ ] Budget alerts fire exactly once at each threshold.
- [ ] Works when installed on both an Android phone and an iPhone.
- [ ] Data can be exported to CSV.

---

## 10. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Currency | **PKR** only |
| 2 | Household members and alerts | No "paid by" field and no push notifications. Budget alerts show in the app on the phone that logs the expense. |
| 3 | AI parsing | **Claude API key**, using Claude Opus 5.5 |
| 4 | Receipt photos | Keep after parsing, **delete after 60 days** |
| 5 | Budget month | Starts on the **1st** |
| 6 | Categories | Starter list as in §3.3 |
| 7 | Bank SMS samples | Not needed |
| 8 | Hosting | **Supabase + Vercel** free tiers |

### Implementation notes
- "One household passcode" is a single Supabase login. The app fills in its email, so you only type the password.
- Receipt cleanup runs when the app opens: photos older than 60 days are removed, and the expense itself is kept.
- Long receipts are grouped by subcategory (e.g. "Bread, eggs, milk") rather than shown as expandable groups.
- Android "Share to app" supports text (SMS, emails). Sharing images in, and the iOS Shortcut, are possible follow-ups.
- The API call has Anthropic's server-side fallback switched on: if Opus 5.5 declines a request, the API retries it on another model automatically.
