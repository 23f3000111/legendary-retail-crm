-- ============================================================================
-- Sending mail — the six-digit code at sign-in
-- ============================================================================
--
-- Safe to run before you have a mail account: it creates the machinery and
-- sends nothing. Mail starts going out only once a key is stored and the
-- second step is switched on, both of which are single statements at the
-- bottom of this file.
--
-- How it works
-- ------------
-- `pg_net` posts to the mail provider's API in the background. It is
-- deliberately asynchronous: a sign-in must not sit waiting on somebody
-- else's web service, so the code is written down, the request is queued, and
-- the person is told to check their mail. If the send later fails, it fails in
-- `mail_log` where Imran can see it, and the person asks for a new code.
--
-- The key lives in Supabase Vault, outside the tables, like the password key.
-- The mail log records who was written to and whether it left — never the
-- code itself, which would make the log as good as the mail.
-- ============================================================================

create extension if not exists pg_net with schema extensions;

create table if not exists mail_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  -- Masked. The full address is on the person's login, not here.
  to_masked   text not null,
  purpose     text not null,
  request_id  bigint,
  error       text
);
create index if not exists mail_log_recent on mail_log(at desc);
alter table mail_log enable row level security;
revoke all on mail_log from anon, authenticated;

insert into settings(key, value) values
  ('mail_from', '"Legendary CRM <onboarding@resend.dev>"'::jsonb)
on conflict do nothing;

-- The provider's key. Null until `set_mail_key()` has been run.
create or replace function _mail_key() returns text
language sql security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'crm_mail_api_key' limit 1
$$;
revoke all on function _mail_key() from public, anon, authenticated;

create or replace function set_mail_key(p_key text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_key is null or length(btrim(p_key)) < 10 then
    raise exception 'That does not look like an API key.';
  end if;
  if exists (select 1 from vault.secrets where name = 'crm_mail_api_key') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'crm_mail_api_key'), btrim(p_key));
  else
    perform vault.create_secret(btrim(p_key), 'crm_mail_api_key', 'Mail provider API key.');
  end if;
  return 'Mail key stored. Send yourself a test with: select send_test_mail(''you@example.com'');';
end $$;
revoke all on function set_mail_key(text) from public, anon, authenticated;

create or replace function set_setting(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  insert into settings(key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value;
  return p_value;
end $$;
revoke all on function set_setting(text, jsonb) from public, anon, authenticated;

-- ── Sending ─────────────────────────────────────────────────────────────────

/*
 * Queues one message. Returns false, and writes down why, where it could not
 * even be attempted — no key, or no address.
 *
 * Written for Resend (resend.com), whose free tier covers this comfortably.
 * Another provider is a change to the URL and the body below and nothing else.
 */
create or replace function _send_mail(p_to text, p_subject text, p_html text, p_purpose text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  -- Not `key`: that is a column of `settings`, and plpgsql would not know
  -- which one the query below meant.
  api_key text := _mail_key();
  sender text := coalesce(
    (select s.value #>> '{}' from settings s where s.key = 'mail_from'),
    'Legendary CRM <onboarding@resend.dev>');
  req_id bigint;
begin
  if api_key is null then
    insert into mail_log(to_masked, purpose, error) values (_mask_email(p_to), p_purpose, 'No mail key stored');
    return false;
  end if;
  if p_to is null or position('@' in p_to) = 0 then
    insert into mail_log(to_masked, purpose, error) values (coalesce(p_to, '(none)'), p_purpose, 'No address on the login');
    return false;
  end if;

  select net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', sender,
      'to', jsonb_build_array(p_to),
      'subject', p_subject,
      'html', p_html),
    timeout_milliseconds := 8000
  ) into req_id;

  insert into mail_log(to_masked, purpose, request_id) values (_mask_email(p_to), p_purpose, req_id);
  return true;
exception when others then
  -- A mail that will not send must never stop somebody signing in.
  insert into mail_log(to_masked, purpose, error) values (_mask_email(p_to), p_purpose, sqlerrm);
  return false;
end $$;

create or replace function _code_email(p_name text, p_code text) returns text
language sql immutable as $$
  select
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1a2e">'
    || '<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7b61ff;margin:0 0 4px">Legendary Retail CRM</p>'
    || '<h1 style="font-size:20px;margin:0 0 16px">Your sign-in code</h1>'
    || '<p style="font-size:14px;line-height:1.6;margin:0 0 20px">Hello ' || coalesce(p_name, 'there')
    || ', here is the code to finish signing in.</p>'
    || '<p style="font-size:34px;font-weight:700;letter-spacing:.32em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;'
    || 'background:#f4f2ff;border-radius:12px;padding:18px 0;text-align:center;margin:0 0 20px">' || p_code || '</p>'
    || '<p style="font-size:13px;line-height:1.6;color:#5a5a72;margin:0">It lasts ten minutes and can be used once. '
    || 'If you did not just try to sign in, tell Imran — somebody has your password.</p>'
    || '</div>'
$$;

/** A message to yourself, to check the account works before switching it on. */
create or replace function send_test_mail(p_to text) returns text
language plpgsql security definer set search_path = public as $$
declare
  ok boolean;
begin
  ok := _send_mail(p_to, 'Legendary CRM — test',
    '<p style="font-family:system-ui,sans-serif">Mail from the CRM is working. '
    || 'You can switch the sign-in code on now.</p>', 'test');
  if not ok then
    return 'Could not send. Check: select * from mail_log order by at desc limit 3;';
  end if;
  return 'Queued. Check it arrived, then: select * from mail_status();';
end $$;
revoke all on function send_test_mail(text) from public, anon, authenticated;

/** What was sent, and what the provider said back. */
create or replace function mail_status()
returns table (at timestamptz, "to" text, purpose text, outcome text, detail text)
language sql security definer set search_path = public, extensions as $$
  select m.at, m.to_masked, m.purpose,
    case
      when m.error is not null then 'not sent'
      when r.status_code between 200 and 299 then 'delivered to the provider'
      when r.status_code is not null then 'refused (' || r.status_code || ')'
      else 'still sending'
    end,
    coalesce(m.error, left(r.content, 300))
  from mail_log m
  left join net._http_response r on r.id = m.request_id
  order by m.at desc
  limit 50
$$;
revoke all on function mail_status() from public, anon, authenticated;

-- ── Hooking it into sign-in ─────────────────────────────────────────────────
--
-- Replaces the `TODO` left in 0001_init.sql. Everything else about sign_in()
-- is unchanged.

create or replace function sign_in(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  uname text := lower(btrim(coalesce(p_username, '')));
  p people;
  recent_failures int;
  token text;
  two_step boolean := coalesce(
    (select s.value::text = 'true' from settings s where s.key = 'two_step'), false);
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

    -- Queued, not waited for: a slow mail service must not hold up a sign-in.
    perform _send_mail(p.doc->>'email', 'Your Legendary CRM sign-in code',
                       _code_email(p.doc->>'name', code), 'sign_in_code');

    perform _audit(p.id, p.doc->>'name', p.role, 'session', 'session.code_sent',
                   'A sign-in code was sent to ' || _mask_email(p.doc->>'email'), p.id);
    return jsonb_build_object('ok', true, 'token', token, 'needsCode', true,
                              'sentTo', _mask_email(p.doc->>'email'));
  end if;

  return _open_session(p);
end $$;
grant execute on function sign_in(text, text) to anon;

-- ============================================================================
-- Switching it on — the two statements
-- ============================================================================
--
--   1. Store the key from your mail provider:
--        select set_mail_key('re_xxxxxxxxxxxxxxxxxxxx');
--
--   2. Say who it comes from. Until your own domain is verified with the
--      provider, leave the default; after that:
--        select set_setting('mail_from', '"Legendary CRM <crm@legendary.com.my>"'::jsonb);
--
--   3. Send yourself one and check it arrives:
--        select send_test_mail('you@example.com');
--        select * from mail_status();
--
--   4. Only when that works, turn the second step on:
--        select set_setting('two_step', 'true'::jsonb);
--
--   To turn it off again:
--        select set_setting('two_step', 'false'::jsonb);
-- ============================================================================
