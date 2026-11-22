import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { localClient, localDatabaseQuery, sqlError } from './support/localSupabase.ts'
import {
  cleanup,
  createCampaign,
  invite,
  newPlayers,
  PASSWORD,
  RANDOM_ID,
  rpcError,
  rpcOk,
  type Player,
} from './support/localPlayers.ts'

// M03.6 adventure collaboration: invitations by consent, leaving, sharing with the party, the
// party audience, departure semantics, and the derived-state invariants, against the real
// local stack (Phase 1).

const ROLES = ['anon', 'authenticated', 'service_role', 'public']

function holders(sql: (role: string) => string) {
  return localDatabaseQuery(
    `select coalesce(string_agg(r, ',' order by r), '') from unnest(array['${ROLES.join("','")}']) r
     where ${sql('r')};`,
    {},
  )
}

function count(sql: string) {
  return Number(localDatabaseQuery(sql, {}))
}

// --- Catalog and privileges -------------------------------------------------------------------

test.describe('catalog and privileges', () => {
  test('RLS, grants, functions, policies, and triggers are exactly the planned set', () => {
    expect(
      localDatabaseQuery(
        `select relrowsecurity from pg_class where oid = 'public.adventure_invite_approvals'::regclass;`,
        {},
      ),
    ).toBe('t')

    for (const privilege of ['select', 'insert', 'update', 'delete', 'truncate', 'references']) {
      expect(
        holders(
          (r) => `has_table_privilege(${r}, 'public.adventure_invite_approvals', '${privilege}')`,
        ),
        `approvals ${privilege}`,
      ).toBe(privilege === 'select' ? 'authenticated' : '')
      expect(
        holders(
          (r) => `has_table_privilege(${r}, 'public.adventure_participants', '${privilege}')`,
        ),
        `participants ${privilege}`,
      ).toBe(privilege === 'select' ? 'authenticated' : '')
    }
    for (const table of ['adventure_invite_approvals', 'adventure_participants']) {
      for (const privilege of ['insert', 'update']) {
        expect(
          localDatabaseQuery(
            `select count(*) from pg_attribute
             where attrelid = 'public.${table}'::regclass and attnum > 0 and not attisdropped
               and has_column_privilege('authenticated', 'public.${table}', attname, '${privilege}');`,
            {},
          ),
          `${table} ${privilege} columns`,
        ).toBe('0')
      }
    }

    const executable = (signature: string) =>
      holders((r) => `has_function_privilege(${r}, '${signature}', 'execute')`)
    for (const signature of [
      'public.propose_adventure_participant(uuid, uuid)',
      'public.approve_adventure_participant(uuid)',
      'public.cancel_adventure_participant(uuid)',
      'public.respond_to_adventure_invitation(uuid, boolean, boolean)',
      'public.leave_adventure(uuid)',
      'public.set_adventure_share_consent(uuid, boolean)',
      'public.list_my_adventure_invitations(uuid)',
      'public.count_my_adventure_requests(uuid)',
      'private.current_party_campaign_ids()',
      'private.participating_adventure_ids()',
      'private.visible_adventure_ids()',
      'private.writable_adventure_ids()',
      'private.editable_adventure_ids()',
    ]) {
      expect(executable(signature), signature).toBe('authenticated')
    }
    for (const signature of [
      'private.reconcile_adventure(uuid)',
      'private.derived_adventure_visibility(uuid, boolean)',
      'private.guard_adventure_write()',
      'private.guard_adventure_participant_write()',
      'private.check_adventure_share_consent()',
      'private.after_adventure_participant_delete()',
      'private.after_adventure_archive_change()',
      'private.lock_adventure_campaign(uuid)',
      'private.lock_adventure_row(uuid)',
      'private.handle_campaign_member_departure(uuid, uuid)',
    ]) {
      expect(executable(signature), signature).toBe('')
    }

    const policies = (table: string) =>
      localDatabaseQuery(
        `select string_agg(policyname, ' | ' order by policyname) from pg_policies
         where schemaname = 'public' and tablename = '${table}';`,
        {},
      )
    expect(policies('adventures')).toBe(
      'Readers see visible adventures | Writers edit their adventures',
    )
    expect(policies('adventure_participants')).toBe(
      'Readers see accepted participants; participants see the rest',
    )
    expect(policies('adventure_invite_approvals')).toBe('Participants see approvals')

    // The old orphan trigger is gone; the new ones exist, and the consent triggers are deferred.
    expect(
      localDatabaseQuery(
        `select count(*) from pg_trigger where tgname = 'adventure_participants_delete_orphan';`,
        {},
      ),
    ).toBe('0')
    expect(
      localDatabaseQuery(
        `select string_agg(tgname, ',' order by tgname) from pg_trigger
         where tgrelid in ('public.adventures'::regclass, 'public.adventure_participants'::regclass)
           and tgdeferrable and tginitdeferred;`,
        {},
      ),
    ).toBe('adventure_participants_check_share_consent,adventures_check_share_consent')

    // D1 and the visibility check.
    expect(
      localDatabaseQuery(
        `select pg_get_indexdef('public.adventure_participants_one_live_per_player_idx'::regclass);`,
        {},
      ),
    ).toContain("status = ANY (ARRAY['proposed'::text, 'invited'::text, 'accepted'::text])")
    expect(
      localDatabaseQuery(
        `select pg_get_constraintdef(oid) from pg_constraint where conname = 'adventures_visibility_check';`,
        {},
      ),
    ).toContain("'party'")
  })
})

// --- Fixtures and helpers ---------------------------------------------------------------------

type Role = 'owner' | 'a' | 'b' | 'c' | 'd'

interface Scene {
  players: Record<Role, Player>
  campaignId: string
  /** One active character per player. a, b, and c are in the party; d and the owner are not. */
  chars: Record<Role, string>
  ids: string[]
}

async function character(player: Player, campaignId: string, name: string, inParty: boolean) {
  const { data, error } = await player.client.rpc('create_character', {
    p_campaign_id: campaignId,
    p_name: name,
    p_in_party: inParty,
  })
  expect(error?.message ?? null).toBeNull()
  return data as string
}

async function newScene(): Promise<Scene> {
  const { players } = await newPlayers(['owner', 'a', 'b', 'c', 'd'])
  const typed = players as Record<Role, Player>
  const campaignId = await createCampaign(typed.owner, 'M6 scene')
  for (const role of ['a', 'b', 'c', 'd'] as const)
    await invite(typed.owner, campaignId, typed[role])
  const chars = {
    owner: await character(typed.owner, campaignId, 'Overseer', false),
    a: await character(typed.a, campaignId, 'Ayla', true),
    b: await character(typed.b, campaignId, 'Bram', true),
    c: await character(typed.c, campaignId, 'Cass', true),
    d: await character(typed.d, campaignId, 'Dov', false),
  }
  return { players: typed, campaignId, chars, ids: [campaignId] }
}

interface Row {
  id: string
  character_id: string
  profile_id: string
  status: string
  share_consent: boolean
  invited_by: string | null
  responded_at: string | null
}

function rows(adventureId: string): Row[] {
  return JSON.parse(
    localDatabaseQuery(
      `select coalesce(json_agg(r order by created_at, id), '[]') from (
         select id, character_id, profile_id, status, share_consent, invited_by, responded_at, created_at
         from public.adventure_participants where adventure_id = '${adventureId}') r;`,
      {},
    ),
  )
}

function rowOf(adventureId: string, characterId: string) {
  return rows(adventureId).find((row) => row.character_id === characterId)
}

function statusOf(adventureId: string, characterId: string) {
  return rowOf(adventureId, characterId)?.status ?? 'none'
}

function visibilityOf(adventureId: string) {
  return localDatabaseQuery(
    `select coalesce((select visibility from public.adventures where id = '${adventureId}'), 'gone');`,
    {},
  )
}

function approvalsOn(participantId: string) {
  return count(
    `select count(*) from public.adventure_invite_approvals where participant_id = '${participantId}';`,
  )
}

async function create(
  player: Player,
  campaignId: string,
  type: string,
  title: string,
  char?: string,
) {
  const { data, error } = await player.client.rpc('create_adventure', {
    p_campaign_id: campaignId,
    p_type: type,
    p_title: title,
    p_character_id: char ?? null,
  })
  expect(error?.message ?? null).toBeNull()
  return data as string
}

const propose = (player: Player, adventureId: string, characterId: string) =>
  player.client.rpc('propose_adventure_participant', {
    p_adventure_id: adventureId,
    p_character_id: characterId,
  })
const approve = (player: Player, participantId: string) =>
  player.client.rpc('approve_adventure_participant', { p_participant_id: participantId })
const cancel = (player: Player, participantId: string) =>
  player.client.rpc('cancel_adventure_participant', { p_participant_id: participantId })
const respond = (player: Player, participantId: string, accept: boolean | null, keep?: boolean) =>
  player.client.rpc('respond_to_adventure_invitation', {
    p_participant_id: participantId,
    p_accept: accept as boolean,
    ...(keep === undefined ? {} : { p_keep_shared: keep }),
  })
const leave = (player: Player, adventureId: string) =>
  player.client.rpc('leave_adventure', { p_adventure_id: adventureId })
const consent = (player: Player, adventureId: string, value: boolean) =>
  player.client.rpc('set_adventure_share_consent', {
    p_adventure_id: adventureId,
    p_consent: value,
  })
const invitations = (player: Player, campaignId: string) =>
  player.client.rpc('list_my_adventure_invitations', { p_campaign_id: campaignId })
const requestCount = async (player: Player, campaignId: string) => {
  const { data, error } = await player.client.rpc('count_my_adventure_requests', {
    p_campaign_id: campaignId,
  })
  expect(error?.message ?? null).toBeNull()
  return data as number
}

async function expectFail(
  call: PromiseLike<{ error: { code: string; message: string } | null }>,
  message: string,
) {
  const error = await rpcError(call)
  expect(error.message).toBe(message)
  return error
}

/** Proposes `char` as `proposer`, has `approvers` approve, and returns the participant id. */
async function invitePlayer(
  adventureId: string,
  proposer: Player,
  char: string,
  approvers: Player[] = [],
) {
  const { data, error } = await propose(proposer, adventureId, char)
  expect(error?.message ?? null).toBeNull()
  for (const approver of approvers) await rpcOk(approve(approver, data as string))
  return data as string
}

/** A thread with `members` accepted (creator first), with no consent. */
async function thread(scene: Scene, members: Role[] = ['a', 'b'], title = 'The deal') {
  const [first, ...rest] = members
  const adventureId = await create(
    scene.players[first],
    scene.campaignId,
    'side',
    title,
    scene.chars[first],
  )
  const accepted: Role[] = [first]
  for (const role of rest) {
    const id = await invitePlayer(
      adventureId,
      scene.players[first],
      scene.chars[role],
      accepted.slice(1).map((r) => scene.players[r]),
    )
    await rpcOk(respond(scene.players[role], id, true))
    accepted.push(role)
  }
  return adventureId
}

/** Every participant consents, so the thread is shared with the party. */
async function share(scene: Scene, adventureId: string, members: Role[]) {
  for (const role of members) await rpcOk(consent(scene.players[role], adventureId, true))
  expect(visibilityOf(adventureId)).toBe('party')
}

async function readAdventure(player: Player, id: string) {
  const { data, error } = await player.client
    .from('adventures')
    .select('id, title, visibility, archived_at, description')
    .eq('id', id)
    .maybeSingle()
  expect(error).toBeNull()
  return data
}

async function readIds(player: Player, table: string, column: string, adventureId: string) {
  const { data, error } = await player.client.from(table).select(column).eq(column, adventureId)
  expect(error).toBeNull()
  return (data ?? []).length
}

async function participantRows(player: Player, adventureId: string) {
  const { data, error } = await player.client
    .from('adventure_participants')
    .select('id, character_id, status')
    .eq('adventure_id', adventureId)
  expect(error).toBeNull()
  return (data ?? []).map((row) => `${row.character_id}:${row.status}`).sort()
}

/** M6 §4.2 invariants plus the M5 ones, for one campaign. */
function assertInvariants(campaignId: string) {
  const zero = (label: string, sql: string) => expect(count(sql), label).toBe(0)
  zero(
    'party adventure with a non-consenting, missing, or archived state',
    `select count(*) from public.adventures a where a.campaign_id = '${campaignId}' and a.visibility = 'party'
     and (a.archived_at is not null
       or not exists (select 1 from public.adventure_participants p where p.adventure_id = a.id and p.status = 'accepted')
       or exists (select 1 from public.adventure_participants p where p.adventure_id = a.id and p.status = 'accepted' and not p.share_consent));`,
  )
  zero(
    'proposal approved by every accepted participant but not sent',
    `select count(*) from public.adventure_participants pr join public.adventures a on a.id = pr.adventure_id
     where pr.campaign_id = '${campaignId}' and pr.status = 'proposed' and a.archived_at is null
       and exists (select 1 from public.adventure_participants m where m.adventure_id = pr.adventure_id and m.status = 'accepted')
       and not exists (select 1 from public.adventure_participants m where m.adventure_id = pr.adventure_id and m.status = 'accepted'
         and not exists (select 1 from public.adventure_invite_approvals ap where ap.participant_id = pr.id and ap.approver_id = m.profile_id));`,
  )
  zero(
    'more than one live row per player',
    `select count(*) from (select 1 from public.adventure_participants where campaign_id = '${campaignId}'
       and status in ('proposed', 'invited', 'accepted') group by adventure_id, profile_id having count(*) > 1) s;`,
  )
  zero(
    'more than ten live rows',
    `select count(*) from (select 1 from public.adventure_participants where campaign_id = '${campaignId}'
       and status in ('proposed', 'invited', 'accepted') group by adventure_id having count(*) > 10) s;`,
  )
  zero(
    'consent on a row that is not accepted',
    `select count(*) from public.adventure_participants where campaign_id = '${campaignId}' and share_consent and status <> 'accepted';`,
  )
  zero(
    'accepted participant of a departed member sharing a thread',
    `select count(*) from public.adventure_participants p where p.campaign_id = '${campaignId}' and p.status = 'accepted'
       and not exists (select 1 from public.campaign_members m where m.campaign_id = p.campaign_id and m.profile_id = p.profile_id)
       and exists (select 1 from public.adventure_participants o where o.adventure_id = p.adventure_id and o.id <> p.id
         and (o.status in ('proposed', 'invited') or (o.status = 'accepted'
           and exists (select 1 from public.campaign_members m where m.campaign_id = o.campaign_id and m.profile_id = o.profile_id))));`,
  )
  zero(
    'personal or side adventure without an accepted participant',
    `select count(*) from public.adventures a where a.campaign_id = '${campaignId}' and a.type <> 'main'
     and not exists (select 1 from public.adventure_participants p where p.adventure_id = a.id and p.status = 'accepted');`,
  )
  zero(
    'participants on a main adventure',
    `select count(*) from public.adventure_participants p join public.adventures a on a.id = p.adventure_id
     where a.campaign_id = '${campaignId}' and a.type = 'main';`,
  )
}

// --- Proposals, approvals, and the invitee's view --------------------------------------------

test('proposals need every accepted participant to approve; the proposed player sees nothing', async () => {
  test.setTimeout(120_000)
  const scene = await newScene()
  const { a, b, c, d, owner } = scene.players
  try {
    const adventureId = await create(a, scene.campaignId, 'side', 'The heist', scene.chars.a)
    await rpcOk(
      a.client
        .from('adventure_objectives')
        .insert({ adventure_id: adventureId, title: 'Case the vault' }),
    )

    // A sole participant's proposal is sent at once.
    const toB = await invitePlayer(adventureId, a, scene.chars.b)
    expect(statusOf(adventureId, scene.chars.b)).toBe('invited')
    expect(rowOf(adventureId, scene.chars.b)?.invited_by).toBe(a.id)
    expect(approvalsOn(toB)).toBe(1)
    const toD = await invitePlayer(adventureId, a, scene.chars.d)
    expect(statusOf(adventureId, scene.chars.d)).toBe('invited')

    // D5: the invitee sees the title, type, inviter, and character, and nothing else.
    const { data: list, error } = await invitations(b, scene.campaignId)
    expect(error).toBeNull()
    expect(list).toHaveLength(1)
    expect(Object.keys(list![0]).sort()).toEqual([
      'adventure_id',
      'character_id',
      'invited_at',
      'invited_by',
      'participant_id',
      'shared_with_party',
      'title',
      'type',
    ])
    expect(list![0]).toMatchObject({
      participant_id: toB,
      adventure_id: adventureId,
      title: 'The heist',
      type: 'side',
      character_id: scene.chars.b,
      invited_by: a.id,
      shared_with_party: false,
    })
    expect(await readAdventure(b, adventureId)).toBeNull()
    for (const [table, column] of [
      ['adventure_participants', 'adventure_id'],
      ['adventure_objectives', 'adventure_id'],
      ['adventure_updates', 'adventure_id'],
    ])
      expect(await readIds(b, table, column, adventureId), table).toBe(0)
    const approvals = await b.client.from('adventure_invite_approvals').select('participant_id')
    expect(approvals.data).toEqual([])
    expect(await requestCount(b, scene.campaignId)).toBe(1)
    expect(await requestCount(a, scene.campaignId)).toBe(0)
    expect((await invitations(c, scene.campaignId)).data).toEqual([])
    expect(await requestCount(c, scene.campaignId)).toBe(0)

    // b accepts and now sees everything.
    await rpcOk(respond(b, toB, true))
    expect(statusOf(adventureId, scene.chars.b)).toBe('accepted')
    expect(rowOf(adventureId, scene.chars.b)?.responded_at).not.toBeNull()
    expect((await readAdventure(b, adventureId))?.title).toBe('The heist')
    expect(await readIds(b, 'adventure_objectives', 'adventure_id', adventureId)).toBe(1)
    expect(await requestCount(b, scene.campaignId)).toBe(0)

    // With two accepted participants, a's proposal waits for b. c sees nothing at all.
    const toC = await invitePlayer(adventureId, a, scene.chars.c)
    expect(statusOf(adventureId, scene.chars.c)).toBe('proposed')
    expect(approvalsOn(toC)).toBe(1)
    expect((await invitations(c, scene.campaignId)).data).toEqual([])
    expect(await requestCount(c, scene.campaignId)).toBe(0)
    expect(await participantRows(c, adventureId)).toEqual([])
    expect(await readAdventure(c, adventureId)).toBeNull()
    expect(await requestCount(b, scene.campaignId)).toBe(1) // the proposal awaiting b
    expect(await requestCount(a, scene.campaignId)).toBe(0)
    await expectFail(approve(a, toC), 'adventure_proposal_unavailable') // twice
    await expectFail(approve(c, toC), 'adventure_proposal_unavailable') // the proposed player
    await expectFail(approve(owner, toC), 'adventure_proposal_unavailable') // the campaign owner
    await expectFail(approve(d, toC), 'adventure_proposal_unavailable') // invited, not accepted

    // d accepts while the proposal is pending, so it now needs d's approval too.
    await rpcOk(respond(d, toD, true))
    await rpcOk(approve(b, toC))
    expect(statusOf(adventureId, scene.chars.c)).toBe('proposed')
    expect(approvalsOn(toC)).toBe(2)
    expect(await requestCount(d, scene.campaignId)).toBe(1)

    // d leaves: the remaining participants have all approved, so the invitation is sent.
    await rpcOk(leave(d, adventureId))
    expect(statusOf(adventureId, scene.chars.c)).toBe('invited')
    expect((await invitations(c, scene.campaignId)).data).toHaveLength(1)
    expect(await requestCount(c, scene.campaignId)).toBe(1)
    assertInvariants(scene.campaignId)
  } finally {
    await cleanup(scene.players, scene.ids)
  }
})

test('proposal errors', async () => {
  test.setTimeout(120_000)
  const scene = await newScene()
  const { a, b, c, d, owner } = scene.players
  const run = randomUUID().slice(0, 8)
  const fakes: string[] = []
  try {
    const adventureId = await thread(scene, ['a', 'b'])
    const main = await create(owner, scene.campaignId, 'main', 'The story')
    const elsewhere = await createCampaign(c, 'M6 elsewhere')
    scene.ids.push(elsewhere)
    const farHero = await character(c, elsewhere, 'Far', false)
    // A player has one active character per campaign: retire a's and b's, which keeps them in
    // the thread, and give each a new one. Inviting it is a second live participation (D1).
    for (const player of [a, b]) {
      const id = player === a ? scene.chars.a : scene.chars.b
      await rpcOk(
        player.client.rpc('set_character_status', { p_character_id: id, p_status: 'retired' }),
      )
    }
    const secondA = await character(a, scene.campaignId, 'Ayla II', true)
    const secondB = await character(b, scene.campaignId, 'Bram II', true)

    await expectFail(propose(owner, main, scene.chars.c), 'adventure_main_has_no_participants')
    await expectFail(propose(a, main, scene.chars.c), 'adventure_main_has_no_participants')
    await expectFail(propose(a, adventureId, secondA), 'adventure_player_already_participating')
    await expectFail(propose(a, adventureId, secondB), 'adventure_player_already_participating')
    await expectFail(propose(a, adventureId, farHero), 'adventure_character_unavailable')
    await expectFail(propose(a, adventureId, RANDOM_ID), 'adventure_character_unavailable')
    await expectFail(
      propose(a, adventureId, null as unknown as string),
      'adventure_character_unavailable',
    )
    await expectFail(propose(a, RANDOM_ID, scene.chars.c), 'adventure_unavailable')
    await expectFail(propose(a, null as unknown as string, scene.chars.c), 'adventure_unavailable')
    // Not a participant, and not even a member of the thread's campaign.
    await expectFail(propose(c, adventureId, scene.chars.d), 'adventure_unavailable')
    await expectFail(propose(owner, adventureId, scene.chars.d), 'adventure_unavailable')

    // A retired character cannot be invited; a proposed or invited player cannot be invited twice.
    await rpcOk(
      c.client.rpc('set_character_status', { p_character_id: scene.chars.c, p_status: 'retired' }),
    )
    await expectFail(propose(a, adventureId, scene.chars.c), 'adventure_character_unavailable')
    const toD = await invitePlayer(adventureId, a, scene.chars.d, [b])
    expect(statusOf(adventureId, scene.chars.d)).toBe('invited')
    await expectFail(
      propose(a, adventureId, scene.chars.d),
      'adventure_player_already_participating',
    )
    await rpcOk(cancel(a, toD))

    // A departed member's character cannot be invited.
    await rpcOk(d.client.rpc('leave_campaign', { p_campaign_id: scene.campaignId }))
    await expectFail(propose(a, adventureId, scene.chars.d), 'adventure_character_unavailable')

    // An archived adventure takes no proposals.
    await rpcOk(
      a.client
        .from('adventures')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', adventureId),
    )
    await expectFail(propose(a, adventureId, scene.chars.owner), 'adventure_archived')
    await rpcOk(a.client.from('adventures').update({ archived_at: null }).eq('id', adventureId))

    // D12: ten live participations per adventure, even when five proposals race at nine.
    const seeded = Array.from({ length: 12 }, () => ({
      user: randomUUID(),
      character: randomUUID(),
    }))
    fakes.push(...seeded.map((s) => s.user))
    localDatabaseQuery(
      `begin;
       insert into auth.users (id, aud, role, email) values ${seeded.map((s, i) => `('${s.user}', 'authenticated', 'authenticated', 'm6-${run}-${i}@example.test')`).join(', ')};
       insert into public.campaign_members (campaign_id, profile_id, role) values ${seeded.map((s) => `('${scene.campaignId}', '${s.user}', 'member')`).join(', ')};
       insert into public.characters (id, campaign_id, owner_id, name) values ${seeded.map((s, i) => `('${s.character}', '${scene.campaignId}', '${s.user}', 'Seed ${i}')`).join(', ')};
       insert into public.adventure_participants (adventure_id, campaign_id, character_id, profile_id, status, invited_by)
         values ${seeded
           .slice(0, 7)
           .map(
             (s) =>
               `('${adventureId}', '${scene.campaignId}', '${s.character}', '${s.user}', 'proposed', '${a.id}')`,
           )
           .join(', ')};
       commit;`,
      {},
    )
    // a and b are accepted, plus seven pending: nine live rows. Five proposals race for one place.
    expect(
      count(
        `select count(*) from public.adventure_participants where adventure_id = '${adventureId}' and status in ('proposed', 'invited', 'accepted');`,
      ),
    ).toBe(9)
    const racers = seeded.slice(7)
    const outcomes = await Promise.all(racers.map((s) => propose(a, adventureId, s.character)))
    const winners = outcomes.filter((outcome) => outcome.error === null)
    expect(winners).toHaveLength(1)
    for (const outcome of outcomes.filter((o) => o.error !== null))
      expect(outcome.error?.message).toBe('adventure_participant_limit_reached')
    expect(
      count(
        `select count(*) from public.adventure_participants where adventure_id = '${adventureId}' and status in ('proposed', 'invited', 'accepted');`,
      ),
    ).toBe(10)
    await expectFail(
      propose(a, adventureId, racers[outcomes.findIndex((o) => o.error !== null)].character),
      'adventure_participant_limit_reached',
    )
    assertInvariants(scene.campaignId)
  } finally {
    await cleanup(scene.players, scene.ids)
    if (fakes.length)
      localDatabaseQuery(
        `delete from auth.users where id in (${fakes.map((id) => `'${id}'`).join(', ')});`,
        {},
      )
  }
})

test('answering invitations: accept, decline, someone else’s, and a new round after a decline', async () => {
  test.setTimeout(120_000)
  const scene = await newScene()
  const { a, b, c } = scene.players
  try {
    const adventureId = await create(
      a,
      scene.campaignId,
      'personal',
      'Find my sister',
      scene.chars.a,
    )
    const toB = await invitePlayer(adventureId, a, scene.chars.b)

    await expectFail(respond(c, toB, true), 'adventure_invitation_unavailable')
    await expectFail(respond(a, toB, true), 'adventure_invitation_unavailable')
    await expectFail(respond(b, RANDOM_ID, true), 'adventure_invitation_unavailable')
    const missing = await rpcError(respond(b, toB, null))
    expect(missing.code).toBe('22023')
    expect(missing.message).toBe('adventure_response_required')
    expect(statusOf(adventureId, scene.chars.b)).toBe('invited')

    // Decline: participants see "declined"; the invitee sees nothing and cannot answer again.
    await rpcOk(respond(b, toB, false))
    expect(statusOf(adventureId, scene.chars.b)).toBe('declined')
    expect(await participantRows(a, adventureId)).toContain(`${scene.chars.b}:declined`)
    expect((await invitations(b, scene.campaignId)).data).toEqual([])
    expect(await readAdventure(b, adventureId)).toBeNull()
    expect(await requestCount(b, scene.campaignId)).toBe(0)
    await expectFail(respond(b, toB, true), 'adventure_invitation_unavailable')
    await expectFail(cancel(a, toB), 'adventure_proposal_unavailable')

    // A new round: the same row is proposed again, with fresh approvals.
    expect(approvalsOn(toB)).toBe(1)
    const again = await invitePlayer(adventureId, a, scene.chars.b)
    expect(again).toBe(toB)
    expect(statusOf(adventureId, scene.chars.b)).toBe('invited')
    expect(rowOf(adventureId, scene.chars.b)?.responded_at).toBeNull()
    expect(approvalsOn(toB)).toBe(1)
    await rpcOk(respond(b, toB, true))
    expect((await readAdventure(b, adventureId))?.title).toBe('Find my sister')
    expect(rowOf(adventureId, scene.chars.b)?.share_consent).toBe(false)

    // Accepted rows cannot be answered, cancelled, or approved.
    await expectFail(respond(b, toB, false), 'adventure_invitation_unavailable')
    await expectFail(cancel(a, toB), 'adventure_proposal_unavailable')
    await expectFail(approve(a, toB), 'adventure_proposal_unavailable')
    assertInvariants(scene.campaignId)
  } finally {
    await cleanup(scene.players, scene.ids)
  }
})

test('rejecting and withdrawing delete the row and leave no trace for the invitee', async () => {
  test.setTimeout(120_000)
  const scene = await newScene()
  const { a, b, c, d } = scene.players
  try {
    const adventureId = await thread(scene, ['a', 'b'])

    // Reject a proposal waiting for b: it was never visible to c.
    const proposal = await invitePlayer(adventureId, a, scene.chars.c)
    expect(statusOf(adventureId, scene.chars.c)).toBe('proposed')
    await rpcOk(cancel(b, proposal))
    expect(statusOf(adventureId, scene.chars.c)).toBe('none')
    expect(approvalsOn(proposal)).toBe(0)
    expect(await requestCount(b, scene.campaignId)).toBe(0)

    // Withdraw a sent invitation: it disappears from the invitee's list and cannot be answered.
    const sent = await invitePlayer(adventureId, a, scene.chars.d, [b])
    expect((await invitations(d, scene.campaignId)).data).toHaveLength(1)
    await expectFail(cancel(c, sent), 'adventure_proposal_unavailable') // not a participant
    await rpcOk(cancel(b, sent)) // not the proposer, but an accepted participant
    expect((await invitations(d, scene.campaignId)).data).toEqual([])
    expect(await requestCount(d, scene.campaignId)).toBe(0)
    await expectFail(respond(d, sent, true), 'adventure_invitation_unavailable')
    await expectFail(cancel(a, sent), 'adventure_proposal_unavailable')
    expect(statusOf(adventureId, scene.chars.d)).toBe('none')
    assertInvariants(scene.campaignId)
  } finally {
    await cleanup(scene.players, scene.ids)
  }
})

test('leaving: access ends at once, approvals and consent go, and the last one cannot leave', async () => {
  test.setTimeout(120_000)
  const scene = await newScene()
  const { a, b, c, owner } = scene.players
  try {
    const adventureId = await thread(scene, ['a', 'b'])
    // b proposes d: b's approval is recorded, and a still has to approve.
    const proposal = await invitePlayer(adventureId, b, scene.chars.d)
    expect(statusOf(adventureId, scene.chars.d)).toBe('proposed')
    await rpcOk(consent(b, adventureId, true))
    expect(rowOf(adventureId, scene.chars.b)?.share_consent).toBe(true)

    await expectFail(leave(c, adventureId), 'adventure_unavailable')
    await expectFail(leave(a, RANDOM_ID), 'adventure_unavailable')
    const main = await create(owner, scene.campaignId, 'main', 'Story')
    await expectFail(leave(a, main), 'adventure_unavailable')

    await rpcOk(leave(b, adventureId))
    expect(statusOf(adventureId, scene.chars.b)).toBe('left')
    expect(rowOf(adventureId, scene.chars.b)?.share_consent).toBe(false)
    expect(approvalsOn(proposal)).toBe(0)
    expect(statusOf(adventureId, scene.chars.d)).toBe('proposed')
    expect(await readAdventure(b, adventureId)).toBeNull()
    expect(await participantRows(b, adventureId)).toEqual([])
    expect(await participantRows(a, adventureId)).toContain(`${scene.chars.b}:left`)
    await expectFail(leave(b, adventureId), 'adventure_unavailable')

    // a is the last accepted participant.
    await expectFail(leave(a, adventureId), 'adventure_last_participant')
    expect(statusOf(adventureId, scene.chars.a)).toBe('accepted')

    // Coming back needs a new invitation.
    await rpcOk(approve(a, proposal))
    expect(statusOf(adventureId, scene.chars.d)).toBe('invited')
    const back = await invitePlayer(adventureId, a, scene.chars.b)
    expect(back).toBe(rowOf(adventureId, scene.chars.b)?.id)
    expect(statusOf(adventureId, scene.chars.b)).toBe('invited')
    await rpcOk(respond(b, back, true))
    expect((await readAdventure(b, adventureId))?.title).toBe('The deal')
    assertInvariants(scene.campaignId)
  } finally {
    await cleanup(scene.players, scene.ids)
  }
})

// --- Sharing with the party -------------------------------------------------------------------

test('sharing needs every consent, ends on any withdrawal, and reaches only the party, read-only', async () => {
  test.setTimeout(150_000)
  const scene = await newScene()
  const { a, b, c, d, owner } = scene.players
  try {
    const adventureId = await thread(scene, ['a', 'b'])
    await rpcOk(
      a.client
        .from('adventure_objectives')
        .insert({ adventure_id: adventureId, title: 'Find the key' }),
    )
    await rpcOk(
      a.client
        .from('adventure_updates')
        .insert({ adventure_id: adventureId, body: 'We met at dusk' }),
    )

    // One consent is a request, not a share.
    await rpcOk(consent(a, adventureId, true))
    expect(visibilityOf(adventureId)).toBe('participants')
    expect(await requestCount(b, scene.campaignId)).toBe(1)
    expect(await requestCount(a, scene.campaignId)).toBe(0)
    expect(await readAdventure(c, adventureId)).toBeNull()

    // Not now clears every consent, so the next request starts from nothing.
    await rpcOk(consent(b, adventureId, false))
    expect(rows(adventureId).some((row) => row.share_consent)).toBe(false)
    expect(await requestCount(b, scene.campaignId)).toBe(0)

    await rpcOk(consent(a, adventureId, true))
    await rpcOk(consent(b, adventureId, true))
    expect(visibilityOf(adventureId)).toBe('party')

    // The party reads it: details, accepted participants, objectives, and updates. Nothing pending.
    await invitePlayer(adventureId, a, scene.chars.d, [b])
    expect((await readAdventure(c, adventureId))?.title).toBe('The deal')
    expect(await participantRows(c, adventureId)).toEqual(
      [`${scene.chars.a}:accepted`, `${scene.chars.b}:accepted`].sort(),
    )
    expect(await readIds(c, 'adventure_objectives', 'adventure_id', adventureId)).toBe(1)
    expect(await readIds(c, 'adventure_updates', 'adventure_id', adventureId)).toBe(1)
    expect(
      (await c.client.from('adventure_invite_approvals').select('participant_id')).data,
    ).toEqual([])
    expect((await invitations(c, scene.campaignId)).data).toEqual([])
    expect(await requestCount(c, scene.campaignId)).toBe(0)

    // Members outside the party, and the campaign owner without a party character, see nothing.
    expect(await readAdventure(owner, adventureId)).toBeNull()
    expect(await participantRows(owner, adventureId)).toEqual([])
    // d is invited, not in the party: nothing but the invitation.
    expect(await readAdventure(d, adventureId)).toBeNull()
    expect((await invitations(d, scene.campaignId)).data?.[0]).toMatchObject({
      shared_with_party: true,
    })

    // The party cannot write anything.
    const edit = await c.client
      .from('adventures')
      .update({ title: 'Mine now' })
      .eq('id', adventureId)
      .select('id')
    expect(edit.data).toEqual([])
    const status = await c.client
      .from('adventures')
      .update({ status: 'completed' })
      .eq('id', adventureId)
      .select('id')
    expect(status.data).toEqual([])
    const archive = await c.client
      .from('adventures')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', adventureId)
      .select('id')
    expect(archive.data).toEqual([])
    expect(
      (
        await c.client
          .from('adventure_objectives')
          .insert({ adventure_id: adventureId, title: 'Sneaky' })
      ).error?.code,
    ).toBe('42501')
    expect(
      (
        await c.client
          .from('adventure_updates')
          .insert({ adventure_id: adventureId, body: 'Sneaky' })
      ).error?.code,
    ).toBe('42501')
    const tick = await c.client
      .from('adventure_objectives')
      .update({ done: true })
      .eq('adventure_id', adventureId)
      .select('id')
    expect(tick.data).toEqual([])
    const remove = await c.client
      .from('adventure_objectives')
      .delete()
      .eq('adventure_id', adventureId)
      .select('id')
    expect(remove.data).toEqual([])
    await expectFail(consent(c, adventureId, true), 'adventure_unavailable')
    await expectFail(leave(c, adventureId), 'adventure_unavailable')
    await expectFail(propose(c, adventureId, scene.chars.owner), 'adventure_unavailable')
    expect((await readAdventure(a, adventureId))?.title).toBe('The deal')

    // A new participant who does not keep it shared makes it private for everyone (D6).
    const invitation = (await invitations(d, scene.campaignId)).data![0]
    await rpcOk(respond(d, invitation.participant_id, true, false))
    expect(visibilityOf(adventureId)).toBe('participants')
    expect(rows(adventureId).some((row) => row.share_consent)).toBe(false)
    expect(await readAdventure(c, adventureId)).toBeNull()
    expect((await readAdventure(d, adventureId))?.title).toBe('The deal')

    // Sharing again, then a new participant who keeps it shared leaves it shared.
    await share(scene, adventureId, ['a', 'b', 'd'])
    const forOwner = await invitePlayer(adventureId, a, scene.chars.owner, [b, d])
    await rpcOk(respond(owner, forOwner, true, true))
    expect(visibilityOf(adventureId)).toBe('party')
    expect(rowOf(adventureId, scene.chars.owner)?.share_consent).toBe(true)
    expect((await readAdventure(c, adventureId))?.title).toBe('The deal')
    await rpcOk(consent(a, adventureId, false))
    expect(visibilityOf(adventureId)).toBe('participants')

    // Stop sharing by anyone clears every consent.
    await share(scene, adventureId, ['a', 'b', 'd', 'owner'])
    await rpcOk(consent(d, adventureId, false))
    expect(visibilityOf(adventureId)).toBe('participants')
    expect(rows(adventureId).some((row) => row.share_consent)).toBe(false)

    // A participant leaving can complete a share request: the rest have all consented.
    await rpcOk(consent(a, adventureId, true))
    await rpcOk(consent(b, adventureId, true))
    await rpcOk(consent(owner, adventureId, true))
    expect(visibilityOf(adventureId)).toBe('participants')
    await rpcOk(leave(d, adventureId))
    expect(visibilityOf(adventureId)).toBe('party')

    // The audience follows the viewer's character: out of the party, retired, or gone.
    expect((await readAdventure(c, adventureId))?.title).toBe('The deal')
    await rpcOk(
      c.client.rpc('set_character_in_party', { p_character_id: scene.chars.c, p_in_party: false }),
    )
    expect(await readAdventure(c, adventureId)).toBeNull()
    await rpcOk(
      c.client.rpc('set_character_in_party', { p_character_id: scene.chars.c, p_in_party: true }),
    )
    expect((await readAdventure(c, adventureId))?.title).toBe('The deal')
    await rpcOk(
      c.client.rpc('set_character_status', { p_character_id: scene.chars.c, p_status: 'retired' }),
    )
    expect(await readAdventure(c, adventureId)).toBeNull()
    expect(visibilityOf(adventureId)).toBe('party')

    // A sole participant shares at once.
    const solo = await create(d, scene.campaignId, 'personal', 'Solo', scene.chars.d)
    await rpcOk(consent(d, solo, true))
    expect(visibilityOf(solo)).toBe('party')
    expect((await readAdventure(a, solo))?.title).toBe('Solo')
    assertInvariants(scene.campaignId)
  } finally {
    await cleanup(scene.players, scene.ids)
  }
})

test('consent errors and main adventures take no sharing', async () => {
  test.setTimeout(90_000)
  const scene = await newScene()
  const { a, b, owner } = scene.players
  try {
    const adventureId = await thread(scene, ['a', 'b'])
    const main = await create(owner, scene.campaignId, 'main', 'Story')

    await expectFail(consent(a, main, true), 'adventure_main_has_no_participants')
    await expectFail(consent(owner, main, true), 'adventure_main_has_no_participants')
    await expectFail(consent(scene.players.c, adventureId, true), 'adventure_unavailable')
    await expectFail(consent(a, RANDOM_ID, true), 'adventure_unavailable')
    await expectFail(consent(a, null as unknown as string, true), 'adventure_unavailable')
    const missing = await rpcError(consent(a, adventureId, null as unknown as boolean))
    expect(missing.code).toBe('22023')
    expect(visibilityOf(main)).toBe('campaign')

    // Archived: no consent.
    await rpcOk(
      a.client
        .from('adventures')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', adventureId),
    )
    await expectFail(consent(b, adventureId, true), 'adventure_archived')
    assertInvariants(scene.campaignId)
  } finally {
    await cleanup(scene.players, scene.ids)
  }
})

// --- Archiving with collaborators (D10) -------------------------------------------------------

test('archiving: collaborators keep reading it, the share ends, and invitations freeze', async () => {
  test.setTimeout(150_000)
  const scene = await newScene()
  const { a, b, c, d } = scene.players
  try {
    const adventureId = await thread(scene, ['a', 'b'])
    await rpcOk(
      a.client
        .from('adventure_objectives')
        .insert({ adventure_id: adventureId, title: 'Find the key' }),
    )
    await share(scene, adventureId, ['a', 'b'])
    expect((await readAdventure(c, adventureId))?.title).toBe('The deal')
    const sent = await invitePlayer(adventureId, a, scene.chars.d, [b])

    // b is not the creator while the creator participates: no archive, no restore.
    const refused = await b.client
      .from('adventures')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', adventureId)
      .select('id')
    expect(refused.error?.code).toBe('42501')
    expect(refused.error?.message).toBe('adventure_archive_creator_only')
    // The party cannot archive at all.
    const party = await c.client
      .from('adventures')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', adventureId)
      .select('id')
    expect(party.data).toEqual([])

    // The creator archives: the share ends, consent is cleared, and the party loses it.
    await rpcOk(
      a.client
        .from('adventures')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', adventureId),
    )
    expect(visibilityOf(adventureId)).toBe('participants')
    expect(rows(adventureId).some((row) => row.share_consent)).toBe(false)
    expect(await readAdventure(c, adventureId)).toBeNull()

    // b still reads it, but only reads it.
    const archived = await readAdventure(b, adventureId)
    expect(archived?.title).toBe('The deal')
    expect(archived?.archived_at).not.toBeNull()
    expect(await readIds(b, 'adventure_objectives', 'adventure_id', adventureId)).toBe(1)
    const edit = await b.client.from('adventures').update({ title: 'Edited' }).eq('id', adventureId)
    expect(edit.error?.message).toBe('adventure_archived')
    expect(
      (
        await b.client
          .from('adventure_objectives')
          .insert({ adventure_id: adventureId, title: 'More' })
      ).error?.code,
    ).toBe('42501')
    expect(
      (await b.client.from('adventure_updates').insert({ adventure_id: adventureId, body: 'More' }))
        .error?.code,
    ).toBe('42501')
    const restoreByB = await b.client
      .from('adventures')
      .update({ archived_at: null })
      .eq('id', adventureId)
    expect(restoreByB.error?.message).toBe('adventure_archive_creator_only')
    await expectFail(consent(b, adventureId, true), 'adventure_archived')
    await expectFail(propose(b, adventureId, scene.chars.c), 'adventure_archived')

    // Invitations are frozen: hidden from the invitee, unanswerable, and not cancellable.
    expect((await invitations(d, scene.campaignId)).data).toEqual([])
    expect(await requestCount(d, scene.campaignId)).toBe(0)
    await expectFail(respond(d, sent, true), 'adventure_invitation_unavailable')
    await expectFail(cancel(a, sent), 'adventure_proposal_unavailable')
    expect(statusOf(adventureId, scene.chars.d)).toBe('invited')

    // Restoring brings the invitation back and never republishes the thread.
    await rpcOk(a.client.from('adventures').update({ archived_at: null }).eq('id', adventureId))
    expect(visibilityOf(adventureId)).toBe('participants')
    expect(rows(adventureId).some((row) => row.share_consent)).toBe(false)
    expect((await invitations(d, scene.campaignId)).data).toHaveLength(1)
    expect(await readAdventure(c, adventureId)).toBeNull()

    // Once the creator has left, any accepted participant archives and restores.
    await rpcOk(leave(a, adventureId))
    await rpcOk(
      b.client
        .from('adventures')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', adventureId),
    )
    expect(
      (
        await a.client
          .from('adventures')
          .update({ archived_at: null })
          .eq('id', adventureId)
          .select('id')
      ).data,
    ).toEqual([])
    await rpcOk(b.client.from('adventures').update({ archived_at: null }).eq('id', adventureId))
    const afterRestore = await readAdventure(b, adventureId)
    expect(afterRestore?.archived_at).toBeNull()
    assertInvariants(scene.campaignId)
  } finally {
    await cleanup(scene.players, scene.ids)
  }
})

test('a pending share request does not survive archiving', async () => {
  test.setTimeout(90_000)
  const scene = await newScene()
  const { a, b } = scene.players
  try {
    const adventureId = await thread(scene, ['a', 'b'])
    await rpcOk(consent(a, adventureId, true))
    await rpcOk(
      a.client
        .from('adventures')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', adventureId),
    )
    expect(rows(adventureId).some((row) => row.share_consent)).toBe(false)
    await rpcOk(a.client.from('adventures').update({ archived_at: null }).eq('id', adventureId))
    // b's consent alone does not share it, because a's was cleared by archiving.
    await rpcOk(consent(b, adventureId, true))
    expect(visibilityOf(adventureId)).toBe('participants')
    assertInvariants(scene.campaignId)
  } finally {
    await cleanup(scene.players, scene.ids)
  }
})

// --- Bypass attempts --------------------------------------------------------------------------

test('writes and reads outside the RPCs are refused', async () => {
  test.setTimeout(120_000)
  const scene = await newScene()
  const { a, b, c } = scene.players
  try {
    const adventureId = await thread(scene, ['a', 'b'])
    const toC = await invitePlayer(adventureId, a, scene.chars.c, [b])
    const rowId = rowOf(adventureId, scene.chars.b)!.id

    for (const player of [a, b, c]) {
      const insert = await player.client.from('adventure_participants').insert({
        adventure_id: adventureId,
        campaign_id: scene.campaignId,
        character_id: scene.chars[player === a ? 'a' : player === b ? 'b' : 'c'],
        profile_id: player.id,
        status: 'accepted',
      })
      expect(insert.error?.code).toBe('42501')
    }
    for (const change of [
      { status: 'accepted' },
      { share_consent: true },
      { invited_by: c.id },
      { character_id: scene.chars.c },
    ] as Record<string, unknown>[]) {
      const update = await b.client.from('adventure_participants').update(change).eq('id', rowId)
      expect(update.error?.code, JSON.stringify(change)).toBe('42501')
      const forged = await c.client.from('adventure_participants').update(change).eq('id', toC)
      expect(forged.error?.code, JSON.stringify(change)).toBe('42501')
    }
    expect(
      (await b.client.from('adventure_participants').delete().eq('id', rowId)).error?.code,
    ).toBe('42501')
    expect((await c.client.from('adventure_participants').delete().eq('id', toC)).error?.code).toBe(
      '42501',
    )
    expect(
      (
        await a.client
          .from('adventure_invite_approvals')
          .insert({ participant_id: toC, approver_id: b.id })
      ).error?.code,
    ).toBe('42501')
    expect(
      (await a.client.from('adventure_invite_approvals').delete().eq('participant_id', toC)).error
        ?.code,
    ).toBe('42501')
    expect(
      (
        await a.client
          .from('adventure_invite_approvals')
          .update({ approver_id: c.id })
          .eq('participant_id', toC)
      ).error?.code,
    ).toBe('42501')

    // visibility is not writable, nor is the creator, nor the timestamps.
    for (const change of [
      { visibility: 'party' },
      { visibility: 'campaign' },
      { created_by: b.id },
      { updated_by: b.id },
      { campaign_id: RANDOM_ID },
    ] as Record<string, unknown>[]) {
      const update = await a.client.from('adventures').update(change).eq('id', adventureId)
      expect(update.error?.code, JSON.stringify(change)).toBe('42501')
    }
    expect((await a.client.from('adventures').delete().eq('id', adventureId)).error?.code).toBe(
      '42501',
    )

    // Internal functions are not exposed, and anonymous callers cannot use the public ones.
    for (const name of [
      'reconcile_adventure',
      'derived_adventure_visibility',
      'lock_adventure_row',
    ]) {
      const { error } = await a.client.rpc(name, { p_adventure_id: adventureId })
      expect(error, name).not.toBeNull()
    }
    const anonymous = localClient()
    for (const [name, args] of [
      [
        'propose_adventure_participant',
        { p_adventure_id: adventureId, p_character_id: scene.chars.c },
      ],
      ['approve_adventure_participant', { p_participant_id: toC }],
      ['cancel_adventure_participant', { p_participant_id: toC }],
      ['respond_to_adventure_invitation', { p_participant_id: toC, p_accept: true }],
      ['leave_adventure', { p_adventure_id: adventureId }],
      ['set_adventure_share_consent', { p_adventure_id: adventureId, p_consent: true }],
      ['list_my_adventure_invitations', { p_campaign_id: scene.campaignId }],
      ['count_my_adventure_requests', { p_campaign_id: scene.campaignId }],
    ] as [string, Record<string, unknown>][]) {
      const { error } = await anonymous.rpc(name, args)
      expect(error?.code, name).toBe('42501')
    }

    // Nothing above changed anything.
    expect(
      rows(adventureId)
        .map((row) => row.status)
        .sort(),
    ).toEqual(['accepted', 'accepted', 'invited'])
    expect(visibilityOf(adventureId)).toBe('participants')
    expect(await requestCount(scene.players.owner, scene.campaignId)).toBe(0)
    assertInvariants(scene.campaignId)
  } finally {
    await cleanup(scene.players, scene.ids)
  }
})

// --- Database integrity (as postgres, rolled back) --------------------------------------------

const A1 = "'00000000-0000-4000-8000-0000000006a1'"
const B2 = "'00000000-0000-4000-8000-0000000006b2'"
const C3 = "'00000000-0000-4000-8000-0000000006c3'"
const K1 = "'00000000-0000-4000-8000-0000000006d1'"
const E1 = "'00000000-0000-4000-8000-0000000006e1'"
const E2 = "'00000000-0000-4000-8000-0000000006e2'"
const E3 = "'00000000-0000-4000-8000-0000000006e3'"
const E4 = "'00000000-0000-4000-8000-0000000006e4'"
const P1 = "'00000000-0000-4000-8000-0000000006f1'"

// Campaign k1 owned by a1 with members b2 and c3. Characters: e1 (b2), e2 (c3), e3 (a1), e4 (b2).
// p1 is a personal adventure of b2's e1 (created by b2), with one accepted participant.
const fixture = `
begin;
insert into auth.users (id, aud, role, email)
  values (${A1}, 'authenticated', 'authenticated', 'm6-owner@example.test'),
         (${B2}, 'authenticated', 'authenticated', 'm6-b@example.test'),
         (${C3}, 'authenticated', 'authenticated', 'm6-c@example.test');
insert into public.campaigns (id, name, owner_id) values (${K1}, 'M6 fixture', ${A1});
insert into public.campaign_members (campaign_id, profile_id, role)
  values (${K1}, ${B2}, 'member'), (${K1}, ${C3}, 'member');
-- A player has one active character per campaign, so e4 (b2's second character) is retired.
insert into public.characters (id, campaign_id, owner_id, name, in_party, status)
  values (${E1}, ${K1}, ${B2}, 'Bee', true, 'active'), (${E2}, ${K1}, ${C3}, 'Cee', true, 'active'),
         (${E3}, ${K1}, ${A1}, 'Owner hero', false, 'active'), (${E4}, ${K1}, ${B2}, 'Bee II', false, 'retired');
insert into public.character_sheets (character_id) values (${E1}), (${E2}), (${E3}), (${E4});
insert into public.adventures (id, campaign_id, created_by, type, visibility, title)
  values (${P1}, ${K1}, ${B2}, 'personal', 'participants', 'Solo');
insert into public.adventure_participants (adventure_id, campaign_id, character_id, profile_id)
  values (${P1}, ${K1}, ${E1}, ${B2});
`

const asUser = (id: string) =>
  `select set_config('request.jwt.claims', '{"sub":${id.replace(/'/g, '"')},"role":"authenticated"}', true);`

/** Adds c3's character to p1 as accepted through the allowed transitions. */
const joinC = `
insert into public.adventure_participants (adventure_id, campaign_id, character_id, profile_id, status)
  values (${P1}, ${K1}, ${E2}, ${C3}, 'proposed');
update public.adventure_participants set status = 'invited' where character_id = ${E2};
update public.adventure_participants set status = 'accepted' where character_id = ${E2};
`

function resultLine(output: string) {
  return output.split('\n').find((line) => line.startsWith('result|'))
}

test.describe('database integrity (as postgres, rolled back)', () => {
  test('participant transitions, inserts, keys, and consent are guarded', () => {
    const attempt = (sql: string) => sqlError(`${fixture}\n${sql}\nrollback;`)
    const status = (to: string, from = 'accepted') =>
      `update public.adventure_participants set status = '${to}' where adventure_id = ${P1} and status = '${from}';`

    // Only the planned transitions: proposed->invited, invited->accepted|declined,
    // accepted->left, declined->proposed, left->proposed.
    for (const to of ['proposed', 'invited', 'declined']) {
      expect(attempt(status(to)), `accepted -> ${to}`).toContain(
        'adventure_participant_transition_forbidden',
      )
    }
    expect(
      attempt(
        `${joinC}${status('proposed', 'accepted').replace(`adventure_id = ${P1}`, `character_id = ${E2}`)}`,
      ),
    ).toContain('adventure_participant_transition_forbidden')
    const row = (sql: string) => `${joinC}${sql}`
    expect(
      attempt(`${row(`update public.adventure_participants set status = 'left' where character_id = ${E2};`)}
update public.adventure_participants set status = 'accepted' where character_id = ${E2};`),
    ).toContain('adventure_participant_transition_forbidden')
    const proposedC = `insert into public.adventure_participants (adventure_id, campaign_id, character_id, profile_id, status)
  values (${P1}, ${K1}, ${E2}, ${C3}, 'proposed');`
    expect(
      attempt(
        `${proposedC}\nupdate public.adventure_participants set status = 'accepted' where character_id = ${E2};`,
      ),
    ).toContain('adventure_participant_transition_forbidden')
    expect(
      attempt(
        `${proposedC}\nupdate public.adventure_participants set status = 'declined' where character_id = ${E2};`,
      ),
    ).toContain('adventure_participant_transition_forbidden')
    expect(
      attempt(`${proposedC}\nupdate public.adventure_participants set status = 'invited' where character_id = ${E2};
update public.adventure_participants set status = 'declined' where character_id = ${E2};
update public.adventure_participants set status = 'accepted' where character_id = ${E2};`),
    ).toContain('adventure_participant_transition_forbidden')
    // The allowed round trip.
    expect(
      attempt(`${proposedC}\nupdate public.adventure_participants set status = 'invited' where character_id = ${E2};
update public.adventure_participants set status = 'declined' where character_id = ${E2};
update public.adventure_participants set status = 'proposed' where character_id = ${E2};
update public.adventure_participants set status = 'invited' where character_id = ${E2};
update public.adventure_participants set status = 'accepted' where character_id = ${E2};
update public.adventure_participants set status = 'left' where character_id = ${E2};
update public.adventure_participants set status = 'proposed' where character_id = ${E2};`),
    ).toBe('')

    // Inserts: proposed, or the first accepted row of an adventure; nothing else.
    const insertAs = (to: string, character = E2, profile = C3) =>
      `insert into public.adventure_participants (adventure_id, campaign_id, character_id, profile_id, status)
         values (${P1}, ${K1}, ${character}, ${profile}, '${to}');`
    for (const to of ['accepted', 'invited', 'declined', 'left']) {
      expect(attempt(insertAs(to)), `insert ${to}`).toContain(
        'adventure_participant_transition_forbidden',
      )
    }
    expect(attempt(insertAs('proposed'))).toBe('')

    // D1: one live row per player. A second character of b2 is refused while e1 is live.
    expect(attempt(insertAs('proposed', E4, B2))).toContain(
      'adventure_participants_one_live_per_player_idx',
    )

    // Keys never change.
    for (const change of [
      `character_id = ${E4}`,
      `profile_id = ${C3}`,
      `adventure_id = gen_random_uuid()`,
      `campaign_id = gen_random_uuid()`,
      `created_at = created_at - interval '1 day'`,
      `id = gen_random_uuid()`,
    ]) {
      expect(
        attempt(`update public.adventure_participants set ${change} where adventure_id = ${P1};`),
        change,
      ).toContain('adventure_reassignment_forbidden')
    }

    // Consent exists only on accepted rows, and the timestamp follows the flag.
    expect(
      resultLine(
        localDatabaseQuery(
          `${fixture}${proposedC}
update public.adventure_participants set share_consent = true where character_id = ${E2};
update public.adventure_participants set share_consent = true where character_id = ${E1};
select 'result',
  (select share_consent from public.adventure_participants where character_id = ${E2}),
  (select share_consent_at is null from public.adventure_participants where character_id = ${E2}),
  (select share_consent and share_consent_at is not null from public.adventure_participants where character_id = ${E1});
rollback;`,
          {},
        ),
      ),
    ).toBe('result|f|t|t')
    // Leaving clears consent and timestamps responded_at on accept.
    expect(
      resultLine(
        localDatabaseQuery(
          `${fixture}${joinC}
update public.adventure_participants set share_consent = true where character_id = ${E2};
update public.adventure_participants set status = 'left' where character_id = ${E2};
select 'result', share_consent, share_consent_at is null, responded_at is not null
  from public.adventure_participants where character_id = ${E2};
rollback;`,
          {},
        ),
      ),
    ).toBe('result|f|t|t')

    // Main adventures never have participants, whatever the status.
    expect(
      attempt(`insert into public.adventures (id, campaign_id, created_by, type, visibility, title)
  values ('00000000-0000-4000-8000-0000000006f2', ${K1}, ${A1}, 'main', 'campaign', 'Story');
insert into public.adventure_participants (adventure_id, campaign_id, character_id, profile_id, status)
  values ('00000000-0000-4000-8000-0000000006f2', ${K1}, ${E3}, ${A1}, 'proposed');`),
    ).toContain('adventure_main_has_no_participants')
  })

  test('visibility follows consent: wrong values are refused, and a bad commit never lands', () => {
    // A direct visibility change to anything but the derived value.
    for (const visibility of ['party', 'campaign']) {
      expect(
        sqlError(
          `${fixture}\nupdate public.adventures set visibility = '${visibility}' where id = ${P1};\nrollback;`,
        ),
        visibility,
      ).toMatch(/adventure_visibility_forbidden|adventures_visibility_matches_type/)
    }
    // The derived value is accepted.
    expect(
      sqlError(`${fixture}
update public.adventure_participants set share_consent = true where adventure_id = ${P1};
update public.adventures set visibility = 'party' where id = ${P1};
rollback;`),
    ).toBe('')

    // A share with a missing consent fails at commit, whichever statement caused it.
    expect(
      sqlError(`${fixture}
update public.adventure_participants set share_consent = true where adventure_id = ${P1};
update public.adventures set visibility = 'party' where id = ${P1};
update public.adventure_participants set share_consent = false where adventure_id = ${P1};
commit;`),
    ).toContain('adventure_share_consent_missing')
    expect(
      sqlError(`${fixture}
update public.adventure_participants set share_consent = true where adventure_id = ${P1};
update public.adventures set visibility = 'party' where id = ${P1};
${joinC}
commit;`),
    ).toContain('adventure_share_consent_missing')
    expect(
      sqlError(`${fixture}
update public.adventure_participants set share_consent = true where adventure_id = ${P1};
update public.adventures set visibility = 'party' where id = ${P1};
update public.adventure_participants set status = 'left' where adventure_id = ${P1};
commit;`),
    ).toContain('adventure_share_consent_missing')

    // And the same statements leave nothing behind: the fixture itself never committed.
    expect(count(`select count(*) from public.adventures where id = ${P1};`)).toBe(0)

    // Archiving a party adventure is reconciled in the same statement, so it commits cleanly
    // and the thread is private again.
    expect(
      resultLine(
        localDatabaseQuery(
          `${fixture}
update public.adventure_participants set share_consent = true where adventure_id = ${P1};
update public.adventures set visibility = 'party' where id = ${P1};
${asUser(B2)}
update public.adventures set archived_at = now() where id = ${P1};
select 'result', visibility, (select share_consent from public.adventure_participants where adventure_id = ${P1})
  from public.adventures where id = ${P1};
rollback;`,
          {},
        ),
      ),
    ).toBe('result|participants|f')

    // A visibility change is derived state, not an edit: updated_by stays.
    expect(
      resultLine(
        localDatabaseQuery(
          `${fixture}
${asUser(B2)}
update public.adventures set title = 'Edited' where id = ${P1};
update public.adventure_participants set share_consent = true where adventure_id = ${P1};
${asUser(C3)}
update public.adventures set visibility = 'party' where id = ${P1};
select 'result', updated_by = ${B2}, visibility from public.adventures where id = ${P1};
rollback;`,
          {},
        ),
      ),
    ).toBe('result|t|party')
  })

  test('archive rights follow D10 and accepted participants only', () => {
    const attempt = (sql: string) => sqlError(`${fixture}\n${joinC}\n${sql}\nrollback;`)
    const archive = `update public.adventures set archived_at = now() where id = ${P1};`
    // The creator b2 archives; c3 (not the creator while b2 participates) does not; no identity does not.
    expect(attempt(`${asUser(B2)}\n${archive}`)).toBe('')
    expect(attempt(`${asUser(C3)}\n${archive}`)).toContain('adventure_archive_creator_only')
    expect(attempt(archive)).toContain('adventure_archive_creator_only')
    expect(attempt(`${asUser(A1)}\n${archive}`)).toContain('adventure_archive_creator_only')
    // Once the creator has left, c3 may; a stranger may not.
    const creatorLeft = `update public.adventure_participants set status = 'left' where character_id = ${E1};`
    expect(attempt(`${creatorLeft}\n${asUser(C3)}\n${archive}`)).toBe('')
    expect(attempt(`${creatorLeft}\n${asUser(A1)}\n${archive}`)).toContain(
      'adventure_archive_creator_only',
    )
    expect(attempt(`${creatorLeft}\n${asUser(B2)}\n${archive}`)).toContain(
      'adventure_archive_creator_only',
    )
  })
})

// --- Departure and rejoin (D9) ----------------------------------------------------------------

test('leaving or removal from the campaign: shared threads, sole threads, invitations, approvals', async () => {
  test.setTimeout(180_000)
  const scene = await newScene()
  const { owner, a, b, c, d } = scene.players
  try {
    // T1: a shared two-person thread. b's character is in the party.
    const t1 = await thread(scene, ['a', 'b'], 'Shared thread')
    await share(scene, t1, ['a', 'b'])
    // T2: b's own thread, shared, with an invitation to d outstanding.
    const t2 = await create(b, scene.campaignId, 'personal', 'Bram alone', scene.chars.b)
    await rpcOk(consent(b, t2, true))
    expect(visibilityOf(t2)).toBe('party')
    const t2Invite = await invitePlayer(t2, b, scene.chars.d)
    expect(statusOf(t2, scene.chars.d)).toBe('invited')
    // T3: an invitation to b's character from a.
    const t3 = await create(a, scene.campaignId, 'side', 'Pending for Bram', scene.chars.a)
    const t3Invite = await invitePlayer(t3, a, scene.chars.b)
    // T4: a and c, to be left by c when the owner removes them.
    const t4 = await thread(scene, ['a', 'c'], 'Other thread')
    // T5: a and b, with a's approval of a proposal for c, waiting for b.
    const t5 = await thread(scene, ['a', 'b'], 'Almost there')
    const t5Proposal = await invitePlayer(t5, a, scene.chars.c)
    expect(statusOf(t5, scene.chars.c)).toBe('proposed')
    // T7: b's own proposal for d, which a has not approved.
    const t7 = await thread(scene, ['b', 'a'], 'Bram starts it')
    const t7Proposal = await invitePlayer(t7, b, scene.chars.d)
    expect(statusOf(t7, scene.chars.d)).toBe('proposed')
    expect(approvalsOn(t7Proposal)).toBe(1)

    await rpcOk(b.client.rpc('leave_campaign', { p_campaign_id: scene.campaignId }))

    // T1: b's row is left; a's consent keeps it shared with the party.
    expect(statusOf(t1, scene.chars.b)).toBe('left')
    expect(rowOf(t1, scene.chars.b)?.share_consent).toBe(false)
    expect(visibilityOf(t1)).toBe('party')
    expect((await readAdventure(c, t1))?.title).toBe('Shared thread')
    // T2: a sole thread is kept, private, with its pending invitation deleted.
    expect(statusOf(t2, scene.chars.b)).toBe('accepted')
    expect(rowOf(t2, scene.chars.b)?.share_consent).toBe(false)
    expect(visibilityOf(t2)).toBe('participants')
    expect(statusOf(t2, scene.chars.d)).toBe('none')
    expect(approvalsOn(t2Invite)).toBe(0)
    expect(await readAdventure(c, t2)).toBeNull()
    expect((await invitations(d, scene.campaignId)).data?.length ?? 0).toBe(0)
    // T3: an invitation to the leaver is deleted.
    expect(statusOf(t3, scene.chars.b)).toBe('none')
    expect(approvalsOn(t3Invite)).toBe(0)
    // T5: a had approved and b was the only other one, so the proposal is sent.
    expect(statusOf(t5, scene.chars.b)).toBe('left')
    expect(statusOf(t5, scene.chars.c)).toBe('invited')
    expect(approvalsOn(t5Proposal)).toBe(1)
    // T7: b's own approval is gone, and a (who never approved) has to.
    expect(approvalsOn(t7Proposal)).toBe(0)
    expect(statusOf(t7, scene.chars.d)).toBe('proposed')
    // b's characters are out of the party, and b no longer reads anything.
    expect(
      count(`select count(*) from public.characters where owner_id = '${b.id}' and in_party;`),
    ).toBe(0)
    expect(await readAdventure(b, t1)).toBeNull()
    assertInvariants(scene.campaignId)

    // Rejoining restores sole threads only, private.
    await invite(owner, scene.campaignId, b)
    expect(statusOf(t1, scene.chars.b)).toBe('left')
    expect(await readAdventure(b, t1)).toBeNull()
    expect((await readAdventure(b, t2))?.title).toBe('Bram alone')
    expect(visibilityOf(t2)).toBe('participants')
    expect((await invitations(b, scene.campaignId)).data).toEqual([])
    expect(await requestCount(b, scene.campaignId)).toBe(0)
    assertInvariants(scene.campaignId)

    // Removal by the owner takes the same path.
    await rpcOk(
      owner.client.rpc('remove_campaign_member', {
        p_campaign_id: scene.campaignId,
        p_profile_id: c.id,
      }),
    )
    expect(statusOf(t4, scene.chars.c)).toBe('left')
    expect(statusOf(t5, scene.chars.c)).toBe('none') // the invitation to c's character is deleted
    expect(await readAdventure(c, t4)).toBeNull()
    expect(
      count(
        `select count(*) from public.adventure_participants where profile_id = '${c.id}' and status in ('proposed', 'invited');`,
      ),
    ).toBe(0)
    assertInvariants(scene.campaignId)
  } finally {
    await cleanup(scene.players, scene.ids)
  }
})

// --- Character and account deletion (D11) -----------------------------------------------------

test('deleting a character or an account keeps shared threads and reconciles them', async () => {
  test.setTimeout(180_000)
  const scene = await newScene()
  const { a, b } = scene.players
  try {
    const shared = await thread(scene, ['a', 'b'], 'Shared')
    await share(scene, shared, ['a', 'b'])
    const sole = await create(b, scene.campaignId, 'personal', 'Only Bram', scene.chars.b)
    // A proposal waiting for b: deleting b's character lets it through.
    const waiting = await thread(scene, ['a', 'b'], 'Waiting')
    await invitePlayer(waiting, a, scene.chars.c)
    expect(statusOf(waiting, scene.chars.c)).toBe('proposed')

    const removed = await b.client.from('characters').delete().eq('id', scene.chars.b).select('id')
    expect(removed.error).toBeNull()
    expect(removed.data).toHaveLength(1)
    expect(visibilityOf(sole)).toBe('gone')
    expect(visibilityOf(shared)).toBe('party') // a had consented, so the thread stays shared
    expect(rows(shared).map((row) => row.status)).toEqual(['accepted'])
    expect(statusOf(waiting, scene.chars.c)).toBe('invited')
    assertInvariants(scene.campaignId)

    // An account: the characters cascade, approvals cascade, invited_by is cleared, no guard blocks it.
    const trio = await thread(scene, ['c', 'a'], 'Trio')
    const invited = await invitePlayer(trio, a, scene.chars.d, [scene.players.c])
    expect(rowOf(trio, scene.chars.d)?.invited_by).toBe(a.id)
    localDatabaseQuery(
      `begin;
       delete from public.campaign_members where profile_id = '${a.id}';
       delete from auth.users where id = '${a.id}';
       commit;`,
      {},
    )
    expect(rowOf(trio, scene.chars.d)?.invited_by).toBeNull()
    expect(statusOf(trio, scene.chars.d)).toBe('invited')
    expect(statusOf(trio, scene.chars.c)).toBe('accepted')
    expect(approvalsOn(invited)).toBe(1) // c's approval remains; a's cascaded
    expect(visibilityOf(shared)).toBe('gone') // a created it, so it goes with their account
    assertInvariants(scene.campaignId)
  } finally {
    await cleanup(scene.players, scene.ids)
  }
})

// --- Races (plan §4.2) ------------------------------------------------------------------------

test('races: approvals, rejections, answers, consent, leaving, and membership', async () => {
  test.setTimeout(240_000)
  const scene = await newScene()
  const { owner, a, b, c } = scene.players
  try {
    // The last two approvals at once: exactly one invited row.
    const trio = await thread(scene, ['a', 'b', 'c'], 'Trio')
    const proposal = await invitePlayer(trio, a, scene.chars.d)
    const approvals = await Promise.all([approve(b, proposal), approve(c, proposal)])
    expect(approvals.map((r) => r.error?.message ?? null)).toEqual([null, null])
    expect(statusOf(trio, scene.chars.d)).toBe('invited')
    expect(approvalsOn(proposal)).toBe(3)
    assertInvariants(scene.campaignId)

    // A rejection against an approval: whichever is first wins; the row ends up gone.
    const pair = await thread(scene, ['a', 'b'], 'Pair')
    const contested = await invitePlayer(pair, a, scene.chars.c)
    const [approved, rejected] = await Promise.all([approve(b, contested), cancel(a, contested)])
    expect(rejected.error).toBeNull()
    if (approved.error) expect(approved.error.message).toBe('adventure_proposal_unavailable')
    expect(statusOf(pair, scene.chars.c)).toBe('none')
    assertInvariants(scene.campaignId)

    // The invitee accepts while a participant withdraws: exactly one of them wins.
    const duo = await create(a, scene.campaignId, 'side', 'Duo', scene.chars.a)
    const invitation = await invitePlayer(duo, a, scene.chars.b)
    const [answer, withdrawal] = await Promise.all([
      respond(b, invitation, true),
      cancel(a, invitation),
    ])
    expect(Number(answer.error === null) + Number(withdrawal.error === null)).toBe(1)
    if (answer.error) expect(answer.error.message).toBe('adventure_invitation_unavailable')
    if (withdrawal.error) expect(withdrawal.error.message).toBe('adventure_proposal_unavailable')
    expect(statusOf(duo, scene.chars.b)).toBe(answer.error === null ? 'accepted' : 'none')
    assertInvariants(scene.campaignId)

    // The last consent against a withdrawal: never shared with a missing consent.
    const consenting = await thread(scene, ['a', 'b'], 'Consent race')
    await rpcOk(consent(a, consenting, true))
    await Promise.all([consent(b, consenting, true), consent(a, consenting, false)])
    expect(visibilityOf(consenting)).toBe('participants')
    assertInvariants(scene.campaignId)

    // Two participants leave at once, leaving one.
    const leaving = await thread(scene, ['a', 'b'], 'Leaving race')
    const departures = await Promise.all([leave(a, leaving), leave(b, leaving)])
    expect(departures.filter((r) => r.error === null)).toHaveLength(1)
    expect(departures.find((r) => r.error)?.error?.message).toBe('adventure_last_participant')
    expect(rows(leaving).filter((row) => row.status === 'accepted')).toHaveLength(1)
    assertInvariants(scene.campaignId)

    // A proposal against the invitee's character being deleted.
    const target = scene.chars.owner
    const host = await create(a, scene.campaignId, 'side', 'Doomed invite', scene.chars.a)
    const [proposed, deleted] = await Promise.all([
      propose(a, host, target),
      owner.client.from('characters').delete().eq('id', target).select('id'),
    ])
    expect(deleted.error).toBeNull()
    if (proposed.error) expect(proposed.error.message).toBe('adventure_character_unavailable')
    expect(statusOf(host, target)).toBe('none')
    assertInvariants(scene.campaignId)

    // An acceptance against the invitee's removal: accepted-then-left, or never accepted.
    const gate = await create(a, scene.campaignId, 'side', 'Gate', scene.chars.a)
    const gateInvite = await invitePlayer(gate, a, scene.chars.c)
    const [accepted, removal] = await Promise.all([
      respond(c, gateInvite, true),
      owner.client.rpc('remove_campaign_member', {
        p_campaign_id: scene.campaignId,
        p_profile_id: c.id,
      }),
    ])
    expect(removal.error).toBeNull()
    if (accepted.error) expect(accepted.error.message).toBe('adventure_invitation_unavailable')
    expect(['left', 'none']).toContain(statusOf(gate, scene.chars.c))
    expect(statusOf(gate, scene.chars.c)).not.toBe('accepted')
    assertInvariants(scene.campaignId)
  } finally {
    await cleanup(scene.players, scene.ids)
  }
})

// --- The invitation and the shared view, against the real stack ---------------------------------

test('a player invites another, who accepts and keeps it shared, and a third reads it in the party group', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const scene = await newScene()
  const { a, b, c } = scene.players
  // Light on resources: one context at a time, reduced motion, no screenshots or video.
  const signIn = async (player: Player) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/login')
    await page.getByLabel('Username or email').fill(`${player.username}@example.com`)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/campaigns$/)
    return { context, page }
  }
  const openBoard = async (page: Awaited<ReturnType<typeof signIn>>['page']) => {
    await page.goto(`/app/campaigns/${scene.campaignId}`)
    await page
      .getByRole('list', { name: 'Camp places' })
      .getByRole('button', { name: /^Adventures/ })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Adventures' })
    await expect(dialog).toBeVisible()
    return dialog
  }
  const stored = (title: string) =>
    localDatabaseQuery(
      `select a.visibility || '|' || coalesce((
         select string_agg(p.character_id || ':' || p.status || ':' || p.share_consent::text, ',' order by p.created_at)
         from public.adventure_participants p where p.adventure_id = a.id), '')
       from public.adventures a where a.campaign_id = '${scene.campaignId}' and a.title = '${title}';`,
      {},
    )

  try {
    // A starts a personal adventure, shares it (alone, so it is shared at once), and invites Bram.
    const first = await signIn(a)
    try {
      const { page } = first
      const dialog = await openBoard(page)
      await dialog.getByRole('button', { name: 'New adventure' }).click()
      await dialog.getByLabel('Title', { exact: true }).fill('The lantern job')
      await dialog.getByRole('button', { name: 'Create adventure' }).click()
      await expect(dialog.getByRole('heading', { level: 3, name: 'The lantern job' })).toBeVisible()

      await dialog
        .getByRole('region', { name: 'Sharing' })
        .getByRole('button', { name: 'Share with party' })
        .click()
      await dialog.getByRole('button', { name: 'Yes, share' }).click()
      await expect
        .poll(() => stored('The lantern job'))
        .toBe(`party|${scene.chars.a}:accepted:true`)

      const people = dialog.getByRole('region', { name: 'Participants' })
      await people.getByLabel('Invite a character').selectOption(scene.chars.b)
      await people.getByRole('button', { name: 'Invite' }).click()
      await dialog.getByRole('button', { name: 'Send invitation' }).click()
      await expect(dialog.getByText('Invitation proposed.')).toBeVisible()
      await expect
        .poll(() => stored('The lantern job'))
        .toBe(`party|${scene.chars.a}:accepted:true,${scene.chars.b}:invited:false`)
    } finally {
      await first.context.close()
    }

    // B sees the title and the inviter only, keeps it shared, and accepts.
    const second = await signIn(b)
    try {
      const { page } = second
      const dialog = await openBoard(page)
      const waiting = dialog.getByRole('region', { name: 'Waiting for you' })
      await expect(waiting).toContainText('The lantern job')
      await expect(waiting).toContainText(a.username)
      await waiting.getByLabel('Keep it shared with the party').check()
      await dialog.getByRole('button', { name: 'Accept the invitation to The lantern job' }).click()
      await expect(dialog.getByRole('heading', { level: 3, name: 'The lantern job' })).toBeVisible()
      await expect(
        dialog.getByRole('region', { name: 'Participants' }).getByRole('listitem'),
      ).toHaveCount(2)
      await expect
        .poll(() => stored('The lantern job'))
        .toBe(`party|${scene.chars.a}:accepted:true,${scene.chars.b}:accepted:true`)
    } finally {
      await second.context.close()
    }

    // C, a party member outside the adventure, reads it and can change nothing.
    const third = await signIn(c)
    try {
      const { page } = third
      const dialog = await openBoard(page)
      const shared = dialog.getByRole('region', { name: 'Shared with the party' })
      await expect(shared).toContainText('The lantern job')
      await expect(shared).toContainText('Read-only')
      await shared.getByRole('button', { name: 'The lantern job' }).click()
      await expect(
        dialog.getByText(/Shared with the party by .*Only the people in it/),
      ).toBeVisible()
      for (const name of ['Edit details', 'Archive adventure', 'Stop sharing', 'Leave adventure']) {
        await expect(dialog.getByRole('button', { name })).toHaveCount(0)
      }
      await expect(dialog.getByRole('combobox')).toHaveCount(0)
    } finally {
      await third.context.close()
    }
  } finally {
    await cleanup(scene.players, scene.ids)
  }
})
