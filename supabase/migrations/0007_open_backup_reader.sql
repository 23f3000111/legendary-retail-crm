-- ============================================================================
-- A read-only login for the open copy, blind to passwords (19 November)
-- ============================================================================
--
-- Besides the encrypted nightly backup, the developer keeps an unencrypted
-- copy in a private repository of their own (`legendary-crm-data`). The job
-- that makes it signs in with this login, whose connection string lives only
-- in that repository's secrets.
--
-- It can read what a backup holds — every document, the outlets, the
-- settings — and from the logins only the columns that are not passwords.
-- Even with this login's password in hand, nobody could read a password
-- hash, the encrypted readable copy, or the history of either; nor write a
-- row, nor call anything the app calls.
--
-- Created without a password, like `backup_reader`. `scripts/backup-reader.mjs
-- --role backup_open_reader` sets one and writes the connection string.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'backup_open_reader') then
    create role backup_open_reader nologin;
  end if;
end $$;

grant usage on schema public to backup_open_reader;

grant select on public.docs, public.locations, public.settings to backup_open_reader;
-- Column by column, so the three password columns are out of reach.
revoke select on public.people from backup_open_reader;
grant select (id, username, role, active, doc, updated_at) on public.people to backup_open_reader;

-- Every table has row-level security on and no policy for the app's key.
-- This login gets a read policy on the four it copies, and only as itself.
drop policy if exists backup_open_reader_read on public.people;
create policy backup_open_reader_read on public.people for select to backup_open_reader using (true);
drop policy if exists backup_open_reader_read on public.docs;
create policy backup_open_reader_read on public.docs for select to backup_open_reader using (true);
drop policy if exists backup_open_reader_read on public.locations;
create policy backup_open_reader_read on public.locations for select to backup_open_reader using (true);
drop policy if exists backup_open_reader_read on public.settings;
create policy backup_open_reader_read on public.settings for select to backup_open_reader using (true);

-- Nothing it can run, and no way to become somebody else.
revoke execute on all functions in schema public from backup_open_reader;
alter role backup_open_reader nocreatedb nocreaterole noinherit;
