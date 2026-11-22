import { expect, test } from '@playwright/test'
import { localClient, localDatabaseQuery } from './support/localSupabase.ts'
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

// M02 (persistent galaxy): each player's campaign -> planet slot assignment
// (galaxy_planets), driven by membership triggers and moved by move_galaxy_planet.

/** The caller's visible assignments (active rows of current memberships): campaign id -> slot. */
async function slots(player: Player): Promise<Record<string, number>> {
  const { data, error } = await player.client.from('galaxy_planets').select('campaign_id,slot')
  expect(error).toBeNull()
  return Object.fromEntries((data ?? []).map((row) => [row.campaign_id, row.slot]))
}

/** Sends an invitation and returns its id without answering it. */
async function sendInvitation(owner: Player, campaignId: string, recipient: Player) {
  const { data: campaign } = await owner.client
    .from('campaigns')
    .select('name')
    .eq('id', campaignId)
    .single()
  await rpcOk(
    owner.client.rpc('send_campaign_invitation', {
      p_campaign_id: campaignId,
      p_username: recipient.username,
    }),
  )
  const { data, error } = await recipient.client.rpc('list_my_campaign_invitations')
  expect(error).toBeNull()
  const match = ((data ?? []) as { id: string; campaign_name: string }[]).find(
    (row) => row.campaign_name === campaign?.name,
  )
  expect(match, 'invitation should be pending').toBeTruthy()
  return match!.id as string
}

const count = (sql: string) => Number(localDatabaseQuery(sql, {}))

const rows = (profileId: string, campaignId?: string) =>
  count(
    `select count(*) from public.galaxy_planets where profile_id = '${profileId}'${
      campaignId ? ` and campaign_id = '${campaignId}'` : ''
    }`,
  )

test('privileges: authenticated reads only; anon and direct writes are denied', async () => {
  const result = localDatabaseQuery(
    `begin;
select 'rls:' || relrowsecurity from pg_class where oid = 'public.galaxy_planets'::regclass;
select 'select:' || has_table_privilege('authenticated', 'public.galaxy_planets', 'select');
select 'insert:' || has_table_privilege('authenticated', 'public.galaxy_planets', 'insert');
select 'update:' || has_table_privilege('authenticated', 'public.galaxy_planets', 'update');
select 'delete:' || has_table_privilege('authenticated', 'public.galaxy_planets', 'delete');
select 'anon:' || has_table_privilege('anon', 'public.galaxy_planets', 'select');
select 'service:' || has_table_privilege('service_role', 'public.galaxy_planets', 'select');
select 'move_auth:' || has_function_privilege('authenticated', 'public.move_galaxy_planet(uuid,integer)', 'execute');
select 'move_anon:' || has_function_privilege('anon', 'public.move_galaxy_planet(uuid,integer)', 'execute');
select 'assign_auth:' || has_function_privilege('authenticated', 'private.assign_galaxy_planet(uuid,uuid,smallint)', 'execute');
select 'claim_auth:' || has_function_privilege('authenticated', 'private.claim_galaxy_planet_on_join()', 'execute');
select 'release_auth:' || has_function_privilege('authenticated', 'private.release_galaxy_planet_on_leave()', 'execute');
rollback;`,
    {},
  )
  for (const line of [
    'rls:true',
    'select:true',
    'insert:false',
    'update:false',
    'delete:false',
    'anon:false',
    'service:false',
    'move_auth:true',
    'move_anon:false',
    'assign_auth:false',
    'claim_auth:false',
    'release_auth:false',
  ]) {
    expect(result).toContain(line)
  }
})

test('backfill invariant: every membership has exactly one active planet, in creation order', () => {
  expect(
    count(
      `select count(*) from public.campaign_members m
       where (select count(*) from public.galaxy_planets g
              where g.profile_id = m.profile_id and g.campaign_id = m.campaign_id
                and g.released_at is null) <> 1`,
    ),
  ).toBe(0)
  expect(
    count(
      `select count(*) from (
         select profile_id, slot from public.galaxy_planets where released_at is null
         group by 1, 2 having count(*) > 1) duplicates`,
    ),
  ).toBe(0)

  // The migration's backfill statement, replayed for one player whose campaigns were
  // created out of order, gives ring order by created_at then id.
  const order = localDatabaseQuery(
    `begin;
insert into auth.users (id, aud, role, email)
  values ('00000000-0000-4000-8000-0000000000f1', 'authenticated', 'authenticated', 'g2-backfill@example.test');
insert into public.campaigns (id, name, owner_id, created_at) values
  ('00000000-0000-4000-8000-0000000000f3', 'newest', '00000000-0000-4000-8000-0000000000f1', '2026-03-01'),
  ('00000000-0000-4000-8000-0000000000f2', 'oldest', '00000000-0000-4000-8000-0000000000f1', '2026-01-01'),
  ('00000000-0000-4000-8000-0000000000f4', 'middle', '00000000-0000-4000-8000-0000000000f1', '2026-02-01');
delete from public.galaxy_planets where profile_id = '00000000-0000-4000-8000-0000000000f1';
insert into public.galaxy_planets (profile_id, campaign_id, slot)
select m.profile_id, m.campaign_id,
       (row_number() over (partition by m.profile_id order by c.created_at, c.id) - 1)::smallint
from public.campaign_members m join public.campaigns c on c.id = m.campaign_id
where m.profile_id = '00000000-0000-4000-8000-0000000000f1'
on conflict do nothing;
select string_agg(c.name || ':' || g.slot, ',' order by g.slot)
from public.galaxy_planets g join public.campaigns c on c.id = g.campaign_id
where g.profile_id = '00000000-0000-4000-8000-0000000000f1';
rollback;`,
    {},
  )
  expect(order).toContain('oldest:0,middle:1,newest:2')
})

test('a new account has no planets; creating claims slots 0, 1, 2 and a failed create claims none', async () => {
  test.setTimeout(90_000)
  const { players } = await newPlayers(['solo'])
  const { solo } = players
  const ids: string[] = []
  try {
    expect(await slots(solo)).toEqual({})
    expect(rows(solo.id)).toBe(0)

    const first = await createCampaign(solo, 'First')
    ids.push(first)
    const second = await createCampaign(solo, 'Second')
    ids.push(second)
    const third = await createCampaign(solo, 'Third')
    ids.push(third)
    expect(await slots(solo)).toEqual({ [first]: 0, [second]: 1, [third]: 2 })

    // A rejected create (blank name) inserts nothing, so nothing is claimed.
    const blank = await solo.client.from('campaigns').insert({ name: '   ' }).select('id')
    expect(blank.error).not.toBeNull()
    expect(rows(solo.id)).toBe(3)
    expect(await slots(solo)).toEqual({ [first]: 0, [second]: 1, [third]: 2 })

    // Existing slots never move when a campaign is added or deleted.
    await solo.client.from('campaigns').delete().eq('id', second)
    expect(await slots(solo)).toEqual({ [first]: 0, [third]: 2 })
    const fourth = await createCampaign(solo, 'Fourth')
    ids.push(fourth)
    expect(await slots(solo)).toEqual({ [first]: 0, [fourth]: 1, [third]: 2 })
  } finally {
    await cleanup(players, ids)
  }
})

test('invitations claim a planet only when accepted, and the same campaign differs per player', async () => {
  test.setTimeout(90_000)
  const { players } = await newPlayers(['owner', 'guest'])
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const shared = await createCampaign(owner, 'Shared')
    const declined = await createCampaign(owner, 'Declined')
    const cancelled = await createCampaign(owner, 'Cancelled')
    ids.push(shared, declined, cancelled)

    // The guest already holds planet 0 through their own campaign.
    const own = await createCampaign(guest, 'Guest own')
    ids.push(own)

    // Pending, declined and cancelled invitations claim nothing.
    const pendingId = await sendInvitation(owner, shared, guest)
    expect(rows(guest.id)).toBe(1)
    await rpcOk(
      guest.client.rpc('respond_to_campaign_invitation', {
        p_invitation_id: await sendInvitation(owner, declined, guest),
        p_accept: false,
      }),
    )
    await rpcOk(
      owner.client.rpc('cancel_campaign_invitation', {
        p_invitation_id: await sendInvitation(owner, cancelled, guest),
      }),
    )
    expect(rows(guest.id)).toBe(1)
    expect(await slots(guest)).toEqual({ [own]: 0 })

    // Accepting claims the first free planet, and the owner's planet is unchanged.
    await rpcOk(
      guest.client.rpc('respond_to_campaign_invitation', {
        p_invitation_id: pendingId,
        p_accept: true,
      }),
    )
    expect(await slots(guest)).toEqual({ [own]: 0, [shared]: 1 })
    expect((await slots(owner))[shared]).toBe(0)

    // A repeated accept is refused and leaves exactly one row.
    expect(
      (
        await rpcError(
          guest.client.rpc('respond_to_campaign_invitation', {
            p_invitation_id: pendingId,
            p_accept: true,
          }),
        )
      ).message,
    ).toBe('campaign_invitation_unavailable')
    expect(rows(guest.id, shared)).toBe(1)

    // Nobody can read another player's planets.
    const foreign = await guest.client
      .from('galaxy_planets')
      .select('campaign_id')
      .eq('profile_id', owner.id)
    expect(foreign.data ?? []).toEqual([])
  } finally {
    await cleanup(players, ids)
  }
})

test('two simultaneous acceptances get distinct planets', async () => {
  test.setTimeout(90_000)
  const { players } = await newPlayers(['owner', 'guest'])
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaigns: string[] = []
    for (const name of ['Race A', 'Race B', 'Race C', 'Race D']) {
      const id = await createCampaign(owner, name)
      campaigns.push(id)
      ids.push(id)
    }
    const invitations = await Promise.all(campaigns.map((id) => sendInvitation(owner, id, guest)))

    const results = await Promise.all(
      invitations.map((id) =>
        guest.client.rpc('respond_to_campaign_invitation', { p_invitation_id: id, p_accept: true }),
      ),
    )
    for (const result of results) {
      expect(result.error?.message ?? null).toBeNull()
    }

    const assigned = Object.values(await slots(guest)).sort()
    expect(assigned).toEqual([0, 1, 2, 3])
    expect(
      count(
        `select count(*) from (
           select slot from public.galaxy_planets
           where profile_id = '${guest.id}' and released_at is null
           group by 1 having count(*) > 1) duplicates`,
      ),
    ).toBe(0)
  } finally {
    await cleanup(players, ids)
  }
})

test('leaving and removal release only that player; rejoining restores or falls back without displacing', async () => {
  test.setTimeout(120_000)
  const { players } = await newPlayers(['owner', 'guest', 'other'])
  const { owner, guest, other } = players
  const ids: string[] = []
  try {
    const a = await createCampaign(owner, 'Release A')
    const b = await createCampaign(owner, 'Release B')
    ids.push(a, b)
    await invite(owner, a, guest)
    await invite(owner, b, guest)
    await invite(owner, a, other)
    expect(await slots(guest)).toEqual({ [a]: 0, [b]: 1 })
    const ownerBefore = await slots(owner)

    // Leave: the row is kept as a hidden, released preference. Other rows are untouched.
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: a }))
    expect(await slots(guest)).toEqual({ [b]: 1 })
    expect(
      count(
        `select count(*) from public.galaxy_planets
         where profile_id = '${guest.id}' and campaign_id = '${a}' and released_at is not null`,
      ),
    ).toBe(1)
    expect(await slots(owner)).toEqual(ownerBefore)

    // Rejoin restores the old planet while it is free.
    await invite(owner, a, guest)
    expect(await slots(guest)).toEqual({ [a]: 0, [b]: 1 })
    expect(rows(guest.id, a)).toBe(1)

    // Leave again, take planet 0 with a new campaign, rejoin: first free planet, nothing displaced.
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: a }))
    const mine = await createCampaign(guest, 'Guest own')
    ids.push(mine)
    expect(await slots(guest)).toEqual({ [mine]: 0, [b]: 1 })
    await invite(owner, a, guest)
    expect(await slots(guest)).toEqual({ [mine]: 0, [b]: 1, [a]: 2 })
    expect(rows(guest.id, a)).toBe(1)

    // Removal releases only the removed player's row; the owner's galaxy is unchanged.
    const otherBefore = await slots(other)
    expect(otherBefore[a]).toBe(0)
    await rpcOk(
      owner.client.rpc('remove_campaign_member', { p_campaign_id: a, p_profile_id: other.id }),
    )
    expect(await slots(other)).toEqual({})
    expect(await slots(owner)).toEqual(ownerBefore)
    expect(await slots(guest)).toEqual({ [mine]: 0, [b]: 1, [a]: 2 })

    // A departed campaign can no longer be moved.
    expect(
      (await rpcError(other.client.rpc('move_galaxy_planet', { p_campaign_id: a, p_slot: 3 })))
        .message,
    ).toBe('galaxy_planet_campaign_unavailable')
  } finally {
    await cleanup(players, ids)
  }
})

test('deleting a campaign removes every member row and leaves the others', async () => {
  test.setTimeout(90_000)
  const { players } = await newPlayers(['owner', 'guest'])
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const doomed = await createCampaign(owner, 'Doomed')
    const kept = await createCampaign(owner, 'Kept')
    ids.push(doomed, kept)
    await invite(owner, doomed, guest)
    await invite(owner, kept, guest)
    expect(
      count(`select count(*) from public.galaxy_planets where campaign_id = '${doomed}'`),
    ).toBe(2)

    await rpcOk(owner.client.from('campaigns').delete().eq('id', doomed))
    expect(
      count(`select count(*) from public.galaxy_planets where campaign_id = '${doomed}'`),
    ).toBe(0)
    expect(await slots(owner)).toEqual({ [kept]: 1 })
    expect(await slots(guest)).toEqual({ [kept]: 1 })
  } finally {
    await cleanup(players, ids)
  }
})

test('move_galaxy_planet moves to a free planet and rejects bad targets', async () => {
  test.setTimeout(90_000)
  const { players } = await newPlayers(['owner', 'stranger'])
  const { owner, stranger } = players
  const ids: string[] = []
  try {
    const first = await createCampaign(owner, 'Mover')
    const second = await createCampaign(owner, 'Blocker')
    ids.push(first, second)
    const move = (campaignId: string | null, slot: number | null) =>
      owner.client.rpc('move_galaxy_planet', { p_campaign_id: campaignId, p_slot: slot } as never)

    // A free planet takes the campaign; the old planet becomes free.
    const moved = await move(first, 4)
    expect(moved.error).toBeNull()
    expect(moved.data).toBe(4)
    expect(await slots(owner)).toEqual({ [first]: 4, [second]: 1 })

    // A taken planet is not an error: nothing moves and the current slot comes back.
    const taken = await move(first, 1)
    expect(taken.error).toBeNull()
    expect(taken.data).toBe(4)
    expect(await slots(owner)).toEqual({ [first]: 4, [second]: 1 })

    // Moving onto the current planet is a no-op.
    expect((await move(first, 4)).data).toBe(4)

    // Only visible planets: the six starters, or up to the outermost one in use.
    expect((await move(first, 5)).data).toBe(5)
    for (const slot of [6, -1, 100]) {
      const result = await move(first, slot)
      expect(result.error?.code, `slot ${slot}`).toBe('22023')
      expect(result.error?.message).toBe('galaxy_planet_invalid')
    }
    expect((await rpcError(move(null, 1))).message).toBe('galaxy_planet_required')
    expect((await rpcError(move(first, null))).message).toBe('galaxy_planet_required')

    // Unknown campaigns and someone else's campaign give the same error.
    for (const campaignId of [RANDOM_ID, first]) {
      const result = await stranger.client.rpc('move_galaxy_planet', {
        p_campaign_id: campaignId,
        p_slot: 2,
      })
      expect(result.error?.code).toBe('P0001')
      expect(result.error?.message).toBe('galaxy_planet_campaign_unavailable')
    }
    expect((await rpcError(move(RANDOM_ID, 2))).message).toBe('galaxy_planet_campaign_unavailable')

    // The stranger's galaxy is unaffected, and the owner's stays as moved.
    expect(await slots(stranger)).toEqual({})
    expect(await slots(owner)).toEqual({ [first]: 5, [second]: 1 })
  } finally {
    await cleanup(players, ids)
  }
})

test('RLS and grants: the API cannot write the table, and anon cannot read or call', async () => {
  test.setTimeout(90_000)
  const { players } = await newPlayers(['owner', 'other'])
  const { owner, other } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'Locked')
    const otherCampaign = await createCampaign(other, 'Other locked')
    ids.push(campaignId, otherCampaign)

    const insert = await owner.client
      .from('galaxy_planets')
      .insert({ profile_id: owner.id, campaign_id: otherCampaign, slot: 9 })
    expect(insert.error?.code).toBe('42501')
    const update = await owner.client
      .from('galaxy_planets')
      .update({ slot: 9 })
      .eq('campaign_id', campaignId)
    expect(update.error?.code).toBe('42501')
    const remove = await owner.client.from('galaxy_planets').delete().eq('campaign_id', campaignId)
    expect(remove.error?.code).toBe('42501')
    expect(await slots(owner)).toEqual({ [campaignId]: 0 })
    expect(await slots(other)).toEqual({ [otherCampaign]: 0 })

    const anon = localClient()
    const read = await anon.from('galaxy_planets').select('campaign_id')
    expect(read.error?.code).toBe('42501')
    const call = await anon.rpc('move_galaxy_planet', { p_campaign_id: campaignId, p_slot: 2 })
    expect(call.error?.code).toBe('42501')
  } finally {
    await cleanup(players, ids)
  }
})

test('creating from an uncharted planet claims it, and a taken planet falls back to the first free one', async ({
  browser,
}) => {
  test.setTimeout(90_000)
  const { players } = await newPlayers(['painter'])
  const { painter } = players
  const ids: string[] = []
  // Light on resources: one context, reduced motion, no screenshots or video.
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    const first = await createCampaign(painter, 'Home world')
    ids.push(first)
    expect(await slots(painter)).toEqual({ [first]: 0 })

    await page.goto('/login')
    await page.getByLabel('Username or email').fill(`${painter.username}@example.com`)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/campaigns$/)

    // Choose the fourth planet from the chart and create a campaign on it.
    await expect(page.locator('canvas[data-galaxy-ready]')).toBeVisible()
    const next = page.getByRole('button', { name: 'Next world' })
    for (const numeral of ['II', 'III', 'IV']) {
      await next.click()
      await expect(
        page.getByRole('link', { name: `Create campaign on Uncharted World ${numeral}` }),
      ).toBeVisible()
    }
    await page.getByRole('link', { name: 'Create campaign on Uncharted World IV' }).click()
    await expect(page).toHaveURL(/\/app\/campaigns\/new\?planet=3$/)
    await page.getByLabel('Campaign name').fill('Fourth world')
    await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/campaigns\/[0-9a-f-]{36}$/)

    const afterFirst = await slots(painter)
    const fourth = Object.keys(afterFirst).find((id) => id !== first)!
    ids.push(fourth)
    expect(afterFirst).toEqual({ [first]: 0, [fourth]: 3 })

    // A planet that is already taken is not an error: the campaign takes the first free one.
    await page.goto('/app/campaigns/new?planet=0')
    await page.getByLabel('Campaign name').fill('Crowded world')
    await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/campaigns\/[0-9a-f-]{36}$/)
    const afterSecond = await slots(painter)
    const crowded = Object.keys(afterSecond).find((id) => ![first, fourth].includes(id))!
    ids.push(crowded)
    expect(afterSecond).toEqual({ [first]: 0, [fourth]: 3, [crowded]: 1 })
  } finally {
    await context.close()
    await cleanup(players, ids)
  }
})
