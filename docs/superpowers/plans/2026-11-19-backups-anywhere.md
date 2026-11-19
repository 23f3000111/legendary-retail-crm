# Backups anywhere — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CRM's backups can be opened from any device with one password (a
Backups page on Cloudflare), a second encrypted copy lives in Cloudflare, an
unencrypted copy lives in a private repository only the developer reaches,
and a missed night raises an email.

**Architecture:**
- **Shared parsing:** one TypeScript module reads pg_dump's `--column-inserts`
  dump into tables and CSV. The open copy's nightly export (Node, via
  `vite-node`) and the Backups page (browser) both use it.
- **Server code:** Cloudflare Pages Functions only check the password, sign a
  cookie, stream encrypted bytes from KV and send email. The 10 ms CPU
  limit rules out unlocking there.
- **Unlocking:** happens in the browser with OpenPGP.js.
- **Missed nights:** a separate Worker on a Cron Trigger watches KV for a
  missing night.

**Tech Stack:**
- TypeScript, React 18, Vite 5 (second HTML entry) and vitest 2;
- `openpgp` v6 and `fflate`;
- Cloudflare Pages Functions, Workers KV, a Worker with a Cron Trigger, and
  `wrangler@4`;
- GitHub Actions with the Postgres 17 client;
- Resend.

**Spec:** `docs/superpowers/specs/2026-11-19-backups-anywhere-design.md`

## Global Constraints

### Limits that rule the design

- **CPU:** Cloudflare free plan, 10 ms CPU per request. No decryption,
  gunzip or parsing in Functions or the Worker.
- **KV size:** one KV value is at most 25 MiB. The upload refuses anything
  over 24 MiB (25,165,824 bytes), loudly.
- **KV writes:** the KV free plan allows 1,000 writes a day.

### Storage keys and timings

- **KV keys:**
  - `nightly/<stamp>` with `expiration_ttl=2678400` (31 days);
  - `monthly/<YYYY-MM-01>` with no expiry;
  - stamp = `YYYY-MM-DD_HHMM`, Malaysia time, as today.
- **KV metadata:** `{ "takenAt": ISO-UTC, "sizeBytes": n, "counts": { "people", "docs", "locations", "settings" } }`.
- **Session:** a cookie `__Host-lgd_backups` that lasts one hour, with
  `HttpOnly; Secure; SameSite=Strict; Path=/`.
- **Lockout:**
  - 5 wrong tries from one address within 15 minutes lock that address for
    15 minutes;
  - 20 wrong tries within 1 hour from anywhere lock the page for 1 hour and
    send an email;
  - if KV cannot be written, sign-in is refused (it fails closed).
- **Page password:** four groups of four from `abcdefghjkmnpqrstuvwxyz23456789`,
  joined with `-` (about 80 bits).
- **Stale:** the newest backup is more than **30 hours** old.
- **Schedules:**
  - Worker cron `0 3 * * *` UTC (11:00 MYT);
  - open-copy job `0 19 * * *` UTC (03:00 MYT).

### Email

- **From:** `Legendary CRM backups <backups@legendary.com.my>`.
- **Reply-To:** the developer's address.
- **To:** the `ALERT_EMAILS` list (the developer, Davy, and Legendary's main
  address).
- **No secret, ever,** in an email.

### What must never leak

- **`password_hash`, `password_cipher` and `password_history`** never appear
  on the page, in the open copy's tables, or in its dump; there they are
  placeholders.
- **The backup passphrase** is never in a repository, in browser storage,
  or in an email.

### Repositories and retention

- **The open repository** is `23f3000111/legendary-crm-data`, private.
- **Nightly dumps** are artifacts kept 30 days. The 1st of each month is also
  kept as a release.
- **The snapshots taken before** go into one release, `history-2026-11-19`.

### Toolchain

- **Runtime:** Node 20 in CI; the Postgres 17 client; pg_dump with
  `--column-inserts --rows-per-insert=200 --enable-row-security`.

### Process

- **The encrypted repository's files** are edited in `ops/backup/` and then
  copied to `23f3000111/legendary-crm-backups`. The two are identical today.
- **Live-server rules** (memory):
  - never wipe;
  - `scripts/migrate.mjs` then `scripts/verify-server.mjs` after any SQL
    change;
  - read `.env` values without printing them.

## Review Focus

1. **Text with quotes, backslashes, line breaks, emoji or Chinese and Malay
   names** (order notes keep their lines) has to come through parsing, the
   tables and CSV exactly, and open correctly in Excel. Tests: Task 1
   "keeps text exactly" and Task 2 "quotes what needs quoting".
2. **A backup the page's key cannot unlock** (a wrong or rotated passphrase)
   gets the message "This backup can't be unlocked with the key the page
   holds." It must not hang or show a stack trace. Test: Task 9 "says so when
   it cannot unlock".
3. **A phone with the wrong clock or time zone** still gets dates in MYT and
   the stale banner judged from the server's `now`. Tests: Task 10 "formats
   in Malaysia time whatever the device says" and "judges staleness by the
   server's clock".
4. **KV refusing writes,** for example when an attack uses up the day's
   1,000, means sign-in is refused, never let through. Tests: Task 7 "is
   unavailable when it cannot count" and Task 8 "refuses sign-in while the
   guard cannot count".
5. **A 14 MB dump with 20,000 rows on a phone** must not freeze. At most 200
   rows are drawn at a time, with Load more. Test: Task 10 "draws at most 200
   rows".

**Admin scripts and `.env`:** every script that needs the admin database
(`migrate.mjs`, `verify-server.mjs`, `backup-reader.mjs`) runs with
`DATABASE_URL` set from the `connection string=` line of the root `.env`,
which is read without printing it.

---

## Phase 1 — the open copy (needs nothing from the developer)

### Task 1: Read and write pg_dump INSERT statements

**Files:**
- Create: `src/backup/dump.ts`
- Test: `src/backup/dump.test.ts`

**Interfaces:**
- Produces:
  - `type SqlValue = string | number | boolean | null`
  - `interface DumpTable { name: string; columns: string[]; rows: SqlValue[][]; spans: [number, number][] }`.
    `spans` gives the start and end offsets, in the source text, of each
    `INSERT … ;` statement for that table.
  - `parseDump(sql: string): DumpTable[]`
  - `writeInserts(name: string, columns: string[], rows: SqlValue[][], rowsPerInsert = 200): string`

- [ ] **Step 1: Write the failing tests**
  - `reads every row of a pg_dump --column-inserts file`. Use a fixture with
    a `\restrict x` line, `SET` lines, and two tables, one of them with a
    3-row multi-row INSERT. Expect names `['docs','settings']`, 3 rows in
    `docs`, and the correct `columns`.
  - `keeps text exactly`. Expect these values to come back unchanged:
    `'it''s'` → `it's`, a value with a real newline inside the quotes, a
    backslash (`'\x0aff'`), `{"note": "a\"b"}`, and `Zhōng 中 🇲🇾`.
  - `reads NULL, true, false and numbers`.
  - `merges several INSERT statements for one table, in order`.
  - `writes what it reads`: `parseDump(writeInserts(...))` deep-equals the
    original rows, and 450 rows become 3 statements.
- [ ] **Step 2: Run** `npx vitest run src/backup/dump.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `parseDump` and `writeInserts` in `src/backup/dump.ts`.
  - Scan the whole text character by character. Never assume one row per
    line.
  - Recognise `INSERT INTO public.<name> (<cols>) VALUES` followed by
    tuples up to `;`.
  - Inside a quoted string, `''` is a quote. With
    `standard_conforming_strings` on, backslashes are literal.
  - Ignore any line outside an INSERT.
  - `writeInserts` emits pg_dump's layout:
    `INSERT INTO public.<name> (<cols>) VALUES\n\t(…),\n\t(…);\n`. Strings
    are single-quoted with `''`; `NULL`, booleans and numbers are bare.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Backups: read and write pg_dump INSERT statements"`

### Task 2: Tables and CSV

**Files:**
- Create: `src/backup/tables.ts`
- Create: `src/backup/csv.ts`
- Test: `src/backup/tables.test.ts`
- Test: `src/backup/csv.test.ts`

**Interfaces:**
- Consumes: `DumpTable` (Task 1)
- Produces:
  - `type Cell = string | number | boolean | null`
  - `interface Table { name: string; columns: string[]; rows: Cell[][]; monthColumn?: string }`
  - `const PASSWORD_COLUMNS = ['password_hash','password_cipher','password_history'] as const`
  - `tablesFrom(dump: DumpTable[]): Table[]`
  - `toCsv(table: Pick<Table,'columns'|'rows'>): string`
  - `csvFiles(tables: Table[]): Map<string, string>`, mapping path → CSV
  - `monthOf(value: string): string`

**The rules the tests pin:**

- **Where each table comes from.**
  - From `docs`, one table per `kind`:
    - `sale_line`→`sale-lines` (month column `day`)
    - `closing`→`closings`
    - `po`→`orders`
    - `target`→`targets`
    - `promotion`→`promotions`
    - `partner_sales`→`dealer-and-consignment`
    - `product`→`products`
    - `alert_read`→`alerts-read`
    - `setting`→`app-settings`
    - `audit`→`activity` (month column `at`)
    - any other kind gets its name with `_` replaced by `-`
  - `people`→`logins`
  - `locations`→`outlets`
  - `settings`→`settings`
- **Columns of a document table.** First `id, location_id, day, updated_at,
  updated_by, deleted`. Then the document's keys in the order first seen,
  with nested objects flattened with dots (`tender.cash`) and arrays
  written as JSON text. The document's own `id` is skipped.
- **Arrays that become their own tables.**
  - A closing's `lines`, `stockCount` and `writeOffs` become
    `closing-lines`, `closing-stock` (month column `day` on both) and
    `closing-write-offs`. Each row starts with `closing_id, location_id,
    day`.
  - An order's `lines` and `events` become `order-lines` and
    `order-events`. Each row starts with `order_id, location_id`.
  - None of these arrays stays a column on its parent.
- **`logins`.** None of `PASSWORD_COLUMNS` appears. The `doc` is flattened,
  minus `password` and `passwordHistory` keys.
- **`monthOf`.** `YYYY-MM-DD` gives its first 7 characters. An ISO
  timestamp is moved +8 h first, so `2026-10-31T17:30:00.000Z` gives
  `2026-11`.
- **CSV.** A BOM (`﻿`) first, then a header row. Lines end with CRLF.
  A field is quoted when it contains `,`, `"`, CR or LF, and `"` inside
  becomes `""`. `null` becomes empty, booleans become `true` or `false`.
  - A table with a `monthColumn` becomes `<name>/<YYYY-MM>.csv`; any other
    table becomes `<name>.csv`.

- [ ] **Step 1: Write the failing tests**
  - `makes one table per kind, an unknown kind included` (a `gift_card` kind
    gives `gift-card`)
  - `puts the record's own columns first, then the document's, flattened`
  - `gives a closing's lines, stock counts and write-offs their own tables, each tied to its closing`
  - `gives an order's lines and events their own tables`
  - `never carries a password column`: a people fixture whose hash is
    `$2a$10$abc…`; no column name is in `PASSWORD_COLUMNS` and no cell
    contains `$2a$10$`
  - `quotes what needs quoting`
  - `starts with a byte-order mark and ends lines with CRLF`
  - `splits a table by month when it has a month column`, with the
    activity example above
- [ ] **Step 2: Run** `npx vitest run src/backup`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** the same. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Backups: a dump as tables and spreadsheets"`

### Task 3: A read-only login that cannot see passwords

**Files:**
- Create: `supabase/migrations/0007_open_backup_reader.sql`
- Modify: `scripts/backup-reader.mjs`, so that it accepts `--role backup_open_reader` (default `backup_reader`) and writes `backup_open_reader.<ref>` into the URL
- Modify: `ops/backup/scratch-setup.sql`, adding `create role backup_open_reader nologin;`
- Modify: `scripts/verify-server.mjs`

**Interfaces:**
- Produces: the role `backup_open_reader`, which has:
  - `usage` on `public`;
  - `select` on `docs`, `locations` and `settings`;
  - `select (id, username, role, active, doc, updated_at)` on `people`;
  - a `for select to backup_open_reader using (true)` policy on each of
    the four tables;
  - execute revoked on every function;
  - `nocreatedb nocreaterole noinherit`.

  It is created `nologin`, the same way 0006 creates `backup_reader`.

- [ ] **Step 1: Write the failing checks** in `verify-server.mjs`, inside its
  rolled-back transaction, under `set local role backup_open_reader` and
  `reset role` after:
  - `the open copy's login reads the documents`: `select count(*) from docs` > 0;
  - `and the logins without their passwords`: the six columns of `people` and
    `select count(*) from people` both work;
  - `but never a password`: `select password_hash from people limit 1`
    raises an error (use the existing `refuses`);
  - `nor writes anything`: `insert into docs …` is refused;
  - `nor calls the app's functions`: `select load_state(null)` is refused.
- [ ] **Step 2: Run** `node scripts/verify-server.mjs`. Expected: the five new checks FAIL (the role does not exist).
- [ ] **Step 3: Write** `0007` and the scratch-setup line, then copy `ops/backup/scratch-setup.sql` to the encrypted repository and push.
  - This has to happen **before** migrating. The schema dump will name the
    new role in its policies, and tonight's restore test would otherwise
    fail.
- [ ] **Step 4: Run** `node scripts/migrate.mjs` and then `node scripts/verify-server.mjs`. Expected: every check passes (61/61).
- [ ] **Step 5: Issue the login.** Run `node scripts/backup-reader.mjs --role backup_open_reader <scratchpad>/open-url.txt`. Expected: "backup_open_reader has a new password." The file stays in the scratchpad until Task 5 stores it.
- [ ] **Step 6: Run** the encrypted job by hand and check it is green:
  `gh workflow run nightly-backup.yml -R 23f3000111/legendary-crm-backups`
  then `gh run watch --exit-status`.
- [ ] **Step 7: Commit** `git commit -m "A second read-only login for the open copy, blind to passwords"`

### Task 4: The open copy's export script

**Files:**
- Create: `src/backup/people.ts`
- Create: `scripts/open-copy.ts`
- Modify: `package.json`, adding the script `"open-copy": "vite-node scripts/open-copy.ts"`
- Test: `src/backup/people.test.ts`

**Interfaces:**
- Consumes: `writeInserts`, `parseDump` (Task 1); `tablesFrom`, `csvFiles` (Task 2); `connect()` from `scripts/db.mjs`
- Produces:
  - `DEAD_PASSWORD_HASH: string`: a valid bcrypt hash of a random secret
    that is thrown away. Make it once with
    `select crypt(encode(gen_random_bytes(32),'hex'), gen_salt('bf',10))`.
    It is valid so that `sign_in` answers "wrong password" rather than
    raising an error on a bad salt.
  - `PEOPLE_COLUMNS`: the nine columns in table order. The three password
    columns hold the placeholders `DEAD_PASSWORD_HASH`, `'\x'` and `'{}'`.
  - `PEOPLE_DDL: string`: the `create table public.people (…)` statement.
  - `peopleInserts(rows: {id,username,role,active,doc,updated_at}[]): string`
  - `redactDumpText(sql: string): string`: replaces every `people` INSERT
    (found by its `spans`) with the placeholder version and leaves the rest
    of the text byte for byte.
  - The CLI:
    - `npm run open-copy -- people <out.sql>`: with `DATABASE_URL` set, runs
      `set time zone 'UTC'`, then selects `id, username, role, active,
      doc::text, updated_at::text` ordered by `id`;
    - `npm run open-copy -- schema-people <out.sql>`: writes `PEOPLE_DDL`;
    - `npm run open-copy -- tables <data.sql> <dir>`: writes `csvFiles`
      under `dir`.

- [ ] **Step 1: Write the failing tests**
  - `writes people with placeholder passwords, in the table's column order`
  - `the placeholder is a well-formed bcrypt hash`: `/^\$2[ab]\$10\$[./A-Za-z0-9]{53}$/`
  - `takes the passwords out of a dump and leaves everything else as it was`
  - `PEOPLE_DDL matches the people table in 0001_init.sql`: read the
    migration and compare column names, types and nullability
- [ ] **Step 2: Run** `npx vitest run src/backup/people.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `people.ts` and the thin CLI in `scripts/open-copy.ts`.
- [ ] **Step 4: Run** the tests (PASS). Then, with the open login's URL from Task 3 step 5 in `DATABASE_URL`, run `npm run open-copy -- people <scratchpad>/p.sql`. Expected: 40 rows, and no `$2a$10$` other than the placeholder.
- [ ] **Step 5: Commit** `git commit -m "The open copy's export: tables, and people without passwords"`

### Task 5: The open repository and its nightly job

**Files:**
- Create: `ops/open-copy/.github/workflows/nightly-open-copy.yml`
- Create: `ops/open-copy/README.md`
- Create: `ops/open-copy/.gitignore`

**Interfaces:**
- Consumes:
  - from the public CRM repository, checked out at `crm/`:
    `scripts/open-copy.ts`, `ops/backup/restore.mjs`,
    `ops/backup/scratch-setup.sql` and `scripts/supabase-ca.crt`;
  - the repository secret `OPEN_BACKUP_DATABASE_URL`.

**Workflow** (the same shape as `ops/backup/.github/workflows/nightly-backup.yml`):
- **Triggers:** `schedule: '0 19 * * *'`, and `workflow_dispatch` with input
  `keep`.
- **Permissions:** `contents: write`.
- **Services:** a `postgres:17` scratch database.
- **Steps:**
  1. Check out this repository, and `23f3000111/legendary-retail-crm` into
     `crm/`.
  2. Install Node 20 and run `npm ci` in `crm`; then `npm install` in
     `crm/ops/backup`.
  3. Install the Postgres 17 client.
  4. Count all four tables before.
  5. Dump:
     - `pg_dump --schema-only` for `docs`, `locations` and `settings`, plus
       `schema-people` → `schema.sql`;
     - `pg_dump --data-only` for the same three tables, plus `people` →
       `data.sql`.
  6. Count all four tables after.
  7. Restore into the scratch database with `crm/ops/backup/restore.mjs
     --yes`. Every table must land between the before and after counts,
     with the same check as the encrypted job.
  8. Run `tables` into `out/tables`, replace `tables/`, then commit
     `Data as of <stamp>` and push only if anything changed.
  9. Pack `legendary-crm-open-<stamp>.tar.gz` and upload it as an artifact
     kept 30 days.
  10. On the 1st (MYT) or when `keep` is set, also create the release
      `open-<YYYY-MM-DD>`.

**README:**
- what is here and that it is unencrypted;
- that two-step sign-in must be on;
- how to restore from it, ending with `scripts/issue-passwords.mjs`.

- [ ] **Step 1: Create the repository and give it the login.**
  - Create the repository with `gh repo create 23f3000111/legendary-crm-data --private`.
  - Set the secret with `gh secret set OPEN_BACKUP_DATABASE_URL -R 23f3000111/legendary-crm-data < <scratchpad>/open-url.txt`, using the file from Task 3.
  - Run `shred -u` on the file.
- [ ] **Step 2: Push** `ops/open-copy/*` to the new repository from a clone in the scratchpad.
- [ ] **Step 3: Run it now,** so the existing data is in today: `gh workflow run nightly-open-copy.yml -R 23f3000111/legendary-crm-data`, then `gh run watch --exit-status`. Expected: green.
- [ ] **Step 4: Check** that `tables/sale-lines/2026-11.csv` exists, the artifact is listed, and the run summary's people count is 40 and its docs count matches the live server's within the night's growth.
- [ ] **Step 5: Commit** the `ops/open-copy` sources: `git commit -m "The open copy: a private repository with tonight's data, readable"`

### Task 6: The snapshots taken before today

**Files:**
- Create: `scripts/backfill.ts`, run as `vite-node scripts/backfill.ts --open-copy`

**Interfaces:**
- Consumes: `redactDumpText` (Task 4); `gh` on PATH; the passphrase from line 5 of `docs/backup-passphrase.txt`, fed to gpg over `--passphrase-fd 0`
- Produces:
  - `listEncryptedBackups(): Promise<{ name: string; stamp: string; source: 'artifact' | 'release'; runId?: number; tag?: string }[]>`
  - `fetchAndUnlock(b, dir): Promise<string>`, which returns the folder
    holding `schema.sql`, `data.sql` and the counts. On Windows it calls
    `tar --force-local`.

  Task 11 reuses both.

- [ ] **Step 1: Implement and dry-run.** `--open-copy --dry-run` lists every
  backup it would convert, by name. Expected: all the artifacts not yet
  expired, plus the 3 monthly releases.
- [ ] **Step 2: Run** `--open-copy`. For each backup, unlock it, run
  `redactDumpText` on `data.sql`, repack it as `<name>.tar.gz` without
  encryption, and attach them all to one release:
  `gh release create history-2026-11-19 -R 23f3000111/legendary-crm-data --title "Snapshots taken before 19 Nov 2026"`.
  Afterwards `shred` every unlocked file.
- [ ] **Step 3: Check.**
  - The release's asset count equals the dry run's.
  - In one asset, `counts-before.txt` is byte for byte the same as in its
    encrypted twin.
  - That asset's `data.sql` holds no `$2a$10$` other than
    `DEAD_PASSWORD_HASH`.
- [ ] **Step 4: Commit** `git commit -m "Backfill: the snapshots already taken, into the open copy"`

## Phase 2 — the Cloudflare copy and the Backups page

Tasks 7–10 need nothing from the developer. Task 11 needs
`CLOUDFLARE_BACKUP_TOKEN` in `.env` and the exact alert addresses.

### Task 7: The page's server helpers

**Files:**
- Create: `functions/_lib/env.ts`
- Create: `functions/_lib/auth.ts`
- Create: `functions/_lib/guard.ts`
- Create: `functions/_lib/mail.ts`
- Create: `functions/tsconfig.json`, with `types: ["@cloudflare/workers-types"]`, strict, `lib: ["ES2022"]`
- Create: `functions/_lib/fake-kv.ts`, for tests only
- Modify: `package.json`:
  - add the devDependency `@cloudflare/workers-types`;
  - change `build` to `tsc --noEmit && tsc -p functions --noEmit && vite build`
- Test: `functions/_lib/auth.test.ts`, `functions/_lib/guard.test.ts`, `functions/_lib/mail.test.ts`

**Interfaces:**
- Produces:
  - `interface Env { BACKUPS: KVNamespace; BACKUP_PASSWORD_HMAC: string; BACKUP_SESSION_SECRET: string; BACKUP_PASSPHRASE: string; RESEND_API_KEY: string; ALERT_EMAILS: string; ALERT_REPLY_TO: string }`
  - `hmacHex(secret: string, data: string): Promise<string>`, using WebCrypto HMAC-SHA-256
  - `sameText(a: string, b: string): boolean`, which takes constant time
  - `passwordMatches(env: Env, password: string): Promise<boolean>`, which compares `hmacHex(BACKUP_SESSION_SECRET, password)` with `BACKUP_PASSWORD_HMAC`
  - `SESSION_COOKIE = '__Host-lgd_backups'`
  - `SESSION_MS = 3_600_000`
  - `newSession(env: Env, nowMs: number): Promise<string>`, giving `"<expiresMs>.<hmacHex(secret, 'session:'+expiresMs)>"`
  - `sessionValid(env: Env, cookieHeader: string | null, nowMs: number): Promise<boolean>`
  - `type Lock = 'address' | 'page' | 'unavailable' | null`
  - `lockedFor(kv: KVNamespace, ip: string, nowMs: number): Promise<{ lock: Lock; untilMs?: number }>`
  - `recordFailure(kv: KVNamespace, ip: string, nowMs: number): Promise<{ lock: Lock; untilMs?: number }>`. It throws when KV refuses, and keeps its counters under `guard/address/<ip>` and `guard/page` with an expiry.
  - `FROM = 'Legendary CRM backups <backups@legendary.com.my>'`
  - `sendAlert(env: Pick<Env,'RESEND_API_KEY'|'ALERT_EMAILS'|'ALERT_REPLY_TO'>, subject: string, text: string, fetchFn: typeof fetch = fetch): Promise<void>`. It never throws.

- [ ] **Step 1: Write the failing tests**
  - `hmacHex matches RFC 4231 case 2`: key `Jefe`, data `what do ya want for nothing?`, result `5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843`
  - `a session is good for an hour and no longer`
  - `a tampered session, or one signed with another secret, is not`
  - `four wrong tries leave an address open; the fifth locks it for 15 minutes`
  - `another address is not affected`
  - `twenty wrong tries in an hour from anywhere lock the page for an hour`
  - `is unavailable when it cannot count`: a fake KV whose `put` throws, so `lockedFor` returns `'unavailable'`
  - `sends to every alert address with the reply-to set, and carries nothing it was not given`
  - `a failed send does not throw`
- [ ] **Step 2: Run** `npx vitest run functions`. Expected: FAIL.
- [ ] **Step 3: Implement** the four modules.
- [ ] **Step 4: Run** `npx vitest run functions` and `npx tsc -p functions --noEmit`. Expected: PASS, with no type errors.
- [ ] **Step 5: Commit** `git commit -m "Backups page: password, session, lockout and mail helpers"`

### Task 8: The page's endpoints

**Files:**
- Create: `functions/api/backups/_middleware.ts`
- Create: `functions/api/backups/sign-in.ts`
- Create: `functions/api/backups/list.ts`
- Create: `functions/api/backups/key.ts`
- Create: `functions/api/backups/file/[[key]].ts`
- Test: `functions/api/backups/endpoints.test.ts`

**Interfaces:**
- Consumes: everything in Task 7
- Produces (as JSON unless noted):
  - **Every response, from the middleware:** `Cache-Control: no-store`,
    `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` and
    `X-Content-Type-Options: nosniff`. Every route except
    `POST sign-in` needs `sessionValid`, or it gets `401 {error:'Sign in again.'}`.
  - **`POST sign-in {password}`** (at most 200 characters) answers one of:
    - `200 {ok:true}` with `Set-Cookie`, after sending the email "Backups
      page opened" with the time (MYT) and `request.cf.city` and `country`
      through `waitUntil`;
    - `401 {error:'That password is not right.'}`;
    - `429 {error, lock, until}`;
    - `503 {error:'Sign-in is paused. Try again later.'}`.

    The address comes from `CF-Connecting-IP`. A failure that triggers the
    page lock emails "Backups page locked".
  - **`GET list`** returns `{ now: ISO, backups: [{ key, kind: 'nightly'|'monthly', takenAt, sizeBytes, counts }] }`,
    newest `takenAt` first, from KV lists of `nightly/` and `monthly/`.
  - **`GET key`** returns `{ passphrase }`.
  - **`GET file/<key>`** only accepts a key matching
    `^(nightly|monthly)/[0-9_-]+$`; anything else gets 400, a missing key
    404. It streams `application/octet-stream` with `Content-Disposition:
    attachment; filename="legendary-crm-<stamp>.tar.gz.gpg"`.

- [ ] **Step 1: Write the failing tests.** Call the exported `onRequest*`
  with `{ request, env, params, waitUntil, next }`.
  - `refuses everything but sign-in without a session`
  - `signs in with the right password and sets a one-hour __Host- cookie`, asserting `Max-Age=3600`, `HttpOnly`, `Secure` and `SameSite=Strict`
  - `a wrong password is refused and counted; the sixth try is told to wait`
  - `refuses sign-in while the guard cannot count`, which answers 503
  - `sends one email per sign-in, and neither the password nor the passphrase is in it`
  - `lists newest first, with the server's own time`
  - `streams a backup and names the file`
  - `refuses a key outside the two folders`
  - `every response is uncached and unindexed`
- [ ] **Step 2: Run** `npx vitest run functions`. Expected: FAIL.
- [ ] **Step 3: Implement** the five files.
- [ ] **Step 4: Run.** Expected: PASS. Then run `npx wrangler@4 pages functions build --outdir <scratchpad>/fx` and check that `_routes.json` includes only `/api/backups/*`, so the CRM's own pages never wake a Function.
- [ ] **Step 5: Commit** `git commit -m "Backups page: sign-in, list, key and file endpoints"`

### Task 9: Opening a backup in the browser

**Files:**
- Create: `src/backup/tar.ts`
- Create: `src/backups/open.ts`
- Create: `src/backups/__fixtures__/gpg-made.tar.gz.gpg`, a synthetic dump of a few rows made by the nightly job's exact gpg command with the passphrase `test-passphrase-only`
- Create: `src/backups/__fixtures__/README.md`, saying how the fixture was made
- Modify: `package.json`, adding the dependencies `openpgp` (v6) and `fflate`
- Test: `src/backup/tar.test.ts`, `src/backups/open.test.ts`

**Interfaces:**
- Consumes: `parseDump` (Task 1), `tablesFrom` (Task 2)
- Produces:
  - `readTar(bytes: Uint8Array): Map<string, Uint8Array>`, for ustar regular files
  - `class CannotUnlock extends Error {}`
  - `interface OpenedBackup { counts: Record<string, number>; tables: Table[] }`
  - `openBackup(encrypted: Uint8Array, passphrase: string): Promise<OpenedBackup>`. The steps are `openpgp.readMessage({ binaryMessage })`, then `decrypt({ passwords: [passphrase], format: 'binary' })`, then `gunzipSync`, `readTar`, and `counts-before.txt` plus `data.sql`, then `parseDump` and `tablesFrom`.

- [ ] **Step 1: Write the failing tests**
  - `reads the files of a tar made by GNU tar`
  - `opens a backup made the way the nightly job makes them`, using the gpg fixture
  - `opens one encrypted here with OpenPGP.js at AES-256 and 65,011,712 rounds`
  - `says so when it cannot unlock`: a wrong passphrase rejects with `CannotUnlock`
  - `never hands back a password column`
- [ ] **Step 2: Run** `npx vitest run src/backup src/backups`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Backups page: unlock and read a backup in the browser"`

### Task 10: The page

**Files:**
- Create: `backups/index.html`, titled `Legendary CRM backups`, with `<meta name="robots" content="noindex, nofollow">` and the same fonts as `index.html`
- Create: `src/backups/main.tsx`
- Create: `src/backups/BackupsApp.tsx`
- Create: `src/backups/api.ts`, which calls `../api/backups/*` relative to the page
- Create: `src/backups/view.ts`
- Modify: `vite.config.ts`, setting `build.rollupOptions.input` to `{ main: 'index.html', backups: 'backups/index.html' }`
- Modify: `tailwind.config.js`, adding `./backups/index.html` to `content`
- Create: `public/_headers`. For `/backups/*` it sets:
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`
  - `Referrer-Policy: no-referrer`
  - `X-Robots-Tag: noindex, nofollow`
  - `Cache-Control: no-store`
- Test: `src/backups/view.test.ts`

**Interfaces:**
- Consumes: `openBackup` and `CannotUnlock` (Task 9); `toCsv` and `csvFiles` (Task 2); the endpoints (Task 8); `fflate.zipSync` for Download everything
- Produces:
  - `visibleRows(table: Table, query: string, limit = 200): { rows: Cell[][]; matched: number }`, matching case-insensitively on any cell
  - `formatMyt(iso: string): string`, so that `'2026-11-18T01:06:00.000Z'` gives `'18 Nov 2026, 09:06'` with `timeZone: 'Asia/Kuala_Lumpur'`
  - `hoursOld(takenAtIso: string, serverNowIso: string): number`

**The page's text** (copy exactly):
- **Signing in:**
  - the label "Backup password" and the button "Open";
  - "That password is not right.";
  - "Too many wrong tries. Try again after {HH:MM}.";
  - "The page is locked after too many wrong tries. Try again after {HH:MM}.";
  - "Sign-in is paused. Try again later."
- **The list:**
  - each row reads "Taken {formatMyt}";
  - the stale banner reads "No backup has been taken for {n} hours. Check
    the backups repository on GitHub." It shows when `hoursOld > 30`.
- **Opening a backup:**
  - progress reads "Downloading…", then "Unlocking…", then "Reading…";
  - the buttons are "Download as spreadsheet", "Download everything" and
    "Download the encrypted file";
  - the cannot-unlock message reads "This backup can't be unlocked with the
    key the page holds."
- **Off Cloudflare:** where `list` does not answer with JSON (the GitHub
  Pages mirror), the page says "Open this page at
  crm.legendary.com.my/backups."
- **Nothing is kept:** no `localStorage`, `sessionStorage` or IndexedDB.
  The passphrase lives only in a variable while a backup is open.

- [ ] **Step 1: Write the failing tests**
  - `draws at most 200 rows, and says how many matched`
  - `searches every column, ignoring case`
  - `formats in Malaysia time whatever the device says`: run with `process.env.TZ='America/New_York'`
  - `judges staleness by the server's clock`
- [ ] **Step 2: Run** `npx vitest run src/backups`. Expected: FAIL.
- [ ] **Step 3: Implement** `view.ts`, then the page in the CRM's existing look, with Load more adding 200 rows.
- [ ] **Step 4: Run** the tests (PASS), then `npm run build`. Expected: `dist/backups/index.html` exists, and the CRM's main bundle has no `openpgp` in it (`grep -L openpgp dist/assets/index-*.js`).
- [ ] **Step 5: Commit** `git commit -m "Backups page: sign in, choose a backup, read it, download it"`

### Task 11: The Cloudflare copy, the setup, and going live

**Files:**
- Create: `scripts/backup-page-setup.mjs`
- Modify: `scripts/backfill.ts`, adding `--cloudflare`
- Modify: `ops/backup/.github/workflows/nightly-backup.yml`
- Modify: `ops/backup/README.md`
- Modify: `.gitignore`, adding `backup-page-password*.txt` and `.dev.vars`

**Interfaces:**
- Consumes: from `.env`, `CLOUDFLARE_API_TOKEN` (Pages), `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_BACKUP_TOKEN` (KV and Workers) and `RESEND_API_KEY` (full access); the passphrase from line 5; `listEncryptedBackups` and `fetchAndUnlock` (Phase 1, Task 6)
- Produces:
  - `backup-page-setup.mjs --alert-emails a,b,c --reply-to x [--dry-run] [--rotate-password]`. It:
    - creates the KV namespace `legendary-crm-backups` if it is missing;
    - makes a Resend `sending_access` key for legendary.com.my;
    - generates the page password and a 32-byte session secret;
    - PATCHes the Pages project's production `env_vars` (as
      `secret_text`) and the `kv_namespaces.BACKUPS` binding;
    - sets the encrypted repository's secrets `CF_KV_TOKEN`,
      `CF_ACCOUNT_ID` and `CF_KV_NAMESPACE` by piping them on stdin;
    - writes the page password to `docs/backup-page-password.txt`;
    - prints names, never values.

    `--rotate-password` changes only the password and the session secret.
  - **The workflow:**
    - `Take the backup` records `TAKEN_AT`;
    - a new step before `Encrypt` builds `META` from `counts-before.txt`;
    - a last step, `Copy to Cloudflare`, refuses a file over 25,165,824
      bytes, then PUTs `nightly%2F$STAMP?expiration_ttl=2678400` as
      multipart `value` + `metadata`. On the 1st or with `keep`, it also
      writes `monthly%2F<YYYY-MM-01>`.

    The step goes after the GitHub artifact and the release, so a
    Cloudflare outage never costs the GitHub copy.

- [ ] **Step 1: Dry run.** Run `node scripts/backup-page-setup.mjs --dry-run --alert-emails … --reply-to …`. Expected: it lists what it would create and set, by name.
- [ ] **Step 2: Run it for real.** Then `vite-node scripts/backfill.ts --cloudflare`. Expected: KV holds a key for every listed backup, with metadata.
- [ ] **Step 3: Check locally, end to end.**
  - Run `npm run build`, put test values in `.dev.vars`, and start
    `npx wrangler@4 pages dev dist --kv BACKUPS`.
  - Put the gpg fixture into local KV under `nightly/2026-01-01_0000`.
  - With Playwright, check that you can sign in, see the list, open the
    backup, see `sale-lines`, and download a CSV that opens with its BOM.
  - Check that a wrong password six times gives the wait message.
- [ ] **Step 4: Copy and push.** Copy `ops/backup/*` to the encrypted repository and push. Run its job by hand. Expected: green, with a new `nightly/` key in KV.
- [ ] **Step 5: Go live.** Push the CRM (the deploy workflow publishes `dist` and `functions/`). On https://crm.legendary.com.my/backups/:
  - sign in with the password from `docs/backup-page-password.txt`;
  - open the newest backup;
  - check that its counts equal that run's counts.

  Then ask the developer whether the sign-in email arrived.
- [ ] **Step 6: Commit** the README (the Cloudflare copy, the page, changing the password) and the workflow: `git commit -m "Backups in Cloudflare too, and the Backups page live"`

## Phase 3 — the missed-night warning

### Task 12: The watch Worker

**Files:**
- Create: `workers/backup-watch/wrangler.toml`. It sets:
  - `name = "legendary-crm-backup-watch"`, `main = "src/index.ts"`, `compatibility_date = "2024-11-01"`
  - `[triggers] crons = ["0 3 * * *"]`
  - `[[kv_namespaces]] binding = "BACKUPS"`, with the namespace id from Task 11
- Create: `workers/backup-watch/src/index.ts`
- Create: `workers/backup-watch/tsconfig.json`
- Test: `workers/backup-watch/src/index.test.ts`

**Interfaces:**
- Consumes: `sendAlert` (`functions/_lib/mail.ts`), the KV metadata
- Produces:
  - `newestTakenAt(keys: { name: string; metadata?: { takenAt?: string } }[]): string | null`
  - `hoursSince(iso: string, nowMs: number): number`
  - `default { scheduled(event, env, ctx) }`. It lists both prefixes, and
    when the newest backup is more than 30 hours old it emails "No CRM
    backup for {n} hours". The body gives the last backup in MYT and the
    link `https://github.com/23f3000111/legendary-crm-backups/actions`.

- [ ] **Step 1: Write the failing tests**
  - `finds the newest across nightly and monthly`
  - `stays quiet at 29 h 59 m and speaks at 30 h 01 m`
  - `sends exactly one email when stale and none when not`
  - `treats an empty store as stale`
- [ ] **Step 2: Run** `npx vitest run workers`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests (PASS). Then deploy:
  - `npx wrangler@4 deploy` in `workers/backup-watch`, with `CLOUDFLARE_API_TOKEN=$CLOUDFLARE_BACKUP_TOKEN`;
  - `npx wrangler@4 secret put` for `RESEND_API_KEY`, `ALERT_EMAILS` and `ALERT_REPLY_TO`, on stdin.

  Expected: `GET /accounts/{id}/workers/scripts/legendary-crm-backup-watch/schedules` lists `0 3 * * *`.
- [ ] **Step 5: Wrap up.** Commit with `git commit -m "A daily check that last night's backup exists"`. Then update memory: three copies, where each lives, the page, and the rotation script.
