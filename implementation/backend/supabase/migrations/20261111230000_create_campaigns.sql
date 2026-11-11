create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.campaigns enable row level security;

revoke all on table public.campaigns from anon;
grant select, insert, update, delete on table public.campaigns to authenticated;

create policy "Users can read their own campaigns"
  on public.campaigns for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can create their own campaigns"
  on public.campaigns for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Users can update their own campaigns"
  on public.campaigns for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Users can delete their own campaigns"
  on public.campaigns for delete to authenticated
  using ((select auth.uid()) = owner_id);

create function public.set_campaigns_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_campaigns_updated_at();
