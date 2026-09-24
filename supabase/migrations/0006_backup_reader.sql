-- ============================================================================
-- A read-only login for the nightly backup
-- ============================================================================
--
-- The backup runs somewhere other than this server — a scheduled GitHub
-- workflow — so it holds a password for this database. It should be one that
-- can only *read* what needs keeping. If it ever leaked, whoever held it could
-- copy the data but could not change or delete a single row, sign anybody in,
-- or reach the password key in Vault.
--
-- This file creates the role without a password, so nothing secret is in the
-- repository. `scripts/backup-reader.mjs` sets one and prints the connection
-- string to store as the workflow's secret.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'backup_reader') then
    create role backup_reader nologin;
  end if;
end $$;

grant usage on schema public to backup_reader;

-- What a restore needs, and nothing else. Sessions, sign-in attempts, pending
-- codes and the mail log are working state, not records: restoring an old
-- session would bring a signed-out device back to life.
grant select on public.people, public.docs, public.locations, public.settings to backup_reader;

-- Every table has row-level security on and no policies, which is what keeps
-- the app's anonymous key out. This role gets a read policy on the four it
-- backs up — reading only, and only as itself.
drop policy if exists backup_reader_read on public.people;
create policy backup_reader_read on public.people for select to backup_reader using (true);
drop policy if exists backup_reader_read on public.docs;
create policy backup_reader_read on public.docs for select to backup_reader using (true);
drop policy if exists backup_reader_read on public.locations;
create policy backup_reader_read on public.locations for select to backup_reader using (true);
drop policy if exists backup_reader_read on public.settings;
create policy backup_reader_read on public.settings for select to backup_reader using (true);

-- Nothing it can run, and no way to become somebody else.
revoke execute on all functions in schema public from backup_reader;
alter role backup_reader nocreatedb nocreaterole noinherit;
