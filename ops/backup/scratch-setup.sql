-- Run on the throwaway database the nightly job restores into, before the
-- schema. The dump refers to these two things, which live outside the four
-- tables it holds: the read-only role named in its row-security policies, and
-- the function behind the activity log's append-only guard.
create role backup_reader nologin;

create or replace function public.audit_is_append_only() returns trigger
language plpgsql as $$
begin
  if old.kind = 'audit' then
    raise exception 'The activity log cannot be edited.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
