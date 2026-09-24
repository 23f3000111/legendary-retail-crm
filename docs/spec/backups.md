# Backups

**Date:** 2026-09-24
**Status:** Running. First backup taken, decrypted and checked on 24 September.

---

## What happens every night

At **02:30 Malaysia time** a scheduled job in the private repository
[`23f3000111/legendary-crm-backups`](https://github.com/23f3000111/legendary-crm-backups):

1. **Copies** the four tables that hold the business — logins (password
   *hashes*, never passwords), every sale, closing, order, target, promotion
   and line of the activity log, the outlets, and the settings.
2. **Restores the copy** into a throwaway Postgres database, using the same
   script a person would use, and **counts every table**. A backup that would
   not come back fails that night, and GitHub e-mails the account owner.
3. **Encrypts** it with a passphrase (AES-256).
4. **Keeps** it: every night for 30 days, and the 1st of each month
   permanently.

It costs nothing: about two minutes of the 2,000 free GitHub Actions minutes
a month.

---

## Why it is safe to hand a copy of the database to GitHub

- **The repository is private**, so the runs and the files in them are
  visible to its owner only.
- **Every backup is encrypted** before it leaves the job. Without the
  passphrase it is noise.
- **The backup signs in as `backup_reader`**, a login that can *read* those
  four tables and nothing else. It cannot write or delete a row, cannot read
  the key that protects the readable passwords, cannot call anything the app
  calls. If its password ever leaked, the worst that could happen is a copy —
  never a change. (Checked on 24 September: every one of those was refused.)
- **The server's certificate is checked** against Supabase's own root, so the
  job cannot be quietly pointed at somewhere else.

---

## The passphrase — the one thing to look after

It was generated on 24 September and saved to `docs/backup-passphrase.txt` on
the machine that set this up, which is not in git.

**Put it in a password manager, then delete that file.** GitHub keeps a copy
it will use but will never show back. Lose it, and every backup is locked for
good.

---

## Restoring

Step by step in the backup repository's
[`README.md`](../../ops/backup/README.md): download, decrypt, see what it would
change, then replace. One transaction — all of it or none of it.

If the whole Supabase project were lost: a new one, `scripts/migrate.mjs`, then
the restore. Sign-in works at once. Looking passwords *up* does not, until
each is next set — the readable copies are locked with the old project's key,
which a backup deliberately does not carry. `scripts/issue-passwords.mjs` sets
everyone's in one go.

---

## Changing things

| To | Do |
|---|---|
| Change the backup's database password | `node scripts/backup-reader.mjs out.txt`, paste into the backup repo's `BACKUP_DATABASE_URL` secret, delete `out.txt` |
| Take one now | Backup repo → Actions → *Nightly backup* → *Run workflow*. Tick *keep* to keep it permanently. |
| Keep more or fewer nights | `retention-days` in `.github/workflows/nightly-backup.yml` (at most 90) |
| Back up another table | Add it to `TABLES` in the workflow, `restore.mjs`, and the grants in `supabase/migrations/0006_backup_reader.sql` |

The workflow, the restore script and the README are kept in this repository
too, in [`ops/backup/`](../../ops/backup/), which is where they were written.
