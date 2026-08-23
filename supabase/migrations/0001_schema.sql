-- ============================================================================
-- Legendary Retail CRM — database schema
--
-- Postgres 15+. Written for Supabase (it uses RLS and Vault), but the only
-- Supabase-specific parts are current_app_user(), which reads the PIN session's
-- JWT claim, and the two Vault look-ups behind the PIN secrets. On plain
-- Postgres, replace those three functions and everything else runs unchanged.
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
--   * Everyone signs in with a six-digit PIN. There are no passwords and no
--     Google accounts. Senior staff must be able to *read* a colleague's current
--     PIN, so the PIN is reversibly encrypted rather than hashed — see the
--     "People" section below and docs/spec/pin-security.md for what that costs
--     and how it is contained.
-- ============================================================================

-- pgcrypto gives us both hmac() for the PIN digest and pgp_sym_encrypt() for
-- the recoverable copy.
create extension if not exists "pgcrypto";

-- ── Enums ───────────────────────────────────────────────────────────────────

create type channel        as enum ('main', 'dealer', 'consignment', 'online');
create type cadence        as enum ('daily', 'monthly');
create type location_status as enum ('open', 'coming', 'closed');
create type variant        as enum ('retail', 'travel', 'refill', 'giftset', 'tester');
create type app_role       as enum ('director','md','ops','pa','finance','warehouse','promoter','it');
create type po_status      as enum ('draft','submitted','approved','rejected','accounts_cleared','packed','in_transit','received');
create type write_off_reason as enum ('tester','damaged','sample');
create type correction_status as enum ('pending','approved','rejected');
create type alert_type     as enum ('missed_closing','low_stock','correction_pending','po_waiting','target_risk');
create type severity       as enum ('warn','serious','critical');
create type promo_mechanic as enum ('discount','bundle','gift','member','other');
create type audit_kind    as enum ('session','sale','closing','correction','order','login','pin','promotion','target','alert');

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
  -- Consignment partners keep an agreed share (Q58). Null elsewhere.
  margin_pct        numeric(5,2),
  -- False for online storefronts: the website and the shops share one set of
  -- stock numbers (Q13), so an online order is picked from the warehouse and
  -- never sits on a shelf of its own. Those locations file sales with no
  -- nightly count and never raise a top-up order.
  holds_own_stock   boolean not null default true,
  opened_on         date,
  created_at        timestamptz not null default now(),

  constraint margin_only_on_consignment
    check (margin_pct is null or channel = 'consignment'),
  constraint countries_only_on_main
    check (records_countries = false or channel = 'main'),
  constraint only_online_shares_stock
    check (holds_own_stock or channel = 'online')
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
  -- Legendary's revenue per unit. Stores may retail at their own price (Q60).
  price_myr      numeric(10,2) not null check (price_myr >= 0),
  reorder_point  integer not null default 0 check (reorder_point >= 0),
  case_size      integer not null default 12 check (case_size > 0),
  -- Testers are counted and written off, never sold.
  sellable       boolean not null default true,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),

  unique (product_id, variant, size)
);

create index on skus (product_id) where active;

-- ── People ──────────────────────────────────────────────────────────────────
--
-- Everyone signs in with a six-digit PIN (client instruction, superseding the
-- Q11 answer about Gmail). The PIN is created when the staff member is created,
-- and only the Managing Director, the Operational Manager, the PA and IT may
-- create one.
--
-- The client also requires senior staff to be able to *look up* a colleague's
-- current PIN. A one-way hash cannot do that, so each PIN is held twice:
--
--   pin_digest  hmac(pin, pepper) — deterministic, so it enforces "no two
--               logins share a PIN" as a plain unique index and gives sign-in a
--               single indexed lookup. It reveals nothing on its own.
--   pin_cipher  pgp_sym_encrypt(pin, key) — recoverable, and only by
--               reveal_pin(), which checks the caller's authority first.
--
-- Both keys live in Supabase Vault, never in this file and never in the
-- application. That is what keeps a stolen database dump from being a list of
-- everybody's PIN. The trade-off is written up in docs/spec/pin-security.md.

create table app_users (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  role            app_role not null,
  title           text,
  -- Promoters belong to one store; everyone else is head office.
  location_id     uuid references locations(id) on delete restrict,
  -- Deterministic digest. Unique across every login, active or not, so a
  -- disabled person's PIN cannot be handed to the next joiner.
  pin_digest      bytea not null unique,
  -- Recoverable copy. Read only through reveal_pin().
  pin_cipher      bytea not null,
  pin_set_at      timestamptz not null default now(),
  pin_set_by      uuid references app_users(id),
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

-- Every PIN a person has ever held. A PIN is never reissued to the same person,
-- which is enforced here rather than trusted to the application.
create table pin_history (
  user_id     uuid not null references app_users(id) on delete cascade,
  pin_digest  bytea not null,
  retired_at  timestamptz not null default now(),
  retired_by  uuid references app_users(id),
  primary key (user_id, pin_digest)
);

-- Sign-in attempts, so a keypad can be locked after five wrong PINs without
-- trusting the browser to count them.
create table pin_attempts (
  id         bigserial primary key,
  -- Never the PIN that was tried, not even hashed: a log of guesses is a list
  -- of candidate PINs.
  device_id  text not null,
  at         timestamptz not null default now(),
  succeeded  boolean not null,
  user_id    uuid references app_users(id) on delete set null
);

create index on pin_attempts (device_id, at desc);

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
  coalesce(sum(sl.qty * s.price_myr), 0)::numeric(14,2) as revenue_myr,
  coalesce(sum(sl.qty), 0)                        as units,
  coalesce(sum(sl.qty) filter (where sl.country_code is not null), 0) as attributed_units
from closings c
left join sale_lines sl on sl.closing_id = c.id
left join skus s        on s.id = sl.sku_id
group by c.id;


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

-- ── PINs: who may see and change whose ──────────────────────────────────────
--
-- Straight from the client's instruction. The table is the whole rule, so it
-- can be read back against what they wrote:
--
--   IT ................. anyone, including the Managing Director and itself
--   Managing Director .. anyone visible to him, including the Director and himself
--   Ops / PA ........... themselves, Finance, Warehouse and Store Promoters —
--                        but not each other, and not the Managing Director
--   Finance ............ themselves only
--   Warehouse .......... themselves only
--   Store Promoter ..... nobody; they use the PIN a senior gave them
--   Director ........... nobody; the role cannot edit anything
--
-- This mirrors canChangePinOf() in src/data/people.ts. The two are deliberately
-- duplicated: the browser copy decides which buttons appear, this copy decides
-- what actually happens.

create or replace function pin_targets(actor app_role)
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

create or replace function can_change_pin_of(actor app_users, target app_users)
returns boolean
language sql immutable
as $fn$
  select
    can_see_user(actor, target)
    and target.role = any (pin_targets(actor.role))
    and case
      -- Ops and the PA reach their own role only for themselves, never a colleague.
      when actor.role in ('ops','pa') and actor.role = target.role then actor.id = target.id
      -- Finance and the Warehouse change their own PIN only.
      when actor.role in ('finance','warehouse') then actor.id = target.id
      else true
    end;
$fn$;

-- Reading a PIN follows the same authority as changing it.
create or replace function can_see_pin_of(actor app_users, target app_users)
returns boolean
language sql immutable
as $fn$
  select can_change_pin_of(actor, target);
$fn$;

-- ── PIN storage ─────────────────────────────────────────────────────────────
--
-- Both secrets come from Supabase Vault, so they are not in this file, not in
-- the application, and not in a database dump.

create or replace function pin_pepper() returns text
language sql stable security definer as $fn$
  select decrypted_secret from vault.decrypted_secrets where name = 'pin_pepper';
$fn$;

create or replace function pin_key() returns text
language sql stable security definer as $fn$
  select decrypted_secret from vault.decrypted_secrets where name = 'pin_key';
$fn$;

create or replace function pin_digest_of(pin text)
returns bytea
language sql stable security definer as $fn$
  select hmac(pin, pin_pepper(), 'sha256');
$fn$;

-- Six digits, and not one of the obvious ones.
create or replace function pin_is_acceptable(pin text)
returns boolean
language sql immutable as $fn$
  select pin ~ '^[0-9]{6}$'
     and pin not in (
       '000000','111111','222222','333333','444444','555555',
       '666666','777777','888888','999999',
       '123456','654321','012345','543210','123123','121212','112233'
     );
$fn$;

-- Sets a PIN. Every rule the client gave is checked here, so no application
-- path can skip one:
--   * the caller must have authority over the target
--   * six digits, and not an obvious one
--   * not already in use by any other login
--   * never one this person has held before
create or replace function set_pin(target_id uuid, new_pin text)
returns void
language plpgsql security definer as $fn$
declare
  actor  app_users;
  target app_users;
  digest bytea;
begin
  actor := current_app_user();
  if actor is null then raise exception 'Not signed in'; end if;

  select * into target from app_users where id = target_id;
  if target is null then raise exception 'That login no longer exists'; end if;

  if not can_change_pin_of(actor, target) then
    raise exception 'You cannot change the PIN for %', target.name;
  end if;

  if not pin_is_acceptable(new_pin) then
    raise exception 'A PIN is six digits and must not be an obvious one';
  end if;

  digest := pin_digest_of(new_pin);

  if exists (select 1 from app_users u where u.id <> target_id and u.pin_digest = digest) then
    raise exception 'Another login already uses that PIN';
  end if;
  if digest = target.pin_digest then
    raise exception 'That is already their current PIN';
  end if;
  if exists (select 1 from pin_history h where h.user_id = target_id and h.pin_digest = digest) then
    raise exception 'They have used that PIN before. Choose a new one';
  end if;

  insert into pin_history (user_id, pin_digest, retired_by)
  values (target_id, target.pin_digest, actor.id)
  on conflict do nothing;

  update app_users
  set pin_digest = digest,
      pin_cipher = pgp_sym_encrypt(new_pin, pin_key()),
      pin_set_at = now(),
      pin_set_by = actor.id
  where id = target_id;

  insert into audit_log (actor_id, actor_name, actor_role, kind, action, summary,
                         entity_id, table_name)
  values (actor.id, actor.name, actor.role, 'pin', 'pin.changed',
          case when actor.id = target.id
               then 'Changed their own PIN'
               else format('Changed the PIN for %s', target.name) end,
          target_id, 'app_users');
end $fn$;

-- Reads a PIN back. The client asked for this; the authority check and the
-- audit row are what make it defensible.
create or replace function reveal_pin(target_id uuid)
returns text
language plpgsql security definer as $fn$
declare
  actor  app_users;
  target app_users;
begin
  actor := current_app_user();
  select * into target from app_users where id = target_id;
  if actor is null or target is null then raise exception 'Not permitted'; end if;
  if not can_see_pin_of(actor, target) then
    raise exception 'You cannot see the PIN for %', target.name;
  end if;

  -- The look-up itself is the thing worth recording. The PIN never appears in
  -- the row — a log of PINs would defeat the point of encrypting them.
  insert into audit_log (actor_id, actor_name, actor_role, kind, action, summary,
                         entity_id, table_name)
  values (actor.id, actor.name, actor.role, 'pin', 'pin.revealed',
          case when actor.id = target.id
               then 'Looked at their own PIN'
               else format('Looked at the PIN for %s', target.name) end,
          target_id, 'app_users');

  return pgp_sym_decrypt(target.pin_cipher, pin_key());
end $fn$;

-- Sign-in. One indexed lookup, and the caller learns nothing from a failure
-- beyond the fact that it failed.
--
-- It signals failure by returning NULL rather than by raising. That is
-- deliberate: `raise exception` rolls the transaction back, which would take
-- the "somebody tried a wrong PIN" row with it — and a sign-in log that records
-- only the successes is not a sign-in log. The caller checks for NULL.
create or replace function sign_in_with_pin(pin text, device_id text)
returns app_users
language plpgsql security definer as $fn$
declare
  found  app_users;
  recent integer;
begin
  select count(*) into recent
  from pin_attempts a
  where a.device_id = sign_in_with_pin.device_id
    and not a.succeeded
    and a.at > now() - interval '1 minute';

  if recent >= 5 then
    insert into audit_log (actor_name, kind, action, summary)
    values ('Someone at the keypad', 'session', 'session.pin_locked',
            'A keypad was locked after five wrong PINs');
    return null;
  end if;

  select * into found from app_users u
  where u.pin_digest = pin_digest_of(pin) and u.active;

  insert into pin_attempts (device_id, succeeded, user_id)
  values (device_id, found.id is not null, found.id);

  insert into audit_log (actor_id, actor_name, actor_role, kind, action, summary, entity_id,
                         location_id)
  values (found.id,
          coalesce(found.name, 'Someone at the keypad'),
          found.role,
          'session',
          case when found.id is null then 'session.pin_failed' else 'session.signed_in' end,
          case when found.id is null
               then 'A PIN that belongs to nobody was entered at the keypad'
               else format('%s signed in', found.name) end,
          found.id,
          found.location_id);

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
alter table pin_history         enable row level security;
alter table pin_attempts        enable row level security;
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
-- it is readable. That is precisely why the PIN is not a readable column —
-- pin_cipher is meaningless without the Vault key, and reveal_pin() is the only
-- way through it.
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

-- Nobody reads the PIN tables directly. set_pin(), reveal_pin() and
-- sign_in_with_pin() are security definer and are the only way in, so those two
-- tables carry no policy at all and RLS denies everything by default.

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
-- It deliberately never touches app_users.pin_cipher or pin_digest: a diff of
-- those columns would be a history of everybody's PINs, which is the one thing
-- this log must never become. set_pin() and reveal_pin() write their own rows.
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
    when 'INSERT' then jsonb_build_object('new', to_jsonb(new) - 'pin_cipher' - 'pin_digest')
    when 'DELETE' then jsonb_build_object('old', to_jsonb(old) - 'pin_cipher' - 'pin_digest')
    else jsonb_build_object(
      'old', to_jsonb(old) - 'pin_cipher' - 'pin_digest',
      'new', to_jsonb(new) - 'pin_cipher' - 'pin_digest'
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
