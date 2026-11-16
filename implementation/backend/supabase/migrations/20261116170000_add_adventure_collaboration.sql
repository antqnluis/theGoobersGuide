begin;

-- M03.6 Phase 1: adventure collaboration.
-- Invitations by consent, leaving, sharing with the party, the party audience, and departure
-- semantics for shared threads (D1-D15). Derived state (promotion from proposed to invited,
-- and each adventure's visibility) is recomputed by private.reconcile_adventure inside every
-- write path; a deferred constraint trigger refuses any commit that leaves an adventure shared
-- without every accepted participant's consent.

-- 2.1 Table changes ----------------------------------------------------------------------

alter table public.adventures drop constraint adventures_visibility_check;
alter table public.adventures add constraint adventures_visibility_check
  check (visibility in ('participants', 'party', 'campaign'));

alter table public.adventure_participants
  add column invited_by uuid references public.profiles (id) on delete set null,
  add column share_consent boolean not null default false,
  add column share_consent_at timestamptz,
  add column responded_at timestamptz,
  add column updated_at timestamptz not null default now(),
  add constraint adventure_participants_consent_check
    check ((not share_consent or status = 'accepted') and (share_consent = (share_consent_at is not null)));

-- D1: one live participation per player per adventure.
create unique index adventure_participants_one_live_per_player_idx
  on public.adventure_participants (adventure_id, profile_id)
  where status in ('proposed', 'invited', 'accepted');

create table public.adventure_invite_approvals (
  participant_id uuid not null references public.adventure_participants (id) on delete cascade,
  approver_id uuid not null references public.profiles (id) on delete cascade,
  approved_at timestamptz not null default now(),
  primary key (participant_id, approver_id)
);

create index adventure_invite_approvals_approver_idx
  on public.adventure_invite_approvals (approver_id);

-- 2.2 Party and participation helpers ----------------------------------------------------

-- M03 approved decision 2: campaigns where the caller is a current member and owns an active,
-- in-party character (in_party already requires status = 'active').
create function private.current_party_campaign_ids()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select distinct c.campaign_id
  from public.characters as c
  where c.owner_id = (select auth.uid())
    and c.in_party
    and c.campaign_id in (select private.current_campaign_ids());
$$;

-- Adventures where the caller owns an accepted participant, archived ones included.
create function private.participating_adventure_ids()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select p.adventure_id
  from public.adventure_participants as p
  where p.profile_id = (select auth.uid())
    and p.status = 'accepted'
    and p.campaign_id in (select private.current_campaign_ids());
$$;

-- 2.3 Visibility helpers (replaced) --------------------------------------------------------

-- Readable: main (archived only for its creator), the caller's own threads (archived included,
-- D10), and live party-shared threads for the party (D7).
create or replace function private.visible_adventure_ids()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select a.id
  from public.adventures as a
  where a.campaign_id in (select private.current_campaign_ids())
    and (
      (a.type = 'main' and (a.archived_at is null or a.created_by = (select auth.uid())))
      or a.id in (select private.participating_adventure_ids())
      or (
        a.visibility = 'party'
        and a.archived_at is null
        and a.campaign_id in (select private.current_party_campaign_ids())
      )
    );
$$;

-- Updatable rows (the adventures update policy): the visible set without the party audience.
create function private.writable_adventure_ids()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select a.id
  from public.adventures as a
  where a.campaign_id in (select private.current_campaign_ids())
    and (
      (a.type = 'main' and (a.archived_at is null or a.created_by = (select auth.uid())))
      or a.id in (select private.participating_adventure_ids())
    );
$$;

-- Where objectives and updates may be written: writable and not archived.
create or replace function private.editable_adventure_ids()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select w.id
  from private.writable_adventure_ids() as w (id)
  join public.adventures as a on a.id = w.id
  where a.archived_at is null;
$$;

revoke all on function private.current_party_campaign_ids() from public, anon, authenticated, service_role;
revoke all on function private.participating_adventure_ids() from public, anon, authenticated, service_role;
revoke all on function private.visible_adventure_ids() from public, anon, authenticated, service_role;
revoke all on function private.writable_adventure_ids() from public, anon, authenticated, service_role;
revoke all on function private.editable_adventure_ids() from public, anon, authenticated, service_role;
grant execute on function private.current_party_campaign_ids() to authenticated;
grant execute on function private.participating_adventure_ids() to authenticated;
grant execute on function private.visible_adventure_ids() to authenticated;
grant execute on function private.writable_adventure_ids() to authenticated;
grant execute on function private.editable_adventure_ids() to authenticated;

-- 2.4 Derived state -----------------------------------------------------------------------

-- The visibility an adventure must have: main is always 'campaign'; personal and side are
-- 'party' only when at least one accepted participant exists, every one has consented, and the
-- adventure is not archived. Volatile on purpose: it must see the rows of the current command.
create function private.derived_adventure_visibility(p_adventure_id uuid, p_archived boolean)
returns text
language sql
security definer set search_path = ''
as $$
  select case
    when a.type = 'main' then 'campaign'
    when not p_archived
      and exists (
        select 1 from public.adventure_participants as p
        where p.adventure_id = a.id and p.status = 'accepted'
      )
      and not exists (
        select 1 from public.adventure_participants as p
        where p.adventure_id = a.id and p.status = 'accepted' and not p.share_consent
      ) then 'party'
    else 'participants'
  end
  from public.adventures as a
  where a.id = p_adventure_id;
$$;

-- Recomputes promotion and visibility. Called with the adventure row already locked.
create function private.reconcile_adventure(p_adventure_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_adventure public.adventures;
  v_target text;
begin
  select * into v_adventure from public.adventures where id = p_adventure_id;
  if not found or v_adventure.type = 'main' then
    return;
  end if;

  -- Archiving never leaves a consent behind, so restoring cannot republish (D6, D10).
  if v_adventure.archived_at is not null then
    update public.adventure_participants
    set share_consent = false, share_consent_at = null, updated_at = now()
    where adventure_id = p_adventure_id and share_consent;
  end if;

  -- Step 1 (D3): a proposal is sent once every accepted participant has approved it. Frozen
  -- while the adventure is archived (D10).
  if v_adventure.archived_at is null then
    update public.adventure_participants as pending
    set status = 'invited', updated_at = now()
    where pending.adventure_id = p_adventure_id
      and pending.status = 'proposed'
      and exists (
        select 1 from public.adventure_participants as member
        where member.adventure_id = p_adventure_id and member.status = 'accepted'
      )
      and not exists (
        select 1 from public.adventure_participants as member
        where member.adventure_id = p_adventure_id
          and member.status = 'accepted'
          and not exists (
            select 1 from public.adventure_invite_approvals as approval
            where approval.participant_id = pending.id and approval.approver_id = member.profile_id
          )
      );
  end if;

  -- Steps 2 and 3 (D6): visibility follows consent, and a share that ends clears every consent.
  v_target := private.derived_adventure_visibility(p_adventure_id, v_adventure.archived_at is not null);
  if v_target is distinct from v_adventure.visibility then
    if v_adventure.visibility = 'party' then
      update public.adventure_participants
      set share_consent = false, share_consent_at = null, updated_at = now()
      where adventure_id = p_adventure_id and share_consent;
    end if;
    update public.adventures set visibility = v_target where id = p_adventure_id;
  end if;
end;
$$;

revoke all on function private.derived_adventure_visibility(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.reconcile_adventure(uuid)
  from public, anon, authenticated, service_role;

-- 2.5 Guards and the consent constraint ---------------------------------------------------

create or replace function private.guard_adventure_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_may_archive boolean;
  v_visibility_changed boolean := new.visibility is distinct from old.visibility;
begin
  -- Foreign-key actions (a deleted account) and reconcile run inside another trigger and only
  -- clear an attribution or follow derived state, so they are not recorded as an edit.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.id <> old.id or new.campaign_id <> old.campaign_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at then
    raise integrity_constraint_violation using message = 'adventure_reassignment_forbidden';
  end if;

  -- Visibility follows consent and archiving; no other value is ever accepted.
  if v_visibility_changed
     and new.visibility is distinct from
         private.derived_adventure_visibility(new.id, new.archived_at is not null) then
    raise integrity_constraint_violation using message = 'adventure_visibility_forbidden';
  end if;

  if (new.type = 'main') <> (old.type = 'main') then
    raise exception 'adventure_type_change_forbidden';
  end if;

  if old.archived_at is not null or new.archived_at is not null then
    if old.type = 'main' then
      v_may_archive := caller_id is not distinct from old.created_by;
    else
      -- D10: the creator while an accepted participant; anyone accepted once the creator is not.
      v_may_archive :=
        exists (
          select 1 from public.adventure_participants as p
          where p.adventure_id = old.id and p.profile_id = caller_id and p.status = 'accepted'
        )
        and (
          caller_id is not distinct from old.created_by
          or not exists (
            select 1 from public.adventure_participants as p
            where p.adventure_id = old.id and p.profile_id = old.created_by
              and p.status = 'accepted'
          )
        );
    end if;
  end if;

  if old.archived_at is not null then
    -- Archived adventures are read-only. The only change is restoring one.
    if new.archived_at is not null
       or (new.type, new.status, new.title, new.description, new.next_step, new.reference)
          is distinct from
          (old.type, old.status, old.title, old.description, old.next_step, old.reference) then
      raise exception 'adventure_archived';
    end if;
    if not v_may_archive then
      raise insufficient_privilege using message = 'adventure_archive_creator_only';
    end if;
  elsif new.archived_at is not null then
    if not v_may_archive then
      raise insufficient_privilege using message = 'adventure_archive_creator_only';
    end if;
    new.archived_at := now();
  end if;

  if new.status <> old.status then
    new.status_changed_at := now();
    new.status_changed_by := caller_id;
  else
    new.status_changed_at := old.status_changed_at;
    new.status_changed_by := old.status_changed_by;
  end if;

  -- A visibility change is derived state, not an edit by the caller.
  if v_visibility_changed then
    new.updated_by := old.updated_by;
  else
    new.updated_by := caller_id;
  end if;
  return new;
end;
$$;

-- Archiving ends a share and freezes pending invitations; restoring unfreezes them.
create function private.after_adventure_archive_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.reconcile_adventure(new.id);
  return null;
end;
$$;

create or replace function private.guard_adventure_participant_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  -- Foreign-key actions (a deleted inviter) and reconcile run inside another trigger.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return new;
  end if;

  if exists (select 1 from public.adventures where id = new.adventure_id and type = 'main') then
    raise exception 'adventure_main_has_no_participants';
  end if;

  if tg_op = 'INSERT' then
    -- Rows arrive as proposed (propose_adventure_participant), or as the first accepted row of
    -- a new adventure (create_adventure).
    if new.status = 'accepted' then
      if exists (
        select 1 from public.adventure_participants where adventure_id = new.adventure_id
      ) then
        raise exception 'adventure_participant_transition_forbidden';
      end if;
    elsif new.status <> 'proposed' then
      raise exception 'adventure_participant_transition_forbidden';
    end if;
    if new.status <> 'accepted' then
      new.share_consent := false;
    end if;
    new.share_consent_at := case when new.share_consent then now() end;
    return new;
  end if;

  if new.id <> old.id or new.adventure_id <> old.adventure_id
     or new.campaign_id <> old.campaign_id or new.character_id <> old.character_id
     or new.profile_id <> old.profile_id or new.created_at <> old.created_at then
    raise integrity_constraint_violation using message = 'adventure_reassignment_forbidden';
  end if;

  if new.status <> old.status then
    if (old.status, new.status) not in (
      ('proposed', 'invited'),
      ('invited', 'accepted'),
      ('invited', 'declined'),
      ('accepted', 'left'),
      ('declined', 'proposed'),
      ('left', 'proposed')
    ) then
      raise exception 'adventure_participant_transition_forbidden';
    end if;
    new.updated_at := now();
    new.responded_at := case
      when new.status in ('accepted', 'declined') then now()
      when new.status = 'proposed' then null
      else old.responded_at
    end;
  end if;

  -- Consent exists only on accepted rows; the timestamp follows the flag.
  if new.status <> 'accepted' then
    new.share_consent := false;
  end if;
  if new.share_consent and not old.share_consent then
    new.share_consent_at := now();
    new.updated_at := now();
  elsif not new.share_consent then
    if old.share_consent then
      new.updated_at := now();
    end if;
    new.share_consent_at := null;
  else
    new.share_consent_at := old.share_consent_at;
  end if;
  return new;
end;
$$;

-- The privacy invariant, checked at commit for every write path (including postgres and
-- service-role tooling): a party adventure is never archived, never without accepted
-- participants, and never with an accepted participant who has not consented. The reverse
-- (everyone consents but it is not shared) is not a leak and is left to reconcile.
create function private.check_adventure_share_consent()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_adventure_id uuid;
begin
  if tg_table_name = 'adventures' then
    v_adventure_id := new.id;
  else
    v_adventure_id := coalesce(new.adventure_id, old.adventure_id);
  end if;

  if exists (
    select 1
    from public.adventures as a
    where a.id = v_adventure_id
      and a.visibility = 'party'
      and (
        a.archived_at is not null
        or not exists (
          select 1 from public.adventure_participants as p
          where p.adventure_id = a.id and p.status = 'accepted'
        )
        or exists (
          select 1 from public.adventure_participants as p
          where p.adventure_id = a.id and p.status = 'accepted' and not p.share_consent
        )
      )
  ) then
    raise integrity_constraint_violation using message = 'adventure_share_consent_missing';
  end if;
  return null;
end;
$$;

-- Replaces delete_orphaned_adventure: an adventure with no accepted participant left goes too
-- (M03.5 D5); otherwise it is reconciled (D11). When the adventure itself is being deleted it
-- is already gone, and this does nothing.
create function private.after_adventure_participant_delete()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.adventures as a
  where a.id = old.adventure_id
    and a.type <> 'main'
    and not exists (
      select 1 from public.adventure_participants as p
      where p.adventure_id = a.id and p.status = 'accepted'
    );
  perform private.reconcile_adventure(old.adventure_id);
  return null;
end;
$$;

drop trigger adventure_participants_delete_orphan on public.adventure_participants;
drop function private.delete_orphaned_adventure();

create trigger adventures_reconcile_on_archive
  after update of archived_at on public.adventures
  for each row
  when (old.archived_at is distinct from new.archived_at)
  execute function private.after_adventure_archive_change();

create trigger adventure_participants_after_delete
  after delete on public.adventure_participants
  for each row execute function private.after_adventure_participant_delete();

create constraint trigger adventures_check_share_consent
  after insert or update of visibility, archived_at on public.adventures
  deferrable initially deferred
  for each row execute function private.check_adventure_share_consent();

create constraint trigger adventure_participants_check_share_consent
  after insert or update or delete on public.adventure_participants
  deferrable initially deferred
  for each row execute function private.check_adventure_share_consent();

revoke all on function private.guard_adventure_write() from public, anon, authenticated, service_role;
revoke all on function private.after_adventure_archive_change()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_adventure_participant_write()
  from public, anon, authenticated, service_role;
revoke all on function private.check_adventure_share_consent()
  from public, anon, authenticated, service_role;
revoke all on function private.after_adventure_participant_delete()
  from public, anon, authenticated, service_role;

-- 2.6 RPCs ----------------------------------------------------------------------------------
-- Lock order (D14): campaign FOR SHARE -> character FOR SHARE (where one is involved) ->
-- adventure FOR UPDATE. Each helper returns null when the caller cannot reach the row, so every
-- RPC can answer with its own "unavailable" code and unknown, inaccessible, and departed cases
-- look the same.

-- Locks the campaign of an adventure for a current member. Null for anyone else.
create function private.lock_adventure_campaign(p_adventure_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_campaign_id uuid;
begin
  select a.campaign_id into v_campaign_id
  from public.adventures as a
  where a.id = p_adventure_id;
  if v_campaign_id is null then
    return null;
  end if;

  perform 1
  from public.campaigns
  where campaigns.id = v_campaign_id
    and exists (
      select 1 from public.campaign_members as m
      where m.campaign_id = campaigns.id and m.profile_id = (select auth.uid())
    )
  for share of campaigns;
  if not found then
    return null;
  end if;
  return v_campaign_id;
end;
$$;

-- Locks the adventure row. Returns an empty row when it is gone.
create function private.lock_adventure_row(p_adventure_id uuid)
returns public.adventures
language plpgsql
security definer set search_path = ''
as $$
declare
  v_adventure public.adventures;
begin
  select * into v_adventure from public.adventures where id = p_adventure_id for update;
  return v_adventure;
end;
$$;

revoke all on function private.lock_adventure_campaign(uuid) from public, anon, authenticated, service_role;
revoke all on function private.lock_adventure_row(uuid) from public, anon, authenticated, service_role;

create function public.propose_adventure_participant(p_adventure_id uuid, p_character_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_campaign_id uuid;
  v_adventure public.adventures;
  v_character public.characters;
  v_participant_id uuid;
begin
  if p_adventure_id is null then
    raise exception 'adventure_unavailable';
  end if;

  v_campaign_id := private.lock_adventure_campaign(p_adventure_id);
  if v_campaign_id is null then
    raise exception 'adventure_unavailable';
  end if;

  -- The character is locked before the adventure, and against deletion.
  if p_character_id is not null then
    select * into v_character
    from public.characters
    where id = p_character_id and campaign_id = v_campaign_id
    for share;
  end if;

  v_adventure := private.lock_adventure_row(p_adventure_id);
  if v_adventure.id is null then
    raise exception 'adventure_unavailable';
  end if;
  if v_adventure.type = 'main' then
    raise exception 'adventure_main_has_no_participants';
  end if;
  if not exists (
    select 1 from public.adventure_participants as p
    where p.adventure_id = p_adventure_id and p.profile_id = caller_id and p.status = 'accepted'
  ) then
    raise exception 'adventure_unavailable';
  end if;
  if v_adventure.archived_at is not null then
    raise exception 'adventure_archived';
  end if;

  -- D2: an active character of a current member, in this campaign.
  if v_character.id is null or v_character.status <> 'active' or not exists (
    select 1 from public.campaign_members as m
    where m.campaign_id = v_campaign_id and m.profile_id = v_character.owner_id
  ) then
    raise exception 'adventure_character_unavailable';
  end if;

  -- D1: one live participation per player.
  if exists (
    select 1 from public.adventure_participants as p
    where p.adventure_id = p_adventure_id
      and p.profile_id = v_character.owner_id
      and p.status in ('proposed', 'invited', 'accepted')
  ) then
    raise exception 'adventure_player_already_participating';
  end if;

  -- D12: ten live participations per adventure.
  if (
    select count(*) from public.adventure_participants as p
    where p.adventure_id = p_adventure_id and p.status in ('proposed', 'invited', 'accepted')
  ) >= 10 then
    raise exception 'adventure_participant_limit_reached';
  end if;

  select p.id into v_participant_id
  from public.adventure_participants as p
  where p.adventure_id = p_adventure_id and p.character_id = p_character_id;

  if v_participant_id is not null then
    -- A declined or left character is proposed again through a new round of approvals.
    delete from public.adventure_invite_approvals where participant_id = v_participant_id;
    update public.adventure_participants
    set status = 'proposed', invited_by = caller_id
    where id = v_participant_id;
  else
    insert into public.adventure_participants (
      adventure_id, campaign_id, character_id, profile_id, status, invited_by
    ) values (
      p_adventure_id, v_campaign_id, p_character_id, v_character.owner_id, 'proposed', caller_id
    )
    returning id into v_participant_id;
  end if;

  insert into public.adventure_invite_approvals (participant_id, approver_id)
  values (v_participant_id, caller_id);

  perform private.reconcile_adventure(p_adventure_id);
  return v_participant_id;
end;
$$;

create function public.approve_adventure_participant(p_participant_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_adventure_id uuid;
  v_adventure public.adventures;
begin
  select p.adventure_id into v_adventure_id
  from public.adventure_participants as p
  where p.id = p_participant_id;
  if v_adventure_id is null or private.lock_adventure_campaign(v_adventure_id) is null then
    raise exception 'adventure_proposal_unavailable';
  end if;

  v_adventure := private.lock_adventure_row(v_adventure_id);
  if v_adventure.id is null or v_adventure.archived_at is not null
     or not exists (
       select 1 from public.adventure_participants as p
       where p.adventure_id = v_adventure_id and p.profile_id = caller_id and p.status = 'accepted'
     )
     or not exists (
       select 1 from public.adventure_participants as p
       where p.id = p_participant_id and p.status = 'proposed'
     )
     or exists (
       select 1 from public.adventure_invite_approvals as a
       where a.participant_id = p_participant_id and a.approver_id = caller_id
     ) then
    raise exception 'adventure_proposal_unavailable';
  end if;

  insert into public.adventure_invite_approvals (participant_id, approver_id)
  values (p_participant_id, caller_id);

  perform private.reconcile_adventure(v_adventure_id);
end;
$$;

create function public.cancel_adventure_participant(p_participant_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_adventure_id uuid;
  v_adventure public.adventures;
begin
  select p.adventure_id into v_adventure_id
  from public.adventure_participants as p
  where p.id = p_participant_id;
  if v_adventure_id is null or private.lock_adventure_campaign(v_adventure_id) is null then
    raise exception 'adventure_proposal_unavailable';
  end if;

  v_adventure := private.lock_adventure_row(v_adventure_id);
  if v_adventure.id is null
     or not exists (
       select 1 from public.adventure_participants as p
       where p.adventure_id = v_adventure_id and p.profile_id = caller_id and p.status = 'accepted'
     ) then
    raise exception 'adventure_proposal_unavailable';
  end if;

  -- D4: the row is deleted. Frozen while archived (D10).
  delete from public.adventure_participants
  where id = p_participant_id
    and status in ('proposed', 'invited')
    and v_adventure.archived_at is null;
  if not found then
    raise exception 'adventure_proposal_unavailable';
  end if;
end;
$$;

create function public.respond_to_adventure_invitation(
  p_participant_id uuid,
  p_accept boolean,
  p_keep_shared boolean default false
) returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_adventure_id uuid;
  v_character_id uuid;
  v_adventure public.adventures;
begin
  if p_accept is null then
    raise invalid_parameter_value using message = 'adventure_response_required';
  end if;

  select p.adventure_id, p.character_id into v_adventure_id, v_character_id
  from public.adventure_participants as p
  where p.id = p_participant_id and p.profile_id = caller_id;
  if v_adventure_id is null or private.lock_adventure_campaign(v_adventure_id) is null then
    raise exception 'adventure_invitation_unavailable';
  end if;

  -- The invited character is locked before the adventure, and against deletion.
  perform 1 from public.characters where id = v_character_id for share;

  v_adventure := private.lock_adventure_row(v_adventure_id);
  if v_adventure.id is null or v_adventure.archived_at is not null
     or not exists (
       select 1 from public.adventure_participants as p
       where p.id = p_participant_id and p.profile_id = caller_id and p.status = 'invited'
     ) then
    raise exception 'adventure_invitation_unavailable';
  end if;

  if p_accept then
    update public.adventure_participants
    set status = 'accepted',
        share_consent = coalesce(p_keep_shared, false) and v_adventure.visibility = 'party'
    where id = p_participant_id;
  else
    update public.adventure_participants set status = 'declined' where id = p_participant_id;
  end if;

  perform private.reconcile_adventure(v_adventure_id);
end;
$$;

create function public.leave_adventure(p_adventure_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_adventure public.adventures;
begin
  if p_adventure_id is null or private.lock_adventure_campaign(p_adventure_id) is null then
    raise exception 'adventure_unavailable';
  end if;

  v_adventure := private.lock_adventure_row(p_adventure_id);
  if v_adventure.id is null or not exists (
    select 1 from public.adventure_participants as p
    where p.adventure_id = p_adventure_id and p.profile_id = caller_id and p.status = 'accepted'
  ) then
    raise exception 'adventure_unavailable';
  end if;

  -- D8: the last accepted participant archives instead.
  if not exists (
    select 1 from public.adventure_participants as p
    where p.adventure_id = p_adventure_id and p.profile_id <> caller_id and p.status = 'accepted'
  ) then
    raise exception 'adventure_last_participant';
  end if;

  update public.adventure_participants
  set status = 'left'
  where adventure_id = p_adventure_id and profile_id = caller_id and status = 'accepted';

  delete from public.adventure_invite_approvals as a
  using public.adventure_participants as p
  where a.participant_id = p.id and p.adventure_id = p_adventure_id and a.approver_id = caller_id;

  perform private.reconcile_adventure(p_adventure_id);
end;
$$;

create function public.set_adventure_share_consent(p_adventure_id uuid, p_consent boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_adventure public.adventures;
begin
  if p_consent is null then
    raise invalid_parameter_value using message = 'adventure_consent_required';
  end if;
  if p_adventure_id is null or private.lock_adventure_campaign(p_adventure_id) is null then
    raise exception 'adventure_unavailable';
  end if;

  v_adventure := private.lock_adventure_row(p_adventure_id);
  if v_adventure.id is null then
    raise exception 'adventure_unavailable';
  end if;
  if v_adventure.type = 'main' then
    raise exception 'adventure_main_has_no_participants';
  end if;
  if not exists (
    select 1 from public.adventure_participants as p
    where p.adventure_id = p_adventure_id and p.profile_id = caller_id and p.status = 'accepted'
  ) then
    raise exception 'adventure_unavailable';
  end if;
  if v_adventure.archived_at is not null then
    raise exception 'adventure_archived';
  end if;

  if p_consent then
    update public.adventure_participants
    set share_consent = true
    where adventure_id = p_adventure_id and profile_id = caller_id and status = 'accepted';
  else
    -- Not now and Stop sharing clear every consent, so a new request starts from nothing (D6).
    update public.adventure_participants
    set share_consent = false
    where adventure_id = p_adventure_id and share_consent;
  end if;

  perform private.reconcile_adventure(p_adventure_id);
end;
$$;

-- D5: the caller's own open invitations in one campaign, and nothing else about the adventure.
create function public.list_my_adventure_invitations(p_campaign_id uuid)
returns table (
  participant_id uuid,
  adventure_id uuid,
  title text,
  type text,
  character_id uuid,
  invited_by uuid,
  invited_at timestamptz,
  shared_with_party boolean
)
language sql
stable
security definer set search_path = ''
as $$
  select p.id, a.id, a.title, a.type, p.character_id, p.invited_by, p.updated_at,
         a.visibility = 'party'
  from public.adventure_participants as p
  join public.adventures as a on a.id = p.adventure_id
  where p.campaign_id = p_campaign_id
    and p.profile_id = (select auth.uid())
    and p.status = 'invited'
    and a.archived_at is null
    and p_campaign_id in (select private.current_campaign_ids())
  order by p.updated_at desc, p.id;
$$;

-- D13: invitations to the caller, proposals awaiting the caller's approval, and adventures with
-- a pending share request that the caller has not agreed to.
create function public.count_my_adventure_requests(p_campaign_id uuid)
returns integer
language sql
stable
security definer set search_path = ''
as $$
  select case when p_campaign_id in (select private.current_campaign_ids()) then (
    (
      select count(*)
      from public.adventure_participants as p
      join public.adventures as a on a.id = p.adventure_id
      where p.campaign_id = p_campaign_id
        and p.profile_id = (select auth.uid())
        and p.status = 'invited'
        and a.archived_at is null
    ) + (
      select count(*)
      from public.adventure_participants as pending
      join public.adventures as a on a.id = pending.adventure_id
      where pending.campaign_id = p_campaign_id
        and pending.status = 'proposed'
        and a.archived_at is null
        and exists (
          select 1 from public.adventure_participants as mine
          where mine.adventure_id = pending.adventure_id
            and mine.profile_id = (select auth.uid())
            and mine.status = 'accepted'
        )
        and not exists (
          select 1 from public.adventure_invite_approvals as approval
          where approval.participant_id = pending.id
            and approval.approver_id = (select auth.uid())
        )
    ) + (
      select count(*)
      from public.adventures as a
      where a.campaign_id = p_campaign_id
        and a.type <> 'main'
        and a.visibility = 'participants'
        and a.archived_at is null
        and exists (
          select 1 from public.adventure_participants as mine
          where mine.adventure_id = a.id
            and mine.profile_id = (select auth.uid())
            and mine.status = 'accepted'
            and not mine.share_consent
        )
        and exists (
          select 1 from public.adventure_participants as other
          where other.adventure_id = a.id and other.status = 'accepted' and other.share_consent
        )
    )
  )::integer else 0 end;
$$;

revoke all on function public.propose_adventure_participant(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.approve_adventure_participant(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cancel_adventure_participant(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.respond_to_adventure_invitation(uuid, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.leave_adventure(uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_adventure_share_consent(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.list_my_adventure_invitations(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.count_my_adventure_requests(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.propose_adventure_participant(uuid, uuid) to authenticated;
grant execute on function public.approve_adventure_participant(uuid) to authenticated;
grant execute on function public.cancel_adventure_participant(uuid) to authenticated;
grant execute on function public.respond_to_adventure_invitation(uuid, boolean, boolean)
  to authenticated;
grant execute on function public.leave_adventure(uuid) to authenticated;
grant execute on function public.set_adventure_share_consent(uuid, boolean) to authenticated;
grant execute on function public.list_my_adventure_invitations(uuid) to authenticated;
grant execute on function public.count_my_adventure_requests(uuid) to authenticated;

-- 2.7 Departure hook (replaced) -----------------------------------------------------------
-- Called by leave_campaign and remove_campaign_member after the membership row is deleted,
-- inside their transaction and under their campaign lock (D9).
create or replace function private.handle_campaign_member_departure(p_campaign_id uuid, p_profile_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_adventure_ids uuid[];
  v_id uuid;
  v_row record;
begin
  update public.characters
  set in_party = false
  where campaign_id = p_campaign_id and owner_id = p_profile_id and in_party;

  -- Every adventure the player touches, locked in id order.
  select coalesce(array_agg(distinct x.adventure_id order by x.adventure_id), '{}')
  into v_adventure_ids
  from (
    select p.adventure_id
    from public.adventure_participants as p
    where p.campaign_id = p_campaign_id and p.profile_id = p_profile_id
    union
    select p.adventure_id
    from public.adventure_invite_approvals as a
    join public.adventure_participants as p on p.id = a.participant_id
    where p.campaign_id = p_campaign_id and a.approver_id = p_profile_id
  ) as x;

  perform 1
  from public.adventures
  where id = any (v_adventure_ids)
  order by id
  for update;

  -- (c) Proposals and invitations to the player's characters.
  delete from public.adventure_participants
  where campaign_id = p_campaign_id and profile_id = p_profile_id
    and status in ('proposed', 'invited');

  -- (d) Their approvals.
  delete from public.adventure_invite_approvals as a
  using public.adventure_participants as p
  where a.participant_id = p.id and p.campaign_id = p_campaign_id and a.approver_id = p_profile_id;

  -- (a, b) Their accepted participations.
  for v_row in
    select p.id, p.adventure_id
    from public.adventure_participants as p
    where p.campaign_id = p_campaign_id and p.profile_id = p_profile_id and p.status = 'accepted'
    order by p.adventure_id
  loop
    if exists (
      select 1 from public.adventure_participants as other
      where other.adventure_id = v_row.adventure_id
        and other.status = 'accepted'
        and other.profile_id <> p_profile_id
    ) then
      update public.adventure_participants set status = 'left' where id = v_row.id;
    else
      -- A sole thread is kept for its owner's return, but private and closed to newcomers.
      update public.adventure_participants set share_consent = false where id = v_row.id;
      delete from public.adventure_participants
      where adventure_id = v_row.adventure_id and status in ('proposed', 'invited');
    end if;
  end loop;

  -- (e) Reconcile everything touched.
  foreach v_id in array v_adventure_ids loop
    perform private.reconcile_adventure(v_id);
  end loop;
end;
$$;

revoke all on function private.handle_campaign_member_departure(uuid, uuid)
  from public, anon, authenticated, service_role;

-- 3 Grants and policies -------------------------------------------------------------------

alter table public.adventure_invite_approvals enable row level security;
revoke all on table public.adventure_invite_approvals from public, anon, authenticated, service_role;
grant select on table public.adventure_invite_approvals to authenticated;

drop policy "Readers edit visible adventures" on public.adventures;
create policy "Writers edit their adventures"
  on public.adventures for update to authenticated
  using (id in (select private.writable_adventure_ids()))
  with check (id in (select private.writable_adventure_ids()));

drop policy "Readers see participants" on public.adventure_participants;
create policy "Readers see accepted participants; participants see the rest"
  on public.adventure_participants for select to authenticated
  using (
    (status = 'accepted' and adventure_id in (select private.visible_adventure_ids()))
    or adventure_id in (select private.participating_adventure_ids())
  );

create policy "Participants see approvals"
  on public.adventure_invite_approvals for select to authenticated
  using (
    exists (
      select 1
      from public.adventure_participants as p
      where p.id = participant_id
        and p.adventure_id in (select private.participating_adventure_ids())
    )
  );

commit;
