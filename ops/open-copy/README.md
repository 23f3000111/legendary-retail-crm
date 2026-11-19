# Legendary CRM — the open copy

Every night at 03:00 Malaysia time this repository takes a copy of the CRM's
data, restores it into a throwaway database to prove it opens, and keeps it —
**not encrypted**. It needs no passphrase: this GitHub account's login is its
only lock.

**Keep this repository private, and keep two-step sign-in on for this GitHub
account** (Settings → Password and authentication).

---

## What is here

| Where | What | Kept |
|---|---|---|
| `tables/` | Every kind of record as CSV, for Excel, Sheets, Numbers or GitHub itself | Every night is a commit, *Data as of …*; a file's History shows any earlier night |
| Actions → a run of *Nightly open copy* → Artifacts | The whole database dump of that night: `schema.sql`, `data.sql` and the row counts | 30 days |
| Releases `open-YYYY-MM-01` | The first night of each month | For good |
| Release `history-2026-11-19` | The snapshots taken before this repository existed, back to 24 September | For good |

The tables in `tables/`:

- **Stores' days:** `closings`, `closing-lines` (a filed day's sales),
  `closing-stock`, `closing-write-offs`
- **Sales:** `sale-lines`, rung up at the counter
- **Orders:** `orders`, `order-lines`, `order-events`
- **Dealers and consignment:** `dealer-and-consignment`
- **Planning and the range:** `targets`, `promotions`, `products`
- **The log:** `activity`, every action anyone took
- **Housekeeping:** `alerts-read`, `app-settings`
- **People and places:** `logins` (no passwords), `outlets`, `settings`

The large ones are split by month (`sale-lines/2026-11.csv`). A cell that a
spreadsheet would run as a formula is written with a leading `'`; the dump
keeps it exactly.

## What is not here

**Passwords.** The login this job uses (`backup_open_reader`) cannot read the
password hash, the readable copy, or the history of either — the server
refuses. In `data.sql` those three columns hold placeholders that open no
account. The encrypted backups, in `legendary-crm-backups`, keep the real
ones.

---

## Restoring from it

You need the admin connection string (Supabase → Settings → Database →
Connection string), Node.js, and the CRM repository checked out.

1. **Download** a dump from Actions or Releases, and unpack it:
   `tar -xzf legendary-crm-open-….tar.gz` gives `schema.sql`, `data.sql` and
   the counts.
2. **See what it would do** — nothing changes yet:
   `DATABASE_URL='…' node ops/backup/restore.mjs data.sql`
3. **Do it:** `DATABASE_URL='…' node ops/backup/restore.mjs data.sql --yes`
   — one transaction; every table is replaced, or nothing is.
4. **Give everyone a password again**, since this copy holds none:
   `DATABASE_URL='…' node scripts/issue-passwords.mjs > passwords.txt`.
   Hand them out, then delete the file.

If the Supabase project itself is gone, create a new one and run
`scripts/migrate.mjs` against it before step 2.

## The secret and the variable

| Name | What it is |
|---|---|
| `OPEN_BACKUP_DATABASE_URL` (secret) | `backup_open_reader`'s connection string. `node scripts/backup-reader.mjs --role backup_open_reader <file>` in the CRM repository makes a new one, and the old one stops working. |
| `CRM_REF` (variable, optional) | Which branch of the CRM the job's code comes from. Unset means `main`. |

A night that fails makes GitHub email the account that owns this
repository.
