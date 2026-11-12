create schema if not exists private;

create table private.account_usernames (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text collate "C" not null unique
    check (username ~ '^[a-z0-9_]{3,24}$')
);

alter table private.account_usernames enable row level security;
revoke all on table private.account_usernames from public, anon, authenticated;

create function private.record_account_username()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into private.account_usernames (user_id, username)
  values (new.id, lower(btrim(new.raw_user_meta_data ->> 'username') collate "C"));
  return new;
end;
$$;

revoke all on function private.record_account_username() from public, anon, authenticated;

create trigger record_account_username
  after insert on auth.users
  for each row execute function private.record_account_username();

create function public.resolve_username_email(account_username text)
returns text
language sql stable
security definer set search_path = ''
as $$
  select users.email
  from private.account_usernames as accounts
  join auth.users as users on users.id = accounts.user_id
  where accounts.username = account_username
    and users.deleted_at is null;
$$;

revoke all on function public.resolve_username_email(text) from public, anon, authenticated;
grant execute on function public.resolve_username_email(text) to service_role;
