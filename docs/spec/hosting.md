# Running the CRM for free

**Date:** 2026-09-24

**It already is.** Everything below is on a free plan today, and nothing needs
a card. The one thing worth changing is where the app's pages are served
from — see [the recommended move](#the-one-change-worth-making).

---

## What runs where

| Part | Service | Free plan covers | Where it would run out |
|---|---|---|---|
| The app (the pages staff open) | GitHub Pages, today | Unlimited use for a site this size | See the move below — the limit is the licence, not the traffic |
| Database and every rule | Supabase | 500 MB of data, unlimited sign-ins | Years away. The database is 12 MB today and should grow by roughly 15 MB a year. |
| Sign-in codes by e-mail | Resend | 3,000 a month, 100 a day | Only with far more than five people on the second step |
| Nightly backup | GitHub Actions, private repository | 2,000 minutes a month | A night takes about 2 minutes: 60 a month |
| Keeping backups | GitHub | 500 MB of run artifacts; releases unlimited | 30 nights of backups at ~50 KB today. At a year's data, ~15 MB each — still inside it |
| A web address | `*.pages.dev` / `*.github.io` | Free | Only if you want `crm.legendary.com.my`: about RM 50–80 a year |

### Two things the free plans do not do

- **Supabase pauses a project after a week with nobody using it.** Stores
  trade every day, so in practice this never happens. If it ever does — a
  long holiday shutdown — un-pausing is one click in the Supabase dashboard,
  and nothing is lost.
- **Nobody promises it will stay up.** There is no support line and no
  uptime guarantee on any of these. For a company recording sales once a day
  with a nightly backup, that is a reasonable trade. If the CRM ever becomes
  something the business cannot run without for even an hour, Supabase Pro
  (about USD 25 a month) is the first thing worth paying for — it adds daily
  backups of its own, rewinding to any minute of the last week, and support.

---

## The one change worth making

**Move the app from GitHub Pages to Cloudflare Pages, then make the code
repository private.** Both are free.

Why:

1. **The repository is public today**, and a free GitHub plan can only
   publish Pages from a public one. That means anybody on the internet can
   read the code — including `src/data/people.ts` and
   `supabase/migrations/0002_people.sql`, which list every member of staff
   with their username and work e-mail. Nobody can sign in with that alone —
   passwords are random, never in the code, and five wrong tries hold the
   account — but a company's staff list does not belong on the public
   internet.
2. **GitHub's terms say Pages is not meant for running a business's
   software.** An internal CRM is a grey area rather than a clear breach, but
   there is no reason to sit in it when an equally free host has no such rule.

Cloudflare Pages is free with no limit on traffic, publishes from a private
repository, and gives an address like `legendary-crm.pages.dev`.

### Doing it — about ten minutes

The deploy workflow is already written for it and waits for two secrets.

1. **Make a Cloudflare account** at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
   Free; no card.
2. **Find the account ID.** Dashboard → any page → right-hand side, *Account
   ID*. Copy it.
3. **Make an API token.** My Profile → API Tokens → *Create Token* → *Create
   Custom Token*. One permission: **Account · Cloudflare Pages · Edit**.
   Continue, create, copy the token (shown once).
4. **Add both to GitHub.** The CRM repository → Settings → Secrets and
   variables → Actions → *New repository secret*:

   | Name | Value |
   |---|---|
   | `CLOUDFLARE_ACCOUNT_ID` | the account ID |
   | `CLOUDFLARE_API_TOKEN` | the token |

5. **Publish.** Actions → *Build and deploy* → *Run workflow*. When it is
   green, the site is at **`https://legendary-crm.pages.dev`**. Sign in there
   and check it works — it is the same server, so everybody's data is
   already there.
6. **Only then, make the repository private.** Settings → General → Danger
   Zone → *Change visibility* → Private. The workflow notices and stops
   publishing to GitHub Pages by itself; Cloudflare carries on.
7. **Tell staff the new address**, and turn GitHub Pages off: Settings →
   Pages → Unpublish.

This step has not been run yet — it needs your Cloudflare account. Check the
new address works at step 5 before doing step 6; until then, nothing about the
current site changes.

### Your own address (optional)

With a domain — `legendary.com.my` is already yours — Cloudflare Pages →
the project → Custom domains → add `crm.legendary.com.my`, and follow the one
DNS record it asks for. Free; the domain itself is the only cost.

---

## Deploying a change

Nothing to do by hand. Every push to `main` runs the tests; if they pass, the
app is built and published. If they fail, nothing is published and the site
stays as it was.

A change to the database (`supabase/migrations/`) is the exception: those are
applied with

```bash
DATABASE_URL='postgresql://…' node scripts/migrate.mjs
DATABASE_URL='postgresql://…' node scripts/verify-server.mjs
```

The second one checks every rule the server enforces, inside a transaction
that is rolled back — safe to run on the live server at any time.

---

## Backups

Nightly, free, encrypted, and tested every night by restoring into a scratch
database. Everything about them — where they are, how to restore one — is in
[`backups.md`](./backups.md).
