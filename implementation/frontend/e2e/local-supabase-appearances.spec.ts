import { expect, test } from '@playwright/test'
import { localDatabaseQuery } from './support/localSupabase.ts'
import {
  cleanup,
  createCampaign,
  invite,
  newPlayers,
  RANDOM_ID,
  rpcError,
  rpcOk,
  type Player,
} from './support/localPlayers.ts'

// M03.2 follow-up: each player's camp look, per campaign (campaign_appearances).

const look = { p_cloak: 3, p_skin: 2, p_headwear: 'hood', p_pack: 'quiver' }

const save = (player: Player, campaignId: string, overrides: Record<string, unknown> = {}) =>
  player.client.rpc('set_campaign_appearance', {
    p_campaign_id: campaignId,
    ...look,
    ...overrides,
  } as never)

async function looks(player: Player, campaignId: string) {
  const { data, error } = await player.client
    .from('campaign_appearances')
    .select('profile_id,cloak,skin,headwear,pack')
    .eq('campaign_id', campaignId)
  expect(error).toBeNull()
  return data ?? []
}

test('privileges: authenticated reads and deletes only; the function is authenticated-only', () => {
  const result = localDatabaseQuery(
    `begin;
select 'rls:' || relrowsecurity from pg_class where oid = 'public.campaign_appearances'::regclass;
select 'insert:' || has_table_privilege('authenticated', 'public.campaign_appearances', 'insert');
select 'update:' || has_table_privilege('authenticated', 'public.campaign_appearances', 'update');
select 'anon:' || has_table_privilege('anon', 'public.campaign_appearances', 'select');
select 'service:' || has_table_privilege('service_role', 'public.campaign_appearances', 'select');
select 'fn_auth:' || has_function_privilege('authenticated', 'public.set_campaign_appearance(uuid,integer,integer,text,text)', 'execute');
select 'fn_anon:' || has_function_privilege('anon', 'public.set_campaign_appearance(uuid,integer,integer,text,text)', 'execute');
rollback;`,
    {},
  )
  for (const line of [
    'rls:true',
    'insert:false',
    'update:false',
    'anon:false',
    'service:false',
    'fn_auth:true',
    'fn_anon:false',
  ]) {
    expect(result).toContain(line)
  }
})

test('saving, visibility, bypass attempts, departure, and cascade', async () => {
  test.setTimeout(90_000)
  const { players } = await newPlayers(['owner', 'guest', 'outsider'])
  const { owner, guest, outsider } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'Appearance campaign')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)

    // A member saves a look, then replaces it: one row per player.
    await rpcOk(save(guest, campaignId))
    await rpcOk(save(guest, campaignId, { p_cloak: 5, p_headwear: 'bare' }))
    expect(await looks(guest, campaignId)).toEqual([
      { profile_id: guest.id, cloak: 5, skin: 2, headwear: 'bare', pack: 'quiver' },
    ])

    // Current members see each other's looks; outsiders see none and cannot save.
    await rpcOk(save(owner, campaignId))
    expect(await looks(owner, campaignId)).toHaveLength(2)
    expect(await looks(guest, campaignId)).toHaveLength(2)
    expect(await looks(outsider, campaignId)).toEqual([])
    expect((await rpcError(save(outsider, campaignId))).message).toBe(
      'appearance_campaign_unavailable',
    )
    expect((await rpcError(save(guest, RANDOM_ID))).message).toBe('appearance_campaign_unavailable')

    // Validation.
    for (const bad of [
      { p_cloak: 8 },
      { p_cloak: -1 },
      { p_skin: 5 },
      { p_headwear: 'crown' },
      { p_pack: 'sword' },
    ]) {
      expect((await rpcError(save(guest, campaignId, bad))).message).toBe('appearance_invalid')
    }
    expect((await rpcError(save(guest, campaignId, { p_cloak: null }))).message).toBe(
      'appearance_required',
    )

    // The API cannot write the table or touch another player's row.
    const direct = await guest.client
      .from('campaign_appearances')
      .insert({ campaign_id: campaignId, cloak: 1, skin: 1, headwear: 'hat', pack: 'none' })
    expect(direct.error?.code).toBe('42501')
    const edited = await guest.client
      .from('campaign_appearances')
      .update({ cloak: 0 })
      .eq('campaign_id', campaignId)
    expect(edited.error?.code).toBe('42501')
    const foreign = await guest.client
      .from('campaign_appearances')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('profile_id', owner.id)
      .select('profile_id')
    expect(foreign.data ?? []).toHaveLength(0)
    expect(await looks(owner, campaignId)).toHaveLength(2)

    // Leaving keeps the row but hides it from everyone; rejoining restores it.
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    expect(await looks(guest, campaignId)).toEqual([])
    expect((await looks(owner, campaignId)).map((row) => row.profile_id)).toEqual([owner.id])
    expect(
      localDatabaseQuery(
        `select count(*) from public.campaign_appearances where campaign_id = '${campaignId}'`,
        {},
      ),
    ).toContain('2')
    await invite(owner, campaignId, guest)
    expect(await looks(owner, campaignId)).toHaveLength(2)

    // A player resets their own look by deleting their row.
    const reset = await guest.client
      .from('campaign_appearances')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('profile_id', guest.id)
      .select('profile_id')
    expect(reset.data).toHaveLength(1)
    expect(await looks(owner, campaignId)).toHaveLength(1)

    // Deleting the campaign removes every look in it.
    await owner.client.from('campaigns').delete().eq('id', campaignId)
    expect(
      localDatabaseQuery(
        `select count(*) from public.campaign_appearances where campaign_id = '${campaignId}'`,
        {},
      ),
    ).toContain('0')
  } finally {
    await cleanup(players, ids)
  }
})
