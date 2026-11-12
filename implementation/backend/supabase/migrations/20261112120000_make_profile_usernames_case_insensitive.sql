begin;

lock table public.profiles in access exclusive mode;

alter table public.profiles drop constraint profiles_username_key;

create unique index profiles_username_case_insensitive_key
  on public.profiles (lower(username))
  where username is not null;

create or replace function public.resolve_username_email(account_username text)
returns text
language sql stable
security definer set search_path = ''
as $$
  select users.email
  from public.profiles
  join auth.users as users on users.id = profiles.id
  where lower(profiles.username) = lower(account_username collate "C")
    and users.deleted_at is null;
$$;

commit;
