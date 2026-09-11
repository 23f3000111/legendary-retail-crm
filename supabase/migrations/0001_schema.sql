-- ============================================================================
-- Legendary Retail CRM — database schema
--
-- Postgres 15+. Written for Supabase (it uses RLS and Vault), but the only
-- Supabase-specific part is current_app_user(), which reads the signed-in
-- person from the session's JWT claim. On plain Postgres, replace that one
-- function and everything else runs unchanged.
--
-- Design rules, all traceable to the client's answers:
--
--   * Money is never stored against stock. Once stock leaves the warehouse it is
--     no longer Legendary's (Q35), so stock tables hold quantities only and SQL
--     Accounting remains the book of record.
--   * Revenue is never stored as a typed total. It is the sum of sale_lines, so
--     a product or country filter is exact rather than approximate.
--   * Country lives on the sale line, not on the closing, because the client
--     needs to know exactly which nationality bought which perfume (Q29).
--   * Figures exclude SST (Q24).
--   * Everyone signs in with a username and password; leadership and IT also
--     get a six-digit code by e-mail. Senior staff can look a password up, as
--     they could the PIN, so each is held twice — an Argon2 hash to check it and
--     an encrypted copy for the look-up. See docs/spec/auth.md.
-- ============================================================================

-- pgcrypto gives us gen_random_uuid() and the digest used for the sign-in
-- code. Password hashing is Argon2id, done in the Edge Function rather than
-- here — Postgres has no Argon2 of its own, and a password should never travel
-- as far as a SQL statement in the first place.
create extension if not exists "pgcrypto";

-- ── Enums ───────────────────────────────────────────────────────────────────

create type channel        as enum ('main', 'dealer', 'consignment');
create type cadence        as enum ('daily', 'monthly');
create type location_status as enum ('open', 'coming', 'closed');
create type variant        as enum ('retail', 'set', 'tester');
-- Which of the two prices a location's revenue is counted on (Revision 2).
create type price_basis    as enum ('retail', 'promotion');
create type app_role       as enum ('director','md','ops','pa','finance','warehouse','promoter','it');
create type po_status      as enum ('draft','submitted','approved','rejected','accounts_cleared','packed','in_transit','received');
create type write_off_reason as enum ('tester','damaged','sample');
create type correction_status as enum ('pending','approved','rejected');
create type alert_type     as enum ('missed_closing','low_stock','correction_pending','po_waiting','target_risk');
create type severity       as enum ('warn','serious','critical');
create type promo_mechanic as enum ('discount','bundle','gift','member','other');
create type audit_kind    as enum ('session','sale','closing','correction','order','login','password','promotion','target','alert');

-- ── Reference data ──────────────────────────────────────────────────────────

create table countries (
  code        char(2) primary key,
  name        text not null,
  flag        text not null,
  bloc        text not null
);

create table locations (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  short_name        text not null,
  channel           channel not null,
  region            text not null,
  status            location_status not null default 'open',
  cadence           cadence not null,
  -- Only main stores capture the buyer's nationality (Q29).
  records_countries boolean not null default false,
  -- What Legendary keeps. Dealers are all 70%; consignment runs 48.5%–70%.
  margin_pct        numeric(5,2),
  -- Retail or promotion. BSAS and Sasa are on retail, everybody else on
  -- promotion, and the two differ by more than 20% — so a figure computed on
  -- the wrong one is simply wrong.
  price_basis       price_basis not null default 'promotion',
  opened_on         date,
  created_at        timestamptz not null default now(),

  constraint countries_only_on_main
    check (records_countries = false or channel = 'main')
);

create index on locations (channel, status);

create table products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  collection    text not null,
  family        text,
  audience      text,
  discontinued  boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Every size, refill, gift set and tester is counted separately (Q54), so a SKU
-- is "a thing you can count on a shelf" and a product is the fragrance.
create table skus (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products(id) on delete restrict,
  code           text not null unique,
  label          text not null,
  variant        variant not null,
  size           text not null,
  -- Two prices, and the location decides which one counts. Stores may retail
  -- at their own price on the shelf (Q60); these are what Legendary counts.
  retail_price_myr    numeric(10,2) not null default 0 check (retail_price_myr >= 0),
  promotion_price_myr numeric(10,2) not null default 0 check (promotion_price_myr >= 0),
  offer_myr           numeric(10,2),
  reorder_point  integer not null default 0 check (reorder_point >= 0),
  case_size      integer not null default 12 check (case_size > 0),
  -- Testers are never sold.
  sellable       boolean not null default true,
  -- Testers are ordered but never counted on a shelf (Revision 2).
  counted        boolean not null default true,

  constraint only_sellable_lines_are_priced
    check (sellable or (retail_price_myr = 0 and promotion_price_myr = 0)),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),

  unique (product_id, variant, size)
);

create index on skus (product_id) where active;

-- ── People ──────────────────────────────────────────────────────────────────
--
-- Sign-in is a username and a password. Leadership and IT also get a six-digit
-- code by e-mail (see two_step_roles() below).
--
-- Everything else works as the PINs did, at the client's instruction —
-- including that senior staff can look a password up. A hash cannot be read
-- back, so each password is held twice:
--
--   password_hash    Argon2id. Checked at sign-in. Not reversible.
--   password_cipher  pgp_sym_encrypt with a key held in Supabase Vault. Read
--                    only through reveal_password(), which checks authority
--                    first and writes the look-up to the activity log.
--
-- The key is never in this file, the application, or a database dump, so a
-- stolen copy of the tables is not a list of everybody's password.

create table app_users (
  id              uuid primary key default gen_random_uuid(),
  -- What they type to sign in.
  username        text not null unique
                  check (username = lower(username) and length(username) >= 3),
  name            text not null,
  -- Where the sign-in code is sent.
  email           text not null unique,
  role            app_role not null,
  title           text,
  -- Promoters belong to one store; everyone else is head office.
  location_id     uuid references locations(id) on delete restrict,
  -- Argon2id, for checking at sign-in.
  password_hash   text not null,
  -- The recoverable copy. Meaningless without the Vault key.
  password_cipher bytea not null,
  password_set_at timestamptz not null default now(),
  password_set_by uuid references app_users(id),
  initials        text not null,
  accent          text not null default 'blue',
  active          boolean not null default true,
  -- IT's own login is hidden from every other person's Logins screen.
  hidden          boolean not null default false,
  created_at      timestamptz not null default now(),
  created_by      uuid references app_users(id),
  disabled_at     timestamptz,

  constraint promoter_needs_a_store
    check (role <> 'promoter' or location_id is not null)
);

create index on app_users (role) where active;
create index on app_users (location_id) where active;

-- Every password a person has ever held, as a hash. A password is never
-- reissued to the same person, and that is enforced here rather than trusted
-- to the application.
create table password_history (
  user_id       uuid not null references app_users(id) on delete cascade,
  password_hash text not null,
  retired_at    timestamptz not null default now(),
  retired_by    uuid references app_users(id),
  primary key (user_id, password_hash)
);

-- The second step, for the roles in two_step_roles() only. A code lives for
-- ten minutes, is good for one use, and is stored hashed — a table of live
-- codes in clear text would undo the point of having a second step at all.
create table login_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_users(id) on delete cascade,
  code_hash   text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  attempts    integer not null default 0,
  -- Where the attempt came from, for the rate limit below.
  device_id   text
);

create index on login_codes (user_id, created_at desc);
create index on login_codes (expires_at) where consumed_at is null;

-- Sign-in attempts, so an account can be held after five wrong passwords
-- without trusting the browser to count them.
create table login_attempts (
  id         bigserial primary key,
  -- Never the password or the code that was tried, not even hashed: a log of
  -- guesses is a list of candidate passwords.
  username   text,
  device_id  text not null,
  at         timestamptz not null default now(),
  succeeded  boolean not null,
  user_id    uuid references app_users(id) on delete set null
);

create index on login_attempts (username, at desc);
create index on login_attempts (device_id, at desc);

-- ── Trading ─────────────────────────────────────────────────────────────────

create table closings (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references locations(id) on delete restrict,
  -- The trading day, or the first of the month for consignment.
  period         date not null,
  period_type    cadence not null,
  -- Daily channels split payment three ways; consignment reports one figure (Q21).
  cash_myr       numeric(12,2),
  ewallet_myr    numeric(12,2),
  card_myr       numeric(12,2),
  -- Staff purchases are kept apart from normal trade (Q23).
  staff_units    integer not null default 0 check (staff_units >= 0),
  staff_myr      numeric(12,2) not null default 0 check (staff_myr >= 0),
  submitted_by   uuid not null references app_users(id),
  submitted_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  -- One filing per location per period. Re-filing updates in place.
  unique (location_id, period)
);

create index on closings (period desc);
create index on closings (location_id, period desc);

create table sale_lines (
  id            uuid primary key default gen_random_uuid(),
  closing_id    uuid not null references closings(id) on delete cascade,
  sku_id        uuid not null references skus(id) on delete restrict,
  qty           integer not null check (qty > 0),
  -- Main stores only. Null everywhere else, and excluded — never estimated —
  -- when a report filters by country.
  country_code  char(2) references countries(code),
  sold_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index on sale_lines (closing_id);
create index on sale_lines (sku_id);
create index on sale_lines (country_code) where country_code is not null;

-- Revenue is derived, never typed. A generated column would need a subquery, so
-- this view is the single definition every report reads.
create view closing_totals as
select
  c.id                                            as closing_id,
  c.location_id,
  c.period,
  c.period_type,
  -- Counted on whichever price this location is counted on.
  coalesce(
    sum(sl.qty * case l.price_basis
                   when 'retail' then s.retail_price_myr
                   else s.promotion_price_myr
                 end),
    0
  )::numeric(14,2) as revenue_myr,
  coalesce(sum(sl.qty), 0)                        as units,
  coalesce(sum(sl.qty) filter (where sl.country_code is not null), 0) as attributed_units
from closings c
join      locations  l on l.id = c.location_id
left join sale_lines sl on sl.closing_id = c.id
left join skus       s  on s.id = sl.sku_id
group by c.id, l.price_basis;


-- Every product counted every night (Q20).
create table stock_counts (
  closing_id   uuid not null references closings(id) on delete cascade,
  sku_id       uuid not null references skus(id) on delete restrict,
  opening      integer not null check (opening >= 0),
  counted      integer not null check (counted >= 0),
  primary key (closing_id, sku_id)
);

-- Testers used, damages and samples. Only Kelly or Davy approve (Q25, Q43).
create table write_offs (
  id           uuid primary key default gen_random_uuid(),
  closing_id   uuid not null references closings(id) on delete cascade,
  sku_id       uuid not null references skus(id) on delete restrict,
  qty          integer not null check (qty > 0),
  reason       write_off_reason not null,
  note         text,
  approved_by  uuid references app_users(id),
  approved_at  timestamptz
);

-- A filed closing may be corrected for three days, with Kelly's approval (Q19).
create table corrections (
  id                   uuid primary key default gen_random_uuid(),
  closing_id           uuid not null references closings(id) on delete cascade,
  requested_by         uuid not null references app_users(id),
  requested_at         timestamptz not null default now(),
  reason               text not null check (length(btrim(reason)) > 0),
  previous_revenue_myr numeric(12,2) not null,
  status               correction_status not null default 'pending',
  approved_by          uuid references app_users(id),
  approved_at          timestamptz
);

create index on corrections (status) where status = 'pending';

-- ── Purchase orders ─────────────────────────────────────────────────────────
--
-- Store asks, Kelly approves, Finance clears, the warehouse sends, the store
-- confirms (Q45). No supplier orders (Q49); no back-orders (Q52).

create table purchase_orders (
  id           uuid primary key default gen_random_uuid(),
  reference    text not null unique,
  location_id  uuid not null references locations(id) on delete restrict,
  status       po_status not null default 'draft',
  priority     text not null default 'standard' check (priority in ('standard','urgent')),
  notes        text,
  created_by   uuid not null references app_users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on purchase_orders (status);
create index on purchase_orders (location_id, created_at desc);

create table po_lines (
  id            uuid primary key default gen_random_uuid(),
  po_id         uuid not null references purchase_orders(id) on delete cascade,
  sku_id        uuid not null references skus(id) on delete restrict,
  qty_requested integer not null check (qty_requested > 0),
  qty_approved  integer check (qty_approved >= 0),
  qty_shipped   integer check (qty_shipped >= 0),
  unique (po_id, sku_id)
);

-- The event trail is what the order timeline renders from, so it is the record
-- of what happened rather than a status plus a date.
create table po_events (
  id         uuid primary key default gen_random_uuid(),
  po_id      uuid not null references purchase_orders(id) on delete cascade,
  status     po_status not null,
  actor_id   uuid not null references app_users(id),
  actor_role app_role not null,
  note       text,
  at         timestamptz not null default now()
);

create index on po_events (po_id, at);

-- ── Targets and alerts ──────────────────────────────────────────────────────

create table targets (
  location_id uuid not null references locations(id) on delete cascade,
  month       date not null,          -- always the 1st
  amount_myr  numeric(12,2) not null check (amount_myr >= 0),
  set_by      uuid references app_users(id),
  set_at      timestamptz not null default now(),
  primary key (location_id, month)
);

-- ── Promotions ──────────────────────────────────────────────────────────────
--
-- Q59: "Davy plan in advance, Chloe record in system, and inform Imran."
--
-- A promotion never changes a figure. Only revenue is recorded (Q58) and the
-- client does not want the system minding what each shop charges (Q60), so this
-- is a record of what was run and where — context beside the numbers, not
-- arithmetic applied to them.

create table promotions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  mechanic     promo_mechanic not null,
  detail       text not null,
  starts_on    date not null,
  ends_on      date not null,
  planned_by   text not null,
  recorded_by  uuid not null references app_users(id),
  recorded_at  timestamptz not null default now(),
  -- The last step of the client's own process.
  informed_it  boolean not null default false,
  notes        text,

  constraint ends_after_it_starts check (ends_on >= starts_on)
);

create index on promotions (starts_on, ends_on);
create index on promotions (informed_it) where informed_it = false;

-- No rows means "everywhere it is sold" / "every product".
create table promotion_locations (
  promotion_id uuid not null references promotions(id) on delete cascade,
  location_id  uuid not null references locations(id) on delete cascade,
  primary key (promotion_id, location_id)
);

create table promotion_skus (
  promotion_id uuid not null references promotions(id) on delete cascade,
  sku_id       uuid not null references skus(id) on delete cascade,
  primary key (promotion_id, sku_id)
);

create table alerts (
  id           uuid primary key default gen_random_uuid(),
  type         alert_type not null,
  severity     severity not null,
  location_id  uuid references locations(id) on delete cascade,
  sku_id       uuid references skus(id) on delete cascade,
  po_id        uuid references purchase_orders(id) on delete cascade,
  message      text not null,
  at           timestamptz not null default now(),
  read_at      timestamptz,
  read_by      uuid references app_users(id)
);

create index on alerts (read_at) where read_at is null;

-- ── The activity log ────────────────────────────────────────────────────────
--
-- Q67 said the accounting side would handle the audit trail. The client has
-- since asked for it here, and this is the table behind it: every action, who
-- did it, and when.
--
-- Two things make it trustworthy rather than decorative:
--
--   1. **It is append-only.** There is a policy for insert and one for select,
--      and none at all for update or delete — under row-level security, an
--      operation with no policy is refused. Nobody can quietly tidy the log,
--      including the Managing Director and IT.
--   2. **The database writes it, not only the app.** `record_change()` is
--      attached as a trigger to every table that matters, so a row written by
--      a migration, a psql session or a future script is logged the same as one
--      written by a screen. An audit trail the application can forget to write
--      is an audit trail with holes in it.
--
-- The application still writes its own rows through `record_action()`, because
-- "Kelly Tew approved PO-2026-0131 for Pavilion KL" is worth far more to a
-- reader than a column diff. The two live side by side: `summary` carries the
-- sentence, `changes` carries the evidence.

create table audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid references app_users(id),
  -- Kept as text as well as a reference, so the log still reads correctly after
  -- somebody leaves and their login is removed.
  actor_name  text not null,
  actor_role  app_role,
  kind        audit_kind not null,
  -- Stable slug, e.g. 'order.approved'. Safe to filter and to alert on.
  action      text not null,
  -- One line, in plain English, written for whoever reads this in a year.
  summary     text not null,
  entity_id   uuid,
  location_id uuid references locations(id) on delete set null,
  detail      text,
  -- Set by the trigger: which table and what changed.
  table_name  text,
  changes     jsonb
);

create index on audit_log (at desc);
create index on audit_log (actor_id, at desc);
create index on audit_log (kind, at desc);
create index on audit_log (entity_id, at desc);
create index on audit_log (table_name, entity_id, at desc);

-- ── Passwords: who may set and see whose ────────────────────────────────────
--
-- Exactly the PIN rules, which the client set out and asked to keep:
--
--   IT ................. anyone, including the Managing Director and itself
--   Managing Director .. anyone visible to him, including the Director and himself
--   Ops / PA ........... themselves, Finance, Warehouse and Store Promoters —
--                        but not each other, and not the Managing Director
--   Finance ............ themselves only
--   Warehouse .......... themselves only
--   Store Promoter ..... nobody; they use the password a senior gave them
--   Director ........... nobody; the role cannot edit anything
--
-- Seeing a password follows the same table as setting one. This mirrors
-- canResetPasswordOf() in src/data/people.ts: the browser copy decides which
-- buttons appear, this copy decides what actually happens.

create or replace function password_targets(actor app_role)
returns app_role[]
language sql immutable
as $fn$
  select case actor
    when 'it'        then array['director','md','ops','pa','finance','warehouse','promoter','it']::app_role[]
    when 'md'        then array['director','md','ops','pa','finance','warehouse','promoter']::app_role[]
    when 'ops'       then array['ops','finance','warehouse','promoter']::app_role[]
    when 'pa'        then array['pa','finance','warehouse','promoter']::app_role[]
    when 'finance'   then array['finance']::app_role[]
    when 'warehouse' then array['warehouse']::app_role[]
    else array[]::app_role[]
  end;
$fn$;

-- IT's login is hidden from everyone but IT.
create or replace function can_see_user(actor app_users, target app_users)
returns boolean
language sql immutable
as $fn$
  select not target.hidden or target.id = actor.id;
$fn$;

create or replace function can_reset_password_of(actor app_users, target app_users)
returns boolean
language sql immutable
as $fn$
  select
    can_see_user(actor, target)
    and target.role = any (password_targets(actor.role))
    and case
      -- Ops and the PA reach their own role only for themselves, never a colleague.
      when actor.role in ('ops','pa') and actor.role = target.role then actor.id = target.id
      -- Finance and the Warehouse change their own only.
      when actor.role in ('finance','warehouse') then actor.id = target.id
      else true
    end;
$fn$;

create or replace function can_see_password_of(actor app_users, target app_users)
returns boolean
language sql immutable
as $fn$
  select can_reset_password_of(actor, target);
$fn$;

-- Who gets the second step: the four who can read other people's passwords,
-- and the Director. One line to widen.
create or replace function two_step_roles()
returns app_role[]
language sql immutable
as $fn$
  select array['director','md','ops','pa','it']::app_role[];
$fn$;

create or replace function password_key() returns text
language sql stable security definer as $fn$
  select decrypted_secret from vault.decrypted_secrets where name = 'password_key';
$fn$;

-- ── Setting a password ──────────────────────────────────────────────────────
--
-- The hash and the encrypted copy both arrive already computed. They are made
-- in the Edge Function, not here: doing either in SQL would mean the password
-- itself travelling through the query log and the statement cache on its way in.

create or replace function set_password(target_id uuid, new_hash text, new_cipher bytea)
returns void
language plpgsql security definer as $fn$
declare
  actor  app_users;
  target app_users;
begin
  actor := current_app_user();
  if actor is null then raise exception 'Not signed in'; end if;

  select * into target from app_users where id = target_id;
  if target is null then raise exception 'That login no longer exists'; end if;

  if not can_reset_password_of(actor, target) then
    raise exception 'You cannot set the password for %', target.name;
  end if;

  if exists (
    select 1 from password_history h
    where h.user_id = target_id and h.password_hash = new_hash
  ) or target.password_hash = new_hash then
    raise exception 'That password has been used before. Choose a new one';
  end if;

  insert into password_history (user_id, password_hash, retired_by)
  values (target_id, target.password_hash, actor.id)
  on conflict do nothing;

  update app_users
  set password_hash = new_hash,
      password_cipher = new_cipher,
      password_set_at = now(),
      password_set_by = actor.id
  where id = target_id;

  insert into audit_log (actor_id, actor_name, actor_role, kind, action, summary,
                         entity_id, table_name)
  values (actor.id, actor.name, actor.role, 'password',
          case when actor.id = target_id then 'password.changed' else 'password.reset' end,
          case when actor.id = target_id
               then 'Changed their own password'
               else format('Reset the password for %s', target.name) end,
          target_id, 'app_users');
end $fn$;

-- Reads a password back. The client asked for this, as they had for PINs; the
-- authority check and the audit row are what make it defensible.
create or replace function reveal_password(target_id uuid)
returns text
language plpgsql security definer as $fn$
declare
  actor  app_users;
  target app_users;
begin
  actor := current_app_user();
  select * into target from app_users where id = target_id;
  if actor is null or target is null then raise exception 'Not permitted'; end if;
  if not can_see_password_of(actor, target) then
    raise exception 'You cannot see the password for %', target.name;
  end if;

  -- The look-up is the thing worth recording, never the password.
  insert into audit_log (actor_id, actor_name, actor_role, kind, action, summary,
                         entity_id, table_name)
  values (actor.id, actor.name, actor.role, 'password', 'password.revealed',
          case when actor.id = target.id
               then 'Looked at their own password'
               else format('Looked at the password for %s', target.name) end,
          target_id, 'app_users');

  return pgp_sym_decrypt(target.password_cipher, password_key());
end $fn$;

-- ── Signing in ──────────────────────────────────────────────────────────────
--
-- The first call checks the password. For most people that is the whole of it
-- and it returns their id; for the roles in two_step_roles() it issues a code
-- and returns the code's id instead, to be redeemed by the second call. Both
-- return NULL rather than raising on failure, so the row recording the attempt
-- survives — `raise exception` rolls the transaction back and would take the
-- evidence with it.

create or replace function begin_sign_in(
  p_username text,
  password_ok boolean,
  p_code_hash text,
  p_device_id text
)
returns uuid
language plpgsql security definer as $fn$
declare
  found  app_users;
  recent integer;
  code_id uuid;
begin
  select count(*) into recent
  from login_attempts a
  where a.username = lower(p_username)
    and not a.succeeded
    and a.at > now() - interval '1 minute';

  if recent >= 5 then
    insert into audit_log (actor_name, kind, action, summary)
    values ('Someone signing in', 'session', 'session.locked',
            'An account was held after five wrong passwords');
    return null;
  end if;

  select * into found from app_users u
  where u.username = lower(p_username) and u.active;

  insert into login_attempts (username, device_id, succeeded, user_id)
  values (lower(p_username), p_device_id, password_ok and found.id is not null, found.id);

  if found.id is null or not password_ok then
    insert into audit_log (actor_name, kind, action, summary)
    values ('Someone signing in', 'session', 'session.sign_in_failed',
            'A sign-in was refused — wrong username or password');
    return null;
  end if;

  -- Most people are in on the password alone. The caller sees a NULL code id
  -- with a signed-in audit row, and issues the session.
  if not (found.role = any (two_step_roles())) then
    insert into audit_log (actor_id, actor_name, actor_role, kind, action, summary,
                           entity_id, location_id)
    values (found.id, found.name, found.role, 'session', 'session.signed_in',
            format('%s signed in', found.name), found.id, found.location_id);
    return found.id;
  end if;

  insert into login_codes (user_id, code_hash, expires_at, device_id)
  values (found.id, p_code_hash, now() + interval '10 minutes', p_device_id)
  returning id into code_id;

  insert into audit_log (actor_id, actor_name, actor_role, kind, action, summary, entity_id)
  values (found.id, found.name, found.role, 'session', 'session.code_sent',
          'A sign-in code was sent', found.id);

  return code_id;
end $fn$;

create or replace function redeem_sign_in_code(p_code_id uuid, p_code_hash text)
returns app_users
language plpgsql security definer as $fn$
declare
  row_code login_codes;
  found    app_users;
begin
  select * into row_code from login_codes where id = p_code_id for update;
  if row_code is null or row_code.consumed_at is not null then return null; end if;
  if row_code.expires_at < now() or row_code.attempts >= 5 then return null; end if;

  if row_code.code_hash <> p_code_hash then
    update login_codes set attempts = attempts + 1 where id = p_code_id;
    return null;
  end if;

  update login_codes set consumed_at = now() where id = p_code_id;
  select * into found from app_users where id = row_code.user_id and active;
  if found.id is null then return null; end if;

  insert into audit_log (actor_id, actor_name, actor_role, kind, action, summary, entity_id,
                         location_id)
  values (found.id, found.name, found.role, 'session', 'session.signed_in',
          format('%s signed in', found.name), found.id, found.location_id);

  return found;
end $fn$;

-- ── Row level security ──────────────────────────────────────────────────────
--
-- The permission model in one place. Two helpers keep the policies readable.

-- Identity comes from the PIN session. sign_in_with_pin() issues a JWT carrying
-- an `app_user_id` claim; every policy below reads it from there. On plain
-- Postgres, replace this body with your own session variable.
create or replace function current_app_user()
returns app_users
language sql stable security definer
as $$
  select *
  from app_users
  where id = nullif(
      current_setting('request.jwt.claims', true)::jsonb ->> 'app_user_id', ''
    )::uuid
    and active
  limit 1;
$$;

create or replace function current_role_is(variadic roles app_role[])
returns boolean
language sql stable
as $$
  select (select role from current_app_user()) = any(roles);
$$;

-- The founder sees everything and changes nothing, so "can write" excludes him.
create or replace function can_write()
returns boolean
language sql stable
as $$
  select current_role_is('md','ops','pa','finance','warehouse','promoter','it');
$$;

create or replace function my_location()
returns uuid
language sql stable
as $$
  select location_id from current_app_user();
$$;

alter table locations       enable row level security;
alter table products        enable row level security;
alter table skus            enable row level security;
alter table countries       enable row level security;
alter table app_users       enable row level security;
alter table closings        enable row level security;
alter table sale_lines      enable row level security;
alter table stock_counts    enable row level security;
alter table write_offs      enable row level security;
alter table corrections     enable row level security;
alter table purchase_orders enable row level security;
alter table po_lines        enable row level security;
alter table po_events       enable row level security;
alter table targets         enable row level security;
alter table promotions          enable row level security;
alter table promotion_locations enable row level security;
alter table promotion_skus      enable row level security;
alter table password_history    enable row level security;
alter table login_codes         enable row level security;
alter table login_attempts      enable row level security;
alter table alerts          enable row level security;
alter table audit_log       enable row level security;

-- Reference data: everyone signed in may read.
create policy read_reference on locations for select using (current_app_user() is not null);
create policy read_products  on products  for select using (current_app_user() is not null);
create policy read_skus      on skus      for select using (current_app_user() is not null);
create policy read_countries on countries for select using (current_app_user() is not null);

-- Chloe and the MD maintain the catalogue (Q56).
create policy write_products on products for all
  using (current_role_is('md','ops','pa')) with check (current_role_is('md','ops','pa'));
create policy write_skus on skus for all
  using (current_role_is('md','ops','pa')) with check (current_role_is('md','ops','pa'));

-- Logins: everyone sees the list except IT's own row, which is hidden from
-- everyone but IT. Only the MD, Kelly, Chloe and IT create or change a login.
--
-- Note what a select policy cannot do: once a row is visible, every column on
-- it is readable. It does not matter here — `password_hash` is an Argon2 digest
-- and gives nothing away, which is the whole reason this is safer than the PIN
-- column it replaced.
create policy read_users on app_users for select using (
  current_app_user() is not null
  and (not hidden or id = (select id from current_app_user()))
);
create policy write_users on app_users for all
  using (current_role_is('md','ops','pa','it')) with check (current_role_is('md','ops','pa','it'));

-- Trading: head office sees everything, a promoter sees only their own store.
create policy read_closings on closings for select using (
  current_role_is('director','md','ops','pa','finance','warehouse','it')
  or location_id = my_location()
);
create policy write_closings on closings for all
  using (can_write() and (current_role_is('md','ops','pa','finance') or location_id = my_location()))
  with check (can_write() and (current_role_is('md','ops','pa','finance') or location_id = my_location()));

-- Child rows inherit their closing's visibility.
create policy read_sale_lines on sale_lines for select using (
  exists (select 1 from closings c where c.id = closing_id)
);
create policy write_sale_lines on sale_lines for all
  using (can_write() and exists (select 1 from closings c where c.id = closing_id))
  with check (can_write() and exists (select 1 from closings c where c.id = closing_id));

create policy rw_stock_counts on stock_counts for all
  using (exists (select 1 from closings c where c.id = closing_id))
  with check (can_write() and exists (select 1 from closings c where c.id = closing_id));

create policy read_write_offs on write_offs for select using (
  exists (select 1 from closings c where c.id = closing_id)
);
create policy write_write_offs on write_offs for all
  using (can_write()) with check (can_write());

-- Only Kelly and Davy decide a correction (Q19).
create policy read_corrections on corrections for select using (current_app_user() is not null);
create policy raise_correction on corrections for insert with check (can_write());
create policy decide_correction on corrections for update
  using (current_role_is('md','ops')) with check (current_role_is('md','ops'));

-- Orders: a promoter sees their own store's; head office sees all.
create policy read_pos on purchase_orders for select using (
  current_role_is('director','md','ops','pa','finance','warehouse','it')
  or location_id = my_location()
);
create policy write_pos on purchase_orders for all
  using (can_write()) with check (can_write());

create policy rw_po_lines on po_lines for all
  using (exists (select 1 from purchase_orders p where p.id = po_id))
  with check (can_write() and exists (select 1 from purchase_orders p where p.id = po_id));

create policy read_po_events on po_events for select using (
  exists (select 1 from purchase_orders p where p.id = po_id)
);
create policy add_po_event on po_events for insert with check (can_write());

-- Targets are Davy's (Q68).
create policy read_targets on targets for select using (current_app_user() is not null);
create policy write_targets on targets for all
  using (current_role_is('md')) with check (current_role_is('md'));

-- Promotions: everyone reads them; Davy, Kelly and Chloe record them (Q59).
create policy read_promotions on promotions for select using (current_app_user() is not null);
create policy write_promotions on promotions for all
  using (current_role_is('md','ops','pa')) with check (current_role_is('md','ops','pa'));
create policy rw_promotion_locations on promotion_locations for all
  using (current_app_user() is not null) with check (current_role_is('md','ops','pa'));
create policy rw_promotion_skus on promotion_skus for all
  using (current_app_user() is not null) with check (current_role_is('md','ops','pa'));

create policy read_alerts on alerts for select using (current_app_user() is not null);
create policy write_alerts on alerts for all using (can_write()) with check (can_write());

-- Nobody reads the credential tables directly. set_password(), begin_sign_in()
-- and redeem_sign_in_code() are security definer and are the only way in, so
-- those three tables carry no policy at all and RLS denies everything.

-- The activity log.
--
-- Read by the people accountable for the system — including the read-only
-- Director, who is the one most likely to ask "who changed this?". Finance and
-- the Warehouse are left out on purpose: the log records who looked at whose
-- PIN, and that is not theirs to read. One line here if the client disagrees.
--
-- **There is no update policy and no delete policy.** Under row-level security
-- an operation with no policy is denied, so the log is append-only for
-- everybody — no exception for the Managing Director, and none for IT.
create policy read_audit on audit_log for select
  using (current_role_is('director','md','ops','pa','it'));
create policy append_audit on audit_log for insert with check (true);

-- ── Guard rails the application must not be able to break ───────────────────

-- A country may only be recorded where the store actually captures one.
create or replace function enforce_country_capture()
returns trigger language plpgsql as $$
declare records_countries boolean;
begin
  select l.records_countries into records_countries
  from closings c join locations l on l.id = c.location_id
  where c.id = new.closing_id;

  if new.country_code is not null and not records_countries then
    raise exception 'This store does not record customer countries';
  end if;
  if new.country_code is null and records_countries then
    raise exception 'Main stores must record the country on every sale';
  end if;
  return new;
end $$;

create trigger sale_lines_country_capture
  before insert or update on sale_lines
  for each row execute function enforce_country_capture();

-- Testers are counted and written off, never sold.
create or replace function forbid_selling_testers()
returns trigger language plpgsql as $$
begin
  if not (select sellable from skus where id = new.sku_id) then
    raise exception 'This item is not for sale';
  end if;
  return new;
end $$;

create trigger sale_lines_no_testers
  before insert or update on sale_lines
  for each row execute function forbid_selling_testers();

-- Corrections close after three days (Q19).
create or replace function enforce_correction_window()
returns trigger language plpgsql as $$
declare period date;
begin
  select c.period into period from closings c where c.id = new.closing_id;
  if current_date - period > 3 then
    raise exception 'Corrections are only allowed for 3 days';
  end if;
  return new;
end $$;

create trigger corrections_window
  before insert on corrections
  for each row execute function enforce_correction_window();

-- ── Writing the activity log ────────────────────────────────────────────────

-- What the application calls. Security definer, so a row can be written even
-- where the caller has no direct insert rights.
create or replace function record_action(
  kind        audit_kind,
  action      text,
  summary     text,
  entity_id   uuid default null,
  location_id uuid default null,
  detail      text default null
)
returns void
language plpgsql security definer as $fn$
declare actor app_users;
begin
  actor := current_app_user();
  insert into audit_log (actor_id, actor_name, actor_role, kind, action, summary,
                         entity_id, location_id, detail)
  values (actor.id,
          coalesce(actor.name, 'Someone not signed in'),
          actor.role,
          kind, action, summary, entity_id, location_id, detail);
end $fn$;

-- The safety net. Attached to every table that holds something worth tracing,
-- so a change made outside the application is still recorded.
--
-- It deliberately drops app_users.password_hash and password_cipher from its
-- diffs. A log full of either is a head start for anybody with the key or the
-- patience. set_password() and reveal_password() write their own rows.
-- Which category a table's changes belong to, so the trigger's rows sit
-- alongside the application's on the same Activity screen.
create or replace function kind_for_table(t text)
returns audit_kind
language sql immutable as $fn$
  select case t
    when 'closings'        then 'closing'
    when 'sale_lines'      then 'sale'
    when 'write_offs'      then 'closing'
    when 'corrections'     then 'correction'
    when 'purchase_orders' then 'order'
    when 'po_lines'        then 'order'
    when 'app_users'       then 'login'
    when 'targets'         then 'target'
    when 'promotions'      then 'promotion'
    else 'login'
  end::audit_kind;
$fn$;

create or replace function record_change()
returns trigger
language plpgsql security definer as $fn$
declare
  actor    app_users;
  row_id   uuid;
  payload  jsonb;
begin
  actor := current_app_user();
  row_id := coalesce(
    (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id',
    ''
  )::uuid;

  payload := case tg_op
    when 'INSERT' then jsonb_build_object('new', to_jsonb(new) - 'password_hash' - 'password_cipher')
    when 'DELETE' then jsonb_build_object('old', to_jsonb(old) - 'password_hash' - 'password_cipher')
    else jsonb_build_object(
      'old', to_jsonb(old) - 'password_hash' - 'password_cipher',
      'new', to_jsonb(new) - 'password_hash' - 'password_cipher'
    )
  end;

  insert into audit_log (actor_id, actor_name, actor_role, kind, action, summary,
                         entity_id, table_name, changes)
  values (actor.id,
          coalesce(actor.name, 'Changed outside the application'),
          actor.role,
          kind_for_table(tg_table_name),
          format('%s.%s', tg_table_name, lower(tg_op)),
          format('%s on %s', initcap(lower(tg_op)), replace(tg_table_name, '_', ' ')),
          row_id, tg_table_name, payload);

  return case when tg_op = 'DELETE' then old else new end;
end $fn$;

create trigger audit_closings        after insert or update or delete on closings        for each row execute function record_change();
create trigger audit_sale_lines      after insert or update or delete on sale_lines      for each row execute function record_change();
create trigger audit_write_offs      after insert or update or delete on write_offs      for each row execute function record_change();
create trigger audit_corrections     after insert or update or delete on corrections     for each row execute function record_change();
create trigger audit_purchase_orders after insert or update or delete on purchase_orders for each row execute function record_change();
create trigger audit_po_lines        after insert or update or delete on po_lines        for each row execute function record_change();
create trigger audit_app_users       after insert or update or delete on app_users       for each row execute function record_change();
create trigger audit_targets         after insert or update or delete on targets         for each row execute function record_change();
create trigger audit_promotions      after insert or update or delete on promotions      for each row execute function record_change();
create trigger audit_products        after insert or update or delete on products        for each row execute function record_change();
create trigger audit_skus            after insert or update or delete on skus            for each row execute function record_change();
create trigger audit_locations       after insert or update or delete on locations       for each row execute function record_change();
