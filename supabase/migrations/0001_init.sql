-- ============================================================================
-- Legendary Retail CRM — the shared server
-- ============================================================================
--
-- Run this once in the Supabase SQL editor of a fresh project, then
-- 0002_people.sql. Nothing else is needed: no Edge Functions, no Auth
-- configuration.
--
-- How it is shaped
-- ----------------
-- The browser never reads or writes a table. Every table has row-level
-- security on with no policies, so the anonymous key that ships in the app
-- can do nothing by itself. Everything goes through the functions at the end
-- of this file, which take a session token, work out who is asking, and
-- apply the same rules the app applies (`src/api/local.ts` is the readable
-- twin of this file — keep them in step).
--
-- Everything that changes is a document in `docs`: a sale line, a closing, an
-- order, a target, a promotion, a line in the activity log. People live apart
-- because they carry a password.
--
-- Passwords
-- ---------
-- Checked against a bcrypt hash. The client requires senior staff to be able
-- to read a password back, so a second copy is kept encrypted with a key held
-- in Supabase Vault — outside the tables — and decrypted only inside
-- `reveal_password()`, which also writes the look-up to the activity log.
-- Every password ever held is kept as a hash so none is reissued.
--
-- The activity log is append-only: `docs` rows of kind 'audit' can be
-- inserted and never updated or deleted, enforced by a trigger.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists people (
  id               text primary key,
  username         text not null unique,
  role             text not null,
  active           boolean not null default true,
  -- The person as the app sees them. Never contains a password.
  doc              jsonb not null,
  password_hash    text not null,
  password_cipher  bytea not null,
  -- Every earlier password, hashed, so none comes back.
  password_history text[] not null default '{}',
  updated_at       timestamptz not null default now()
);

create table if not exists sessions (
  token        text primary key,
  person_id    text not null references people(id) on delete cascade,
  -- The store a KL promoter chose at sign-in.
  location_id  text,
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
create index if not exists sessions_person on sessions(person_id);

create table if not exists login_attempts (
  id        bigserial primary key,
  username  text not null,
  at        timestamptz not null default now(),
  ok        boolean not null
);
create index if not exists login_attempts_recent on login_attempts(username, at desc);

-- The second step, where it is switched on. Off until mail is connected.
create table if not exists pending_codes (
  token      text primary key,
  person_id  text not null references people(id) on delete cascade,
  code_hash  text not null,
  expires_at timestamptz not null,
  tries      int not null default 0
);

create table if not exists docs (
  kind         text not null,
  id           text not null,
  location_id  text,
  day          text,
  doc          jsonb not null,
  updated_at   timestamptz not null default now(),
  updated_by   text,
  deleted      boolean not null default false,
  primary key (kind, id)
);
create index if not exists docs_updated on docs(updated_at);
create index if not exists docs_kind_location on docs(kind, location_id);

create table if not exists settings (
  key    text primary key,
  value  jsonb not null
);
insert into settings(key, value) values ('two_step', 'false'::jsonb) on conflict do nothing;

-- Nothing for the anonymous key to touch directly.
alter table people          enable row level security;
alter table sessions        enable row level security;
alter table login_attempts  enable row level security;
alter table pending_codes   enable row level security;
alter table docs            enable row level security;
alter table settings        enable row level security;
revoke all on people, sessions, login_attempts, pending_codes, docs, settings from anon, authenticated;

-- The log cannot be rewritten.
create or replace function audit_is_append_only() returns trigger
language plpgsql as $$
begin
  if old.kind = 'audit' then
    raise exception 'The activity log cannot be edited.';
  end if;
  return new;
end $$;
drop trigger if exists docs_audit_append_only on docs;
create trigger docs_audit_append_only
  before update or delete on docs
  for each row execute function audit_is_append_only();

-- ── The password key ────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'crm_password_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'crm_password_key',
      'Encrypts the readable copy of each password. Never export.');
  end if;
end $$;

create or replace function _password_key() returns text
language sql security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'crm_password_key' limit 1
$$;
revoke all on function _password_key() from public, anon, authenticated;

-- ── Helpers ─────────────────────────────────────────────────────────────────

create or replace function _now_text() returns text
language sql stable as $$ select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

-- The trading day in Malaysia.
create or replace function _today() returns text
language sql stable as $$ select to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') $$;

create or replace function _rand(n int) returns text
language sql volatile as $$ select substr(encode(extensions.gen_random_bytes(n), 'hex'), 1, n) $$;

-- Who is behind a token. Null if the session is gone or the login disabled.
create or replace function _session(p_token text)
returns table (person_id text, role text, location_id text, doc jsonb, name text)
language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or p_token = '' then return; end if;
  -- A month unused and the session is over.
  delete from sessions where token = p_token and last_seen < now() - interval '30 days';
  update sessions set last_seen = now() where token = p_token;
  return query
    select p.id, p.role, coalesce(s.location_id, p.doc->>'locationId'), p.doc, p.doc->>'name'
    from sessions s join people p on p.id = s.person_id
    where s.token = p_token and p.active;
end $$;

-- What the app calls `can(role)`.
create or replace function _can_edit(r text) returns boolean
language sql immutable as $$ select r <> 'director' $$;

create or replace function _views_audit(r text) returns boolean
language sql immutable as $$ select r in ('director','md','ops','pa','it') $$;

create or replace function _manages_users(r text) returns boolean
language sql immutable as $$ select r in ('md','ops','pa','it') $$;

-- Which roles may write which kind of document. Mirrors WRITERS in local.ts.
create or replace function _may_write(r text, kind text) returns boolean
language sql immutable as $$
  select case kind
    when 'sale_line'  then r in ('promoter','ops','md','pa')
    when 'closing'    then r in ('promoter','ops','md','pa')
    when 'po'         then r in ('promoter','ops','md','finance','warehouse')
    when 'target'     then r in ('md','ops')
    when 'promotion'  then r in ('pa','md','ops')
    when 'audit'      then true
    when 'alert_read' then true
    when 'setting'    then r in ('md','it')
    else false end
$$;

-- Who may set and see whose password. Mirrors PASSWORD_TARGETS in people.ts.
create or replace function _can_reset(actor_role text, actor_id text, target_role text, target_id text, target_hidden boolean)
returns boolean language plpgsql immutable as $$
declare
  targets text[];
begin
  if target_hidden and actor_id <> target_id then return false; end if;
  targets := case actor_role
    when 'it'        then array['director','md','ops','pa','finance','warehouse','promoter','it']
    when 'md'        then array['director','md','ops','pa','finance','warehouse','promoter']
    when 'ops'       then array['ops','finance','warehouse','promoter']
    when 'pa'        then array['pa','finance','warehouse','promoter']
    when 'finance'   then array['finance']
    when 'warehouse' then array['warehouse']
    else array[]::text[] end;
  if not (target_role = any(targets)) then return false; end if;
  -- Ops and the PA reach their own role only for themselves; Finance and the
  -- Warehouse change their own only.
  if actor_role in ('ops','pa') and actor_role = target_role then return actor_id = target_id; end if;
  if actor_role in ('finance','warehouse') then return actor_id = target_id; end if;
  return true;
end $$;

-- The password rules the app checks in the browser, checked again here.
create or replace function _password_problem(pw text) returns text
language plpgsql immutable as $$
declare
  weak text[] := array['password','legendary','12345678','qwerty','letmein','welcome','admin','abc123','iloveyou','perfume'];
  w text;
begin
  if pw is null or length(btrim(pw)) < 10 then return 'Use at least 10 characters.'; end if;
  if pw !~* '[a-z]' or pw !~ '[0-9]' then return 'Use letters and at least one number.'; end if;
  foreach w in array weak loop
    if position(w in lower(pw)) > 0 then return 'That is too easy to guess. Choose something else.'; end if;
  end loop;
  return null;
end $$;

create or replace function _random_password() returns text
language sql volatile as $$ select 'Lgd-' || _rand(8) $$;

-- One line in the activity log.
create or replace function _audit(actor_id text, actor_name text, actor_role text, kind text, action text,
                                  summary text, entity_id text default null, location_id text default null,
                                  detail text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  at_text text := _now_text();
  row_id text := 'au-' || at_text || '-' || _rand(6);
begin
  insert into docs(kind, id, location_id, doc, updated_by)
  values ('audit', row_id, location_id,
    jsonb_strip_nulls(jsonb_build_object(
      'id', row_id, 'at', at_text,
      'actorId', actor_id, 'actorName', actor_name, 'actorRole', actor_role,
      'kind', kind, 'action', action, 'summary', summary,
      'entityId', entity_id, 'locationId', location_id, 'detail', detail)),
    actor_id);
end $$;

-- A person as the app receives them.
create or replace function _public_person(p people) returns jsonb
language sql stable as $$
  select (p.doc - 'password' - 'passwordHistory') || jsonb_build_object('active', p.active)
$$;

create or replace function _doc_json(d docs) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'kind', d.kind, 'id', d.id, 'location_id', d.location_id, 'day', d.day, 'doc', d.doc,
    'updated_at', to_char(d.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updated_by', d.updated_by, 'deleted', d.deleted)
$$;

-- ── Sign-in ─────────────────────────────────────────────────────────────────

create or replace function _mask_email(email text) returns text
language plpgsql immutable as $$
declare
  name_part text := split_part(email, '@', 1);
  domain_part text := split_part(email, '@', 2);
begin
  if domain_part = '' then return email; end if;
  return left(name_part, 2) || repeat('•', greatest(3, length(name_part) - 2)) || '@' || domain_part;
end $$;

create or replace function _open_session(p people) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  token text := _rand(48);
begin
  insert into sessions(token, person_id) values (token, p.id);
  perform _audit(p.id, p.doc->>'name', p.role, 'session', 'session.signed_in',
                 (p.doc->>'name') || ' signed in', p.id, p.doc->>'locationId');
  return jsonb_build_object('ok', true, 'token', token, 'person', _public_person(p),
                            'locationId', p.doc->>'locationId');
end $$;

create or replace function sign_in(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  uname text := lower(btrim(coalesce(p_username, '')));
  p people;
  recent_failures int;
  token text;
  two_step boolean := coalesce((select value::text = 'true' from settings where key = 'two_step'), false);
  code text;
begin
  select count(*) into recent_failures from login_attempts
    where username = uname and not ok and at > now() - interval '60 seconds';
  if recent_failures >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Too many attempts. Try again in a minute.');
  end if;

  select * into p from people where username = uname;
  if p.id is null or not p.active
     or not coalesce(crypt(coalesce(p_password, ''), p.password_hash) = p.password_hash, false) then
    insert into login_attempts(username, ok) values (uname, false);
    perform _audit('unknown', 'Someone signing in', 'promoter', 'session', 'session.sign_in_failed',
                   'A sign-in was refused — wrong username or password');
    if recent_failures + 1 >= 5 then
      return jsonb_build_object('ok', false, 'error', 'Too many attempts. Try again in a minute.');
    end if;
    -- Never says which half was wrong.
    return jsonb_build_object('ok', false, 'error', 'That username and password do not match.');
  end if;

  insert into login_attempts(username, ok) values (uname, true);

  if two_step and p.role in ('director','md','ops','pa','it') then
    token := 'pending-' || _rand(32);
    code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    insert into pending_codes(token, person_id, code_hash, expires_at)
      values (token, p.id, crypt(code, gen_salt('bf', 6)), now() + interval '10 minutes');
    -- TODO when mail is connected: send `code` to p.doc->>'email' here.
    perform _audit(p.id, p.doc->>'name', p.role, 'session', 'session.code_sent',
                   'A sign-in code was sent to ' || _mask_email(p.doc->>'email'), p.id);
    return jsonb_build_object('ok', true, 'token', token, 'needsCode', true,
                              'sentTo', _mask_email(p.doc->>'email'));
  end if;

  return _open_session(p);
end $$;

create or replace function submit_code(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  pc pending_codes;
  p people;
begin
  select * into pc from pending_codes where token = p_token;
  if pc.token is null then
    return jsonb_build_object('ok', false, 'error', 'Start again — that sign-in has expired.');
  end if;
  if pc.expires_at < now() then
    delete from pending_codes where token = p_token;
    return jsonb_build_object('ok', false, 'error', 'That code has expired. Sign in again for a new one.');
  end if;
  if not coalesce(crypt(btrim(coalesce(p_code, '')), pc.code_hash) = pc.code_hash, false) then
    update pending_codes set tries = tries + 1 where token = p_token;
    if pc.tries + 1 >= 5 then
      delete from pending_codes where token = p_token;
      return jsonb_build_object('ok', false, 'error', 'Too many wrong codes. Start again.');
    end if;
    return jsonb_build_object('ok', false, 'error', 'That code is not right. ' || (4 - pc.tries) || ' tries left.');
  end if;
  delete from pending_codes where token = p_token;
  select * into p from people where id = pc.person_id;
  if p.id is null or not p.active then
    return jsonb_build_object('ok', false, 'error', 'That login is no longer active.');
  end if;
  return _open_session(p);
end $$;

create or replace function choose_store(p_token text, p_location_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s record;
  choices jsonb;
begin
  select * into s from _session(p_token);
  if s.person_id is null then return jsonb_build_object('ok', false, 'error', 'Sign in again.'); end if;
  choices := s.doc->'storeChoices';
  if choices is null or not (choices ? p_location_id) then
    return jsonb_build_object('ok', false, 'error', 'That is not one of your stores.');
  end if;
  update sessions set location_id = p_location_id where token = p_token;
  perform _audit(s.person_id, s.name, s.role, 'session', 'session.store_chosen',
                 s.name || ' is working at ' || p_location_id || ' today', s.person_id, p_location_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function sign_out(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  select * into s from _session(p_token);
  if s.person_id is not null then
    perform _audit(s.person_id, s.name, s.role, 'session', 'session.signed_out', s.name || ' signed out', s.person_id);
  end if;
  delete from sessions where token = p_token;
end $$;

create or replace function whoami(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s record;
  p people;
begin
  select * into s from _session(p_token);
  if s.person_id is null then return jsonb_build_object('ok', false); end if;
  select * into p from people where id = s.person_id;
  return jsonb_build_object('ok', true, 'person', _public_person(p), 'locationId', s.location_id);
end $$;

-- ── Reading ─────────────────────────────────────────────────────────────────

create or replace function load_state(p_token text, p_since text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s record;
  since_ts timestamptz := case when p_since is null or p_since = '' then null else p_since::timestamptz end;
  people_json jsonb;
  docs_json jsonb;
begin
  select * into s from _session(p_token);
  if s.person_id is null then return jsonb_build_object('ok', false, 'error', 'Sign in again.'); end if;

  -- People are sent whole on a full load, and on an incremental one only if
  -- anyone changed.
  if since_ts is null or exists (select 1 from people where updated_at > since_ts) then
    select coalesce(jsonb_agg(_public_person(p) order by p.id), '[]'::jsonb) into people_json from people p;
  else
    people_json := null;
  end if;

  select coalesce(jsonb_agg(_doc_json(d)), '[]'::jsonb) into docs_json
  from docs d
  where (since_ts is null or d.updated_at > since_ts)
    and (
      case
        when d.kind = 'audit' then _views_audit(s.role)
        when s.role <> 'promoter' then true
        when d.kind in ('target','promotion','setting','alert_read') then true
        else d.location_id is null or d.location_id = s.location_id
      end
    );

  return jsonb_build_object('ok', true, 'people', people_json, 'docs', docs_json,
                            'now', _now_text(), 'today', _today());
end $$;

-- ── Writing ─────────────────────────────────────────────────────────────────

create or replace function _refusal(p_role text, p_session_location text, kind text, location_id text) returns text
language plpgsql immutable as $$
begin
  if not _can_edit(p_role) and kind not in ('alert_read','audit') then return 'Your sign-in is read-only.'; end if;
  if not _may_write(p_role, kind) then return 'Your role cannot change that.'; end if;
  if p_role = 'promoter' and location_id is not null and location_id is distinct from p_session_location then
    return 'That belongs to another store.';
  end if;
  return null;
end $$;

create or replace function put_docs(p_token text, p_docs jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s record;
  d jsonb;
  refused text;
begin
  select * into s from _session(p_token);
  if s.person_id is null then return jsonb_build_object('ok', false, 'error', 'Sign in again.'); end if;

  for d in select * from jsonb_array_elements(p_docs) loop
    refused := _refusal(s.role, s.location_id, d->>'kind', d->>'location_id');
    if refused is not null then
      return jsonb_build_object('ok', false, 'error', refused);
    end if;
    if d->>'kind' = 'audit' then
      -- Append-only: a line that exists is never rewritten.
      insert into docs(kind, id, location_id, day, doc, updated_by)
        values ('audit', d->>'id', d->>'location_id', d->>'day', d->'doc', s.person_id)
        on conflict do nothing;
    else
      insert into docs(kind, id, location_id, day, doc, updated_by, updated_at, deleted)
        values (d->>'kind', d->>'id', d->>'location_id', d->>'day', d->'doc', s.person_id, now(), false)
        on conflict (kind, id) do update
          set doc = excluded.doc, location_id = excluded.location_id, day = excluded.day,
              updated_by = excluded.updated_by, updated_at = now(), deleted = false;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'now', _now_text());
end $$;

create or replace function remove_docs(p_token text, p_kind text, p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s record;
  existing docs;
  one_id text;
  refused text;
begin
  select * into s from _session(p_token);
  if s.person_id is null then return jsonb_build_object('ok', false, 'error', 'Sign in again.'); end if;
  if p_kind = 'audit' then return jsonb_build_object('ok', false, 'error', 'The activity log cannot be edited.'); end if;

  foreach one_id in array p_ids loop
    select * into existing from docs where kind = p_kind and id = one_id;
    if existing.id is null then continue; end if;
    refused := _refusal(s.role, s.location_id, p_kind, existing.location_id);
    if refused is not null then return jsonb_build_object('ok', false, 'error', refused); end if;
    update docs set deleted = true, updated_at = now(), updated_by = s.person_id
      where kind = p_kind and id = one_id;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- ── People and passwords ────────────────────────────────────────────────────

create or replace function add_person(p_token text, p_person jsonb, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  problem text;
  new_id text := p_person->>'id';
  uname text := lower(p_person->>'username');
  doc jsonb;
begin
  select * into s from _session(p_token);
  if s.person_id is null then return jsonb_build_object('ok', false, 'error', 'Sign in again.'); end if;
  if not _manages_users(s.role) then return jsonb_build_object('ok', false, 'error', 'You cannot add logins.'); end if;
  if exists (select 1 from people where id = new_id or username = uname) then
    return jsonb_build_object('ok', false, 'error', 'Somebody already has that username.');
  end if;
  problem := _password_problem(p_password);
  if problem is not null then return jsonb_build_object('ok', false, 'error', problem); end if;

  doc := (p_person - 'password' - 'passwordHistory')
         || jsonb_build_object('passwordChanges', 0, 'passwordSetAt', _now_text(), 'passwordSetBy', s.name, 'active', true);
  insert into people(id, username, role, active, doc, password_hash, password_cipher)
    values (new_id, uname, p_person->>'role', true, doc,
            crypt(p_password, gen_salt('bf', 10)), pgp_sym_encrypt(p_password, _password_key()));
  return jsonb_build_object('ok', true);
end $$;

create or replace function update_person(p_token text, p_id text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s record;
  t people;
  safe jsonb;
begin
  select * into s from _session(p_token);
  if s.person_id is null then return jsonb_build_object('ok', false, 'error', 'Sign in again.'); end if;
  select * into t from people where id = p_id;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'That login no longer exists.'); end if;
  if not _manages_users(s.role) then return jsonb_build_object('ok', false, 'error', 'You cannot edit logins.'); end if;
  if s.person_id <> t.id and not _can_reset(s.role, s.person_id, t.role, t.id, coalesce((t.doc->>'hidden')::boolean, false)) then
    return jsonb_build_object('ok', false, 'error', 'You cannot edit the login for ' || (t.doc->>'name') || '.');
  end if;

  -- Never the password fields, never the id.
  safe := p_patch - 'password' - 'passwordHistory' - 'passwordSetAt' - 'passwordSetBy' - 'passwordChanges' - 'id';
  update people
    set doc = doc || safe,
        username = coalesce(lower(safe->>'username'), username),
        role = coalesce(safe->>'role', role),
        active = coalesce((safe->>'active')::boolean, active),
        updated_at = now()
    where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function set_password(p_token text, p_target text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  t people;
  problem text;
  old_hash text;
begin
  select * into s from _session(p_token);
  if s.person_id is null then return jsonb_build_object('ok', false, 'error', 'Sign in again.'); end if;
  select * into t from people where id = p_target;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'That login no longer exists.'); end if;
  if not _can_reset(s.role, s.person_id, t.role, t.id, coalesce((t.doc->>'hidden')::boolean, false)) then
    if s.person_id = t.id then
      return jsonb_build_object('ok', false, 'error', 'Your role cannot change its own password. Ask a senior for a new one.');
    end if;
    return jsonb_build_object('ok', false, 'error', 'You cannot set the password for ' || (t.doc->>'name') || '.');
  end if;
  problem := _password_problem(p_password);
  if problem is not null then return jsonb_build_object('ok', false, 'error', problem); end if;
  if crypt(p_password, t.password_hash) = t.password_hash then
    return jsonb_build_object('ok', false, 'error', 'That is the password already in use.');
  end if;
  foreach old_hash in array t.password_history loop
    if crypt(p_password, old_hash) = old_hash then
      return jsonb_build_object('ok', false, 'error', 'That password has been used before. Choose a new one.');
    end if;
  end loop;

  update people
    set password_history = array_append(password_history, password_hash),
        password_hash = crypt(p_password, gen_salt('bf', 10)),
        password_cipher = pgp_sym_encrypt(p_password, _password_key()),
        doc = doc || jsonb_build_object('passwordChanges', coalesce((doc->>'passwordChanges')::int, 0) + 1,
                                        'passwordSetAt', _now_text(), 'passwordSetBy', s.name),
        updated_at = now()
    where id = p_target;

  perform _audit(s.person_id, s.name, s.role, 'password',
                 case when s.person_id = t.id then 'password.changed' else 'password.reset' end,
                 case when s.person_id = t.id then 'Changed their own password'
                      else 'Reset the password for ' || (t.doc->>'name') || ', ' || _role_label(t.role) end,
                 t.id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function _role_label(r text) returns text
language sql immutable as $$
  select case r
    when 'director' then 'Director (Founder)' when 'md' then 'Managing Director'
    when 'ops' then 'Operational Manager' when 'pa' then 'PA to the MD'
    when 'finance' then 'Finance Department' when 'warehouse' then 'Warehouse Team'
    when 'promoter' then 'Store Promoter' when 'it' then 'IT' else r end
$$;

create or replace function reveal_password(p_token text, p_target text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  t people;
begin
  select * into s from _session(p_token);
  if s.person_id is null then return jsonb_build_object('ok', false, 'error', 'Sign in again.'); end if;
  select * into t from people where id = p_target;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'That login no longer exists.'); end if;
  if not _can_reset(s.role, s.person_id, t.role, t.id, coalesce((t.doc->>'hidden')::boolean, false)) then
    return jsonb_build_object('ok', false, 'error', 'You cannot see the password for ' || (t.doc->>'name') || '.');
  end if;
  perform _audit(s.person_id, s.name, s.role, 'password', 'password.revealed',
                 case when s.person_id = t.id then 'Looked at their own password'
                      else 'Looked at the password for ' || (t.doc->>'name') || ', ' || _role_label(t.role) end,
                 t.id);
  return jsonb_build_object('ok', true, 'password', pgp_sym_decrypt(t.password_cipher, _password_key()));
end $$;

-- ── Starting over ───────────────────────────────────────────────────────────

create or replace function clear_all_data(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  select * into s from _session(p_token);
  if s.person_id is null then return jsonb_build_object('ok', false, 'error', 'Sign in again.'); end if;
  if s.role not in ('md','it') then return jsonb_build_object('ok', false, 'error', 'Only Davy or Imran can start over.'); end if;
  -- The append-only trigger is for edits through the app; starting over is
  -- the one deliberate wipe, so it is lifted for this statement.
  alter table docs disable trigger docs_audit_append_only;
  delete from docs;
  alter table docs enable trigger docs_audit_append_only;
  perform _audit(s.person_id, s.name, s.role, 'session', 'data.cleared',
                 s.name || ' cleared every sale, closing and order to start over');
  return jsonb_build_object('ok', true);
end $$;

-- ── Seeding the people ──────────────────────────────────────────────────────

-- Called by 0002_people.sql with the list from src/data/people.ts. Everyone
-- gets a random password, readable by the seniors the client allows. People
-- who already exist are left alone.
create or replace function seed_people(p_people jsonb) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare
  p jsonb;
  pw text;
  added int := 0;
begin
  for p in select * from jsonb_array_elements(p_people) loop
    if exists (select 1 from people where id = p->>'id') then continue; end if;
    pw := _random_password();
    insert into people(id, username, role, active, doc, password_hash, password_cipher)
      values (p->>'id', lower(p->>'username'), p->>'role', coalesce((p->>'active')::boolean, true),
              (p - 'password' - 'passwordHistory') || jsonb_build_object('passwordChanges', 0, 'passwordSetAt', _now_text(), 'passwordSetBy', 'System'),
              crypt(pw, gen_salt('bf', 10)), pgp_sym_encrypt(pw, _password_key()));
    added := added + 1;
  end loop;
  return added;
end $$;

-- The one password you have to know to begin: Imran's. Run this once with a
-- real password, then sign in as `imran` and read everyone else's off the
-- Logins screen. Refuses the placeholder so it can never be left in place.
create or replace function set_bootstrap_password(p_username text, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  problem text;
begin
  if p_password = 'CHANGE-ME' then raise exception 'Choose a real password first.'; end if;
  problem := _password_problem(p_password);
  if problem is not null then raise exception '%', problem; end if;
  update people
    set password_hash = crypt(p_password, gen_salt('bf', 10)),
        password_cipher = pgp_sym_encrypt(p_password, _password_key()),
        updated_at = now()
    where username = lower(p_username);
  if not found then raise exception 'No such username: %', p_username; end if;
  return 'Password set for ' || p_username;
end $$;
revoke all on function set_bootstrap_password(text, text) from public, anon, authenticated;
revoke all on function seed_people(jsonb) from public, anon, authenticated;

-- ── What the app may call ───────────────────────────────────────────────────

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function sign_in(text, text) to anon;
grant execute on function submit_code(text, text) to anon;
grant execute on function choose_store(text, text) to anon;
grant execute on function sign_out(text) to anon;
grant execute on function whoami(text) to anon;
grant execute on function load_state(text, text) to anon;
grant execute on function put_docs(text, jsonb) to anon;
grant execute on function remove_docs(text, text, text[]) to anon;
grant execute on function add_person(text, jsonb, text) to anon;
grant execute on function update_person(text, text, jsonb) to anon;
grant execute on function set_password(text, text, text) to anon;
grant execute on function reveal_password(text, text) to anon;
grant execute on function clear_all_data(text) to anon;
