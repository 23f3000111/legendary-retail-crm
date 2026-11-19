# Backups anywhere — design (19 November 2026)

Approved on 19 November. That day the developer also decided:

- **The alert list** is the developer, Davy and Legendary's main address.
  The exact addresses are still to come.
- **The existing data goes into the new private repository too,** not just
  what arrives from tonight. See Part 1.

Agreed in conversation on 16–19 November. Option 1 was chosen: a
password-protected Backups page on the CRM's own Cloudflare site. The
encrypted GitHub backups continue, and a second, unencrypted copy goes into a
private repository that only the developer can reach. "Theirs" marks what was
decided in conversation; "my call" marks what the designer filled in, which
can still be changed.

## Why

Since 23 September the CRM has been backed up every night: encrypted
(AES-256), checked by restoring each copy, and kept in the private
repository `23f3000111/legendary-crm-backups`. A check on 16 November found
every record identical to the live server.

What the check also found is that the whole arrangement hangs on one device
and one person:

- The only readable copy of the passphrase is `docs/backup-passphrase.txt` on
  the developer's laptop. GitHub never shows the secret back.
- Opening a backup needs gpg, Node and a database on a computer set up for it.
- Only the developer's GitHub account can download a backup.

The developer's words: they "do not want to risk data in one device solely",
the data should be openable "by any device and anywhere", it must be
"protected so anyone can't open it", and they "do not want everything [to]
depend on" them.

## Goals

1. **The Backups page** (theirs): https://crm.legendary.com.my/backups/
   opens on any phone or computer. It asks for one password. Behind it:
   - every backup, newest first;
   - open any one to read sales, closings, orders, the activity log, logins
     and outlets on screen, or download them as spreadsheets.

   The secret parts (the password check and the backup passphrase) live on the
   server in Cloudflare's encrypted settings, not on anyone's device. It does
   not use the CRM's database, so it still works if the CRM is down.
2. **A second encrypted copy every night in Cloudflare** (agreed with option
   1), in the account that holds legendary.com.my. It is what the page reads,
   so the page does not depend on the developer's GitHub account.
3. **The GitHub backups continue unchanged** (theirs): nightly, encrypted,
   restore-tested, 30 nights plus every 1st of the month kept for good.
4. **An open copy in a private repository** (theirs), `legendary-crm-data`
   (name my call). It is unencrypted, so it opens without any password, and
   only the developer's GitHub login reaches it. Every night:
   - readable tables you can open on GitHub's website or app;
   - the full database dump, for restoring without the passphrase.
5. **Warnings by email** (agreed with option 1):
   - when a night's backup is missing;
   - whenever someone signs in to the Backups page;
   - when the page locks after wrong passwords.

## Non-goals

- Restoring from the page. The page reads backups. Putting one back stays a
  deliberate, technical step (`ops/backup/README.md`).
- Per-person logins on the page. One shared password was asked for. It is
  changed in one step when someone should lose access.
- Any change to the CRM screens staff use.

## Anti-goals

- **A page that can be opened by guessing.** The password is long and
  random, and wrong tries lock the page.
- **The passphrase written down unencrypted anywhere new.** It may sit only in
  Cloudflare's encrypted settings, in GitHub's secrets, and in a browser's
  memory while a backup is open. It must never be in a repository, in
  browser storage, or in an email.
- **Anything that can open an account, left readable.** Password hashes and
  the encrypted password copies appear neither on the page nor in the open
  copy (my call, see below).
- **A backup that stops quietly.**
- **A weaker live CRM.** The only database change is a second read-only login
  that cannot see password columns.

## Constraints

- **Cloudflare free plan: 10 ms of CPU per request** (Workers limits, which
  Pages Functions share), and 100,000 requests a day. So the page's server
  code only:
  - checks passwords,
  - signs and reads a cookie,
  - passes the encrypted file through,
  - sends emails.

  Unlocking (OpenPGP), unpacking (gzip, tar) and reading the dump happen in
  the browser.
- **Cloudflare KV: 25 MiB per value; free plan 1,000 writes and 1,000 lists a
  day, 1 GB in total.** Tonight's encrypted backup is 1.9 MB and grows by
  about 35 KB a day, which leaves roughly 18 months before one backup
  reaches 25 MiB. The upload refuses anything over 24 MiB, loudly. At that
  point, split the file or move to R2.
- **The backup format is RFC 4880 OpenPGP** with a password: S2K type 3,
  SHA-512, AES-256, SEIPD with MDC (`gpg --list-packets`, 18 November).
  OpenPGP.js decrypts this in the browser. On a phone, unlocking takes a few
  seconds because of the 65-million-round key derivation.
- **The CRM repository is public**, so the page's code is public. Every
  secret lives in Cloudflare's or GitHub's encrypted settings.
- **The Cloudflare token in `.env` can deploy Pages but cannot touch KV or
  Workers** (checked 19 November: KV and R2 both answer 401). The developer
  makes one more token, with "Workers KV Storage: Edit" and "Workers Scripts:
  Edit" on the account. That is the one step only they can do in the
  dashboard.
- **GitHub starts the "02:30" job late,** between 05:00 and 09:45 MYT so far.
- **The open copy's only protection is the developer's GitHub login.**
  Two-step sign-in must be on for that account; it could not be confirmed
  from here. On 19 November the only collaborator on either repository is
  `23f3000111`.
- **After the page works,** the passphrase lives in Cloudflare's and GitHub's
  encrypted settings, and the page is how a backup gets unlocked. The
  developer copies it into their password manager and deletes
  `docs/backup-passphrase.txt` (my call).

## Approaches

| | Approach | Trade-off | |
|---|---|---|---|
| 1 | A page on the CRM's Cloudflare site, password checked server-side | No new account or cost; independent of the CRM's database; 10 ms CPU means unlocking happens in the browser | **Picked** |
| 2 | The same page on Vercel | One more account; the Hobby plan is non-commercial, so a company needs Pro at $20 a month | |
| 3 | No website: GitHub logins for Davy, and a button that turns a backup into spreadsheets | No shared password, but the least easy on a phone | |

The open, unencrypted copy was the developer's own addition. It trades
encryption for convenience, and GitHub's access control is its only
protection.

## The design

### Part 1 — the open copy (`legendary-crm-data`, private)

- **Its own nightly workflow,** at 03:00 MYT, independent of the encrypted job.
  Two schedules means one late or skipped run never leaves both copies
  behind.
- **It reads with a new login, `backup_open_reader`** (migration `0007`).
  This login can select `docs`, `locations` and `settings` in full, and from
  `people` only the columns that are not passwords: `id, username, role,
  active, doc, updated_at`. It has a read policy on each of the four tables,
  no functions and no write access. Its own connection string lives only in
  this repository's secrets, so a leak there gives away nothing more than
  this repository already holds. `scripts/backup-reader.mjs` learns to issue
  it.
- **Tables:** CSV, which opens in Excel, Sheets, Numbers and GitHub's own
  table view.
  - One file per kind of record: sale lines, closings, closing lines,
    orders, order lines, targets, promotions, dealer and consignment months,
    products, the activity log, logins (no password columns), outlets and
    settings.
  - The large kinds (sale lines, closing lines, activity) are split by month,
    so each file stays small enough to read on a phone.
  - Rows are sorted by id, so each night's commit changes only what changed.
    The git history is a dated snapshot of every night.
- **The dump:** `schema.sql` and `data.sql` in the same form as the encrypted
  backup, so `ops/backup/restore.mjs` works on it unchanged. The `people`
  rows carry placeholder password fields: a hash that matches nothing and an
  empty encrypted copy. After a restore from this copy everybody is issued a
  new password with `scripts/issue-passwords.mjs`. The dump is kept as a
  release asset (30 nightly, plus every 1st for good), not committed, so the
  repository stays small.
- **The code lives once.** The workflow checks out the public CRM repository
  and runs its export script, so the CSV logic is shared with the Backups
  page.
- **The existing data comes too** (theirs). Each night's copy is the complete
  data, not just the new records, and the first one is taken as soon as the
  repository exists rather than waiting for the night. The snapshots already
  taken, 30 nightly and 3 monthly back to 24 September, are opened once, have
  their password columns stripped, and become this repository's releases.
  Its history then matches the encrypted one from the first day.

### Part 2 — the Cloudflare copy and the Backups page

- **Storage:** a KV namespace `legendary-crm-backups`, filled by one extra
  step in the encrypted job after the restore test passes:
  - `nightly/<stamp>` expires after 31 days;
  - `monthly/<YYYY-MM-01>` never expires;
  - metadata holds when the backup was taken, its size and its row counts.

  The 30 nightly and 3 monthly backups already on GitHub are copied in once.
- **The page:** a second Vite entry, `backups/index.html` with code in
  `src/backups/`. It shares no code with the staff app's bundle, is not
  linked from the CRM, and is marked noindex.
- **Signing in:**
  - One password (my call: four groups of four letters and digits, about 80
    bits, e.g. `k7qm-x2pv-9tzh-r4nd`), stored only as an HMAC under a server
    secret.
  - Five wrong tries from one address in 15 minutes lock that address for
    15 minutes. Twenty in an hour from anywhere lock the page for an hour,
    and an email goes out. Counters live in KV with an expiry.
  - If KV refuses a write, sign-in is refused too (it fails closed).
  - A correct password gives a signed session cookie for one hour (`__Host-`,
    HttpOnly, Secure, SameSite=Strict).
  - Every sign-in emails the alert list with the time and Cloudflare's city
    and country for the visitor.
- **Server code (Pages Functions):**
  - `POST /api/backups/sign-in`
  - `GET /api/backups/list` — keys and metadata
  - `GET /api/backups/file/:key` — streams the encrypted bytes
  - `GET /api/backups/key` — the passphrase, for the browser to unlock with

  Everything except sign-in needs the session.
- **In the browser:**
  - Unlock with OpenPGP.js, gunzip with fflate, read the tar, and parse
    `data.sql` with the same parser the open-copy export uses.
  - Tables come with search and "Download as spreadsheet" per table, plus
    "Download everything" (a zip of CSVs) and "Download the encrypted file"
    for a technical restore.
  - Password columns are dropped as the dump is read, so they never reach the
    screen or a download.
  - A red banner appears when the newest backup is more than 30 hours old.
  - Nothing is kept after the tab closes: no local storage and no caching
    (`no-store`).
- **Headers:** a strict Content-Security-Policy (own scripts only),
  `frame-ancestors 'none'`, `no-referrer` and `noindex` (`public/_headers`).
- **Cloudflare encrypted settings:**
  - `BACKUP_PASSWORD_HMAC`
  - `BACKUP_SESSION_SECRET`
  - `BACKUP_PASSPHRASE`
  - `RESEND_API_KEY`: a new sending-only key, limited to legendary.com.my
  - `ALERT_EMAILS`
  - the KV binding `BACKUPS`
- **Changing the password:** `scripts/backup-page-password.mjs` makes a new
  one and writes its HMAC to Cloudflare. It rotates the session secret, which
  signs everyone out, and writes the new password to a file to move into a
  password manager and then delete.
- **The GitHub Pages mirror** of the CRM gets the static page without server
  code. There the page says to use crm.legendary.com.my/backups (my call,
  instead of leaving it out of that build).

### Part 3 — the missed-night warning

- **A small Cloudflare Worker with a daily Cron Trigger** at 11:00 MYT. It
  reads the newest key in KV and emails the alert list if that key is more
  than 30 hours old. It runs on Cloudflare, so it still fires if GitHub's
  scheduler skips or stalls. The free plan allows five Cron Triggers per
  account, and this uses one.
- **GitHub keeps emailing** the developer about any failed run in either
  repository, as now.

### Mail

- **Sender:** `backups@legendary.com.my`, through Resend, with the domain
  already verified (my call).
  - Sending from it needs no mailbox.
  - Legendary's mail is on Google Workspace (MX `smtp.google.com`), so a
    reply to that address bounces unless someone there creates a
    `backups@` alias.
  - Every email therefore carries `Reply-To` with the developer's address
    (my call).
- **Recipients:** the developer, Davy and Legendary's main address (theirs).
- **Content:** subject lines that say what happened, and nothing secret in
  any email.

## Testing

- Unit tests (vitest):
  - the tar reader and the `data.sql` parser (quotes, NULLs, bytea, `\restrict`
    lines);
  - flattening into tables, and CSV escaping;
  - password columns being dropped;
  - HMAC sign and verify;
  - cookie parsing;
  - the lockout rules against a fake KV.
- **End to end:** a backup encrypted in the test with OpenPGP.js using a known
  password, opened by the page's own code path. A second run uses a real
  `gpg --symmetric` file made the same way the nightly job makes them, so the
  format matches.
- **The open-copy export** is tested on synthetic dumps in CI. Its own
  nightly run then restores the real dump into a scratch Postgres and checks
  the counts, as the encrypted job does.
- **Live checks after deploying:**
  - sign in with the real password;
  - open tonight's backup;
  - check its counts against the job's own counts.

## Needed from the developer before building

1. **The alert list's exact addresses:** the developer's, Davy's and
   Legendary's main one. They are needed before the first email is sent,
   not before building starts.
2. **A Cloudflare API token** with "Workers KV Storage: Edit" and "Workers
   Scripts: Edit" on the account. Parts 2 and 3 wait for it. Part 1 does
   not.
3. **Two-step sign-in on the GitHub account,** if it is not already on.

## Left to the builder

- **Data and files:** the exact columns of each CSV, the stamp format and file
  names.
- **Server details:** how the counters are keyed, and the session token's
  shape.
- **The page:** the look of the page within the CRM's existing style.
- **Deployment:** whether the Worker deploys from the CRM's workflow or by
  hand once.
