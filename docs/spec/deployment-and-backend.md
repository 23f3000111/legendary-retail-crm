# Where to host it, and what to build it on

**Date:** 2026-08-23, setup steps added 2026-09-22
**Status:** The shared server is built (`supabase/migrations/`). The steps to
switch it on are first; the reasoning behind the choices follows and is
unchanged, except that sign-in is now username and password rather than a
PIN, and the app is published from GitHub Pages rather than Cloudflare.

---

## Switching the shared server on

Everything the app needs on the server is two SQL files. Nothing has to be
configured in Supabase beyond creating the project. About fifteen minutes.

### 1. Create the project

At [supabase.com](https://supabase.com) → **New project**. Name it
`legendary-crm`, region **Singapore (ap-southeast-1)**, and note the database
password it asks you to set (you will not need it for the app, but keep it).
Wait for the project to finish provisioning.

### 2. Run the two SQL files

Either paste them into the SQL editor, or run both at once from a machine with
the connection string:

```bash
npm install
DATABASE_URL='postgresql://…' node scripts/migrate.mjs
```

Both files are safe to run again — every statement is `create or replace` or
`if not exists`, and the people seed leaves existing logins alone.

By hand: in the project, **SQL Editor** → **New query**.

1. Paste the whole of
   [`supabase/migrations/0001_init.sql`](../../supabase/migrations/0001_init.sql)
   and run it. It creates the tables, the functions the app calls, and the
   key that encrypts the readable copy of each password.
2. New query; paste the whole of
   [`supabase/migrations/0002_people.sql`](../../supabase/migrations/0002_people.sql)
   and run it. It creates the 39 logins from the client's list, each with a
   random password. The result is the number added (39 the first time, 0 if
   run again).

### 3. Issue the passwords

Everyone was created with a random password. There are two ways to get them
out:

**Either** hand Imran his and let him read the rest off the screen. New query:

```sql
select set_bootstrap_password('imran', 'a-real-password-here-2026');
```

It has to pass the same rules as any other — at least ten characters, letters
and a number, nothing obvious. He signs in, opens **Logins**, and reveals each
password as he hands it over (every look-up is written to the Activity
screen).

**Or** print the whole list at once, from a machine with the connection
string (Supabase → Settings → Database → Connection string, session pooler):

```bash
DATABASE_URL='postgresql://…' node scripts/issue-passwords.mjs > passwords.txt
```

That gives everyone a fresh password and writes name, username, job and
password as a table. The old password joins the history so it can never come
back. **The file is a list of live credentials** — hand it over, then delete
it. `passwords*.txt` is in `.gitignore` so it cannot be committed by accident.

Either way, tell people to change their own from the account menu; promoters
cannot, by the client's own rule, so theirs stay as issued until a senior
changes them.

### 4. Tell the app where the server is

In the Supabase project: **Settings → API**. Copy the **Project URL** and the
**anon public** key.

In the GitHub repository: **Settings → Secrets and variables → Actions →
New repository secret**, twice:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | the Project URL, e.g. `https://abcdefghijkl.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon public key (starts `eyJ…`) |

The anon key is designed to be public. Every table is closed to it, and every
function the app calls checks for a valid session first — see the top of
`0001_init.sql`.

### 5. Publish

**Actions → Build and deploy → Run workflow** (or push any commit). When the
run is green the site at the usual address is talking to the server. The
footer of every screen says so — "Shared with every device" with a green dot —
and the sign-in screen no longer shows the sample logins.

### 6. Before the promoters start

- Sign in as Imran and check the Logins screen lists everyone.
- Sign in as one promoter on a phone and one on a laptop; ring up a sale on
  the phone and watch it appear on the laptop.
- If anything from a dry run should be wiped, Davy or Imran: **Activity →
  Start over**.

### What is not connected yet

**Mail.** The six-digit code for leadership needs a sender (Resend, Brevo, or
the company's own SMTP). The server side is written and switched off
(`settings.two_step = false`). When a sender is chosen, the send goes in one
place — marked `TODO` in `sign_in()` — and the setting is flipped to `true`.

**Backups.** The free tier takes none. The nightly `pg_dump` described below
is still the right answer and still to do before the system holds real sales.

---

## The short answer

| | Recommendation |
|---|---|
| **Database & backend** | **Supabase** (managed Postgres) |
| **Where** | Singapore `ap-southeast-1` — *unless* data must physically sit in Malaysia |
| **Front end** | **Cloudflare Pages** — static, free, no asterisk |
| **Sign-in** | Username and password; an e-mailed code for leadership once mail is connected. |
| **Cost** | **Free to start.** Domain only, about RM 60 a year. |

The server that is actually running is the document store in
[`supabase/migrations/0001_init.sql`](../../supabase/migrations/0001_init.sql).
The fuller relational schema drafted earlier is kept for reference in
[`supabase/design/full-schema.sql`](../../supabase/design/full-schema.sql).

---

## "Can I run this for free and buy only the domain?"

**Yes — for a while, and with one thing you must not skip.**

Here is every part of the system and what it costs on the free path.

| Part | Free option | Genuinely free? | Where it runs out |
|---|---|---|---|
| The app itself | Cloudflare Pages | **Yes** | Never. Static files, unlimited bandwidth, custom domain, HTTPS included. |
| Database + API + sign-in | Supabase Free | **Yes** | 500 MB of data. See the sizing below. |
| Nightly Zeoniq import | GitHub Actions | **Yes** | 2,000 minutes a month. A nightly job uses about 30. |
| Notifications | In-system only (Q75) | **Yes** | Never — you chose not to use email or WhatsApp, so there is nothing to pay for. |
| Backups | GitHub Actions + Cloudflare R2 | **Yes** | 10 GB of R2 storage free. Years of nightly dumps. |
| Domain | — | **No** | About RM 60/year for `.com`, RM 80 for `.com.my`. |

So: **RM 60 a year, and nothing else.** That is a real answer, not a technicality.

### The thing you must not skip

Supabase's free tier has **no automatic backups**. Paid tiers take one every day and can
rewind the database to any moment in the last week; the free tier does neither.

This system will hold your sales book. You told us records must be kept for ten years
(Q88). Running that with no backup is the one genuinely bad idea on the free path.

The fix is also free: a scheduled GitHub Action runs `pg_dump` every night and writes the
file to Cloudflare R2 (10 GB free) or a private repository. It is about thirty lines of
configuration, it costs nothing, and it turns "we lost the year" into "we lost today".

**Do this on day one, not later.** Free hosting is fine. Free hosting with no backup is not.

### Two more things to know about the free tier

**It pauses if nobody uses it for seven days.** Your shops close every night, so this will
never happen in practice. It matters only if you pause the rollout for a couple of weeks —
un-pausing is one click, and nothing is lost.

**There is no support and no uptime promise.** If Supabase has a bad night, you wait like
everyone else. For a fifty-person company recording sales once a day, that is a reasonable
risk. For a system people would be locked out of mid-transaction, it would not be.

### When the free tier runs out

The limit that will bite is **500 MB of data**, and the reason is your own answer to Q20 —
*every perfume counted every night*.

Working from what you sent us:

| What generates rows | Rows per year |
|---|---|
| Daily closings — 9 main stores, 56 dealers, 4 online | ~25,000 |
| Sale lines — what sold, and to which nationality in the main stores | ~380,000 |
| **Nightly stock counts — every SKU, every store, every night** | **~520,000** |
| The activity log — one row per action, plus one per database change | ~80,000 |

That is roughly **140–270 MB a year**, and the range is entirely about how many SKUs the
final product list has. Today the system carries 22; you have told us there are 19 products
with sizes, refills, travel sizes and gift sets counted separately (Q54), so the real number
is likely nearer 40. At 40 SKUs the free tier fills up **somewhere in the second year**. At
22 it lasts into the third.

Two honest options when that happens:

1. **Pay USD 25 a month for Supabase Pro.** You get 8 GB, daily backups and the ability to
   rewind a week. At that point the database is your sales book and it has earned it.
2. **Stay free by keeping less detail.** After twelve months, a nightly count that matched
   expectation exactly is not worth a row each — roll those into a monthly summary and keep
   the exceptions. The same applies to the trigger-written half of the activity log, though
   the readable half should be kept in full for the ten years. This is a day's work and it
   would keep you inside 500 MB indefinitely.

Option 1 is the one we would take. Option 2 is real, and we will build it if you would
rather keep the bill at zero.

### What we would actually do

Launch free. Add the nightly backup on day one. Watch the database size for six months.
Move to Pro when the sales history is worth USD 25 a month to you — which, if the system is
doing its job, it will be.

---

## Why not MongoDB

This data is deeply relational and the reporting is the whole point of the system. A single
question the owner asks — *"what did Chinese customers buy at the airports last quarter, by
product"* — walks sale lines → SKUs → products → locations → periods. In Postgres that is
one query with a couple of joins. In MongoDB it is either a heavy aggregation pipeline or
duplicated data that drifts out of step.

There is also a correctness argument. The rules you gave us are the sort a database should
enforce, not the app: a country may only be recorded where the store actually captures one;
a tester can never be sold; a correction closes after three days; a PIN is never reused.
Those are check constraints, triggers and unique indexes in Postgres — they hold even if
someone later writes a script that goes round the app. Document stores give you far less of
that.

**MongoDB is the wrong tool here.** Not a close call.

---

## Supabase vs Neon

Both are excellent managed Postgres. The difference is what comes with it.

| | Supabase | Neon |
|---|---|---|
| Postgres | Yes | Yes |
| Row-level security wired to the signed-in user | **Yes** | Possible, more wiring |
| Auto-generated API | **Yes** | No — write your own |
| Somewhere safe for the PIN secrets | **Yes** — Vault | No — bring your own |
| File storage (for exports and backups) | Yes | No |
| Free tier | 500 MB, pauses when idle | 0.5 GB, scales to zero |
| Scale-to-zero / branching | Basic | **Excellent** |
| Nearest region to Malaysia | Singapore | Singapore |

**Supabase wins for this project** for one specific reason: the permission model is the
most intricate part of the whole system — the founder who sees everything and edits
nothing, promoters who see only their own store, Kelly and Davy approving, Imran's login
hidden from everyone, and the PIN table above. Supabase's row-level security lets that live
*in the database*, enforced on every query, rather than being re-implemented and re-checked
in application code. The policies are already written in the migration.

Neon would be the better pick if you had a dedicated backend team who wanted full control.
You have Imran. Supabase gives him a console rather than a codebase.

---

## Open question 1: does the data have to be in Malaysia?

Your answer to Q82 was *"Malaysia. Cloud disk."* and to Q89 *"Cloud disk."* Those are not
quite the same thing, and the difference matters:

**If "hosted in Malaysia" was a preference**, use Supabase in Singapore. It is about 10 ms
away, it is the standard choice for Malaysian businesses, and it is by far the fastest route
to launch. It is also the only option that is free.

**If it is a hard requirement**, Supabase and Neon are both out — neither has a Malaysian
region, and the free path disappears with them. Then:

- **AWS Malaysia (`ap-southeast-5`)** with RDS Postgres. Real Malaysian residency. About
  USD 90–150 a month, and someone has to run it — a real commitment for a one-person IT
  function.
- **Self-hosted Supabase** on a Malaysian VPS (Exabytes, AIMS, or AWS Malaysia). Keeps the
  developer experience, but you own the backups, the patching and the uptime.

We would put this back to Davy plainly: *is Singapore acceptable, or must the servers be
physically in Malaysia?* One sentence changes the hosting bill from RM 60 a year to roughly
RM 6,000.

> On the law: Malaysia's PDPA governs *personal data*. Because you chose counts by country
> rather than individual customer records (Q27), **this system holds almost no personal
> data** — only staff names. That materially lowers the stakes. This is not legal advice;
> if residency matters commercially, confirm it with your own advisor.

---

## Open question 2: should senior staff be able to look up a PIN?

You asked for Davy and Imran to be able to see every user's current PIN, and Kelly and
Chloe to see the PINs within their reach. That is built and it works.

It also means the system must keep a recoverable copy of every PIN, which is weaker than
the usual practice of keeping none. We have contained it as far as it can be contained —
the encryption key lives outside the database, only four people can use it, and every
look-up is recorded — and written the whole trade-off up in
[`auth.md`](./auth.md).

If **setting** somebody a new PIN would do instead of **seeing** their current one, the
recoverable copy disappears and the system gets meaningfully safer, with no change to how
it feels to use. Worth one minute of Davy's time to decide.

---

## Sign-in, in detail

**Everyone uses a six-digit PIN.** No Google accounts, no passwords, no email addresses in
the system at all.

This is simpler than what we proposed before and it is better suited to how Legendary
actually works: promoters share a counter iPad and cannot sign in and out of Google all day
(Q78), and head office does not want another password to remember. One mechanism for
everybody also means one set of rules to explain, which matters when Chloe is the one
training the shop staff (Q93).

- The landing page **is** the keypad. Six digits identify the person, so nobody picks a
  name first.
- A PIN is created when the staff member is created — by Davy, Kelly, Chloe or Imran, and
  nobody else.
- No two people ever share a PIN, and nobody is ever given an old one back.
- Five wrong tries locks that device for a minute, counted in the database rather than the
  browser.
- Store promoters cannot change their own PIN; Finance and the Warehouse can.

Full detail, including who may change and see whose, is in
[`auth.md`](./auth.md).

---

## Zeoniq

We do not want to guess at Zeoniq's specifics. There are three shapes this takes, and which
applies depends on your licence:

1. **A direct API** — sales flow in within minutes, untouched by hand. Best outcome.
2. **A scheduled export** — Zeoniq drops a file nightly, we collect it. Slower, but
   available on almost any licence and perfectly adequate for a daily closing.
3. **Database read access** — if Zeoniq runs on your own server, we read it directly.

To choose, we need from Imran: **who supplies the Zeoniq licence**, and **one busy day's
sales export plus one full month**, so we can see the actual fields.

**The important caveat, from your own answer to Q8:** airports and department stores run
the building owner's system, not Zeoniq. Those stay manual entry whichever option we pick —
which is exactly why the *Record a sale* screen is built to be fast on an iPad rather than
assuming a feed exists.

---

## Deployment

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Cloudflare Pages   │────▶│      Supabase        │◀────│  GitHub Actions │
│  the app (static)   │     │  Postgres + RLS      │     │  nightly import │
│  free               │     │  Singapore · free    │     │  nightly backup │
└─────────────────────┘     └──────────────────────┘     │  free           │
                                                          └─────────────────┘
```

**Front end.** The app builds to static files (`npm run build` → `dist/`). Cloudflare Pages
hosts that free, deploys on git push, and gives HTTPS and a global CDN. Cloudflare has the
better South-East Asia coverage; Vercel is marginally simpler and equally free.

**Database.** Supabase, free tier to start, Pro at USD 25/month when the data outgrows it.

**The Zeoniq import.** A scheduled GitHub Action that runs nightly, pulls the export and
writes sale lines. Free.

**The backup.** A second scheduled Action running `pg_dump` to Cloudflare R2. Free, and not
optional.

**Ten-year retention (Q88)** is a backup policy, not an application feature — and the activity
log is what makes it worth keeping, since it is the part that says who did what. **Full export
(Q90)** is `pg_dump` — the data is standard Postgres, so there is no lock-in to argue about.

### Monthly cost

| Item | Free path | Comfortable path |
|---|---|---|
| Cloudflare Pages | 0 | 0 |
| Supabase | 0 | USD 25 |
| Zeoniq import + nightly backup | 0 | 0 |
| Domain | ~RM 5/month | ~RM 5/month |
| **Total** | **~RM 5/month** | **~RM 115/month** |

If strict Malaysian residency is required, budget **USD 90–150 a month** instead, and add
time for someone to run the infrastructure.

---

## What is left to build

The front end is complete. To go live:

| Step | Work |
|---|---|
| 1. Create the Supabase project, run the migration, load the Vault secrets | Half a day |
| 2. Load real locations, products and staff, and issue the first PINs | 1 day, once Chloe's staff list arrives |
| 3. Swap the front end's data layer from seed to Supabase | 3–4 days |
| 4. PIN sign-in against the database rather than the seed | 1 day |
| 5. Nightly backup job | Half a day |
| 6. Migrate 3 years of Excel history | 2–3 days, depends how tidy it is |
| 7. Zeoniq import | 3–5 days, depends which of the three options |
| 8. Pilot at one store, then roll out | 2 weeks |

Step 3 is contained by design: every figure already comes from one module
(`src/store/selectors.ts`) reading one store (`src/store/useData.ts`). Swapping where the
data comes from touches those two files and nothing else — no screen needs rewriting. Step 4
is one function: `signInWithPin` in `src/store/useAuth.ts` becomes a call to
`sign_in_with_pin()`, which is already written in the migration.

---

## Honest status

**What is production-grade today:** the permission model, the PIN rules, the order state
machine, the data model, the validation rules, and every screen. The database schema
enforces the client's rules at the storage layer, not just in the browser, and the
permission and PIN rules are covered by tests that fail the build if someone breaks them.

**What is not:** there is no server yet. Data lives in the browser and is not shared between
people. None of that is a gap in the design — it is the next phase, and it depends on the
two open questions above and on the Zeoniq export arriving.
