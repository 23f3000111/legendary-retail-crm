# Legendary CRM — backups

Every night at 02:30 Malaysia time this repository copies the CRM's database,
restores the copy into a throwaway database to prove it opens, encrypts it,
and keeps it.

| Kept | For |
|---|---|
| Every night | 30 days — under **Actions**, on each run |
| The 1st of each month | Permanently — under **Releases** |

**This repository must stay private.** The backups are encrypted, but they are
still the whole business in one file.

---

## What is in a backup

The four tables that hold the business: `people` (logins, with password
*hashes* — never passwords), `docs` (every sale, closing, order, target,
promotion and line of the activity log), `locations`, and `settings`.

Not in a backup, on purpose: who is signed in, sign-in attempts, pending
codes, the mail log. Restoring a session would bring a signed-out device back
to life.

The backup signs in as `backup_reader`, which can read those four tables and
nothing else — it cannot write, cannot delete, cannot read the password key,
and cannot call anything the app calls.

---

## The secrets

| Secret | What it is |
|---|---|
| `BACKUP_DATABASE_URL` | `backup_reader`'s connection string. Made by `scripts/backup-reader.mjs` in the CRM repository; running that again changes the password. |
| `BACKUP_PASSPHRASE` | What every backup is encrypted with. |
| `CF_KV_TOKEN`, `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE` | Where each backup is copied for the Backups page (below). Set by `scripts/backup-page-setup.mjs` in the CRM repository. Without them that one step is skipped. |

**Keep the passphrase somewhere other than GitHub** — a password manager. A
backup nobody can decrypt is not a backup, and GitHub will never show the
secret back to you.

---

## Restoring

You need: the passphrase, the admin connection string (Supabase → Settings →
Database → Connection string), and Node.js.

**1. Download.** Actions → a run of *Nightly backup* → Artifacts, or Releases
for a monthly one. You get `legendary-crm-YYYY-MM-DD_HHMM.tar.gz.gpg`.

**2. Decrypt and unpack.**

```bash
gpg --decrypt legendary-crm-2026-09-24_0230.tar.gz.gpg > backup.tar.gz
tar -xzf backup.tar.gz          # schema.sql, data.sql, and the row counts
```

**3. See what it would do** — nothing changes yet:

```bash
npm install
DATABASE_URL='postgresql://postgres.xxxx:…@…pooler.supabase.com:6543/postgres' \
  node restore.mjs data.sql
```

It prints each table's row count now and in the backup.

**4. Do it:**

```bash
DATABASE_URL='…' node restore.mjs data.sql --yes
```

One transaction: every table is replaced, or — if anything goes wrong —
nothing is, and the server is exactly as it was. Everybody is signed out and
signs in again as normal.

### Restoring into a brand-new Supabase project

If the project itself is gone: create a new one, run the CRM repository's
`scripts/migrate.mjs` against it to build the tables and functions, then
restore as above. Sign-in works straight away, because the password hashes
come with the backup. Looking a password *up* on the Logins screen does not,
until Imran next sets that person's password — the readable copies were
encrypted with the old project's key, which a backup deliberately does not
carry. `scripts/issue-passwords.mjs` sets everyone's at once.

---

## Every night, the backup is tested

After taking a copy, the job builds an empty Postgres 17, restores the copy
into it with the same `restore.mjs` a person would use, and counts every
table. If a table came back short, the run fails and GitHub e-mails the
account that owns this repository.

A failed night is worth reading the next morning. A run of them means there
is no backup.

---

## The Backups page, and the copy in Cloudflare

After each night's backup has been restored, counted and encrypted, the job
copies it — still encrypted — into Cloudflare (the KV namespace
`legendary-crm-backups`, in the account that holds legendary.com.my):
`nightly/<stamp>` for 31 days, and on the 1st `monthly/<day>` for good.

**https://crm.legendary.com.my/backups/** lists those copies and opens any of
them on any phone or computer, behind one password. The page unlocks the
backup on the device itself and shows every table, each downloadable as a
spreadsheet; nothing unlocked is sent anywhere or kept. Every sign-in, and
any lock-out after wrong passwords, emails the alert list.

| To | Run, in the CRM repository |
|---|---|
| Set it up (once) | `node scripts/backup-page-setup.mjs --alert-emails a@…,b@… --reply-to a@… --passphrase-file docs/backup-passphrase.txt` |
| Change the password | `node scripts/backup-page-setup.mjs --rotate-password`, then redeploy the CRM. Everybody is signed out. |

Both write the page password to `docs/backup-page-password.txt`: put it in a
password manager, give it to whoever should open backups, and delete the
file.

A small Cloudflare Worker, `legendary-crm-backup-watch` (in the CRM
repository under `workers/`), checks the copies at 11:00 every morning and
emails the alert list if the newest is more than 30 hours old — it runs on
Cloudflare, so a night GitHub never starts this job is still noticed.

One KV value holds at most 25 MiB. The copy step stops, and the run fails,
if a backup ever passes 24 MiB: then split it, or move the copy to R2.
