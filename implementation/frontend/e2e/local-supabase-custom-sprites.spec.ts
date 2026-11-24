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

// Each player's uploaded camp sprite, per campaign (campaign_custom_sprites).

const sprite = (fill: string) => `${fill.repeat(1366)}==`
const first = sprite('A')
const second = sprite('B')
const large = `${'C'.repeat(5462)}==`
const huge = `${'D'.repeat(21846)}==`

const save = (player: Player, campaignId: string, pixels: string | null = first) =>
  player.client.rpc('set_campaign_custom_sprite', {
    p_campaign_id: campaignId,
    p_pixels: pixels,
  } as never)

async function sprites(player: Player, campaignId: string) {
  const { data, error } = await player.client
    .from('campaign_custom_sprites')
    .select('profile_id,pixels')
    .eq('campaign_id', campaignId)
  expect(error).toBeNull()
  return data ?? []
}

test('privileges: authenticated reads and deletes only; the function is authenticated-only', () => {
  const result = localDatabaseQuery(
    `begin;
select 'rls:' || relrowsecurity from pg_class where oid = 'public.campaign_custom_sprites'::regclass;
select 'insert:' || has_table_privilege('authenticated', 'public.campaign_custom_sprites', 'insert');
select 'update:' || has_table_privilege('authenticated', 'public.campaign_custom_sprites', 'update');
select 'anon:' || has_table_privilege('anon', 'public.campaign_custom_sprites', 'select');
select 'service:' || has_table_privilege('service_role', 'public.campaign_custom_sprites', 'select');
select 'fn_auth:' || has_function_privilege('authenticated', 'public.set_campaign_custom_sprite(uuid,text)', 'execute');
select 'fn_anon:' || has_function_privilege('anon', 'public.set_campaign_custom_sprite(uuid,text)', 'execute');
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

test('saving, visibility, validation, removal by owner, departure, and cascade', async () => {
  test.setTimeout(90_000)
  const { players } = await newPlayers(['owner', 'guest', 'outsider'])
  const { owner, guest, outsider } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'Sprite campaign')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)

    // A member saves a sprite, then replaces it: one row per player.
    await rpcOk(save(guest, campaignId))
    await rpcOk(save(guest, campaignId, second))
    expect(await sprites(guest, campaignId)).toEqual([{ profile_id: guest.id, pixels: second }])

    // Current members see each other's sprites; outsiders see none and cannot save.
    await rpcOk(save(owner, campaignId))
    expect(await sprites(owner, campaignId)).toHaveLength(2)
    expect(await sprites(guest, campaignId)).toHaveLength(2)
    expect(await sprites(outsider, campaignId)).toEqual([])
    expect((await rpcError(save(outsider, campaignId))).message).toBe('sprite_campaign_unavailable')
    expect((await rpcError(save(guest, RANDOM_ID))).message).toBe('sprite_campaign_unavailable')

    // Validation: exactly one 16x16 sprite of base64.
    for (const bad of [
      '',
      'A',
      sprite('A').slice(1),
      `${'A'.repeat(1366)}!!`,
      `${'A'.repeat(1368)}`,
    ]) {
      expect((await rpcError(save(guest, campaignId, bad))).message).toBe('sprite_invalid')
    }
    expect((await rpcError(save(guest, campaignId, null))).message).toBe('sprite_required')

    // A 32x32 sprite (5464 characters) is accepted too, and other lengths are not.
    await rpcOk(save(guest, campaignId, large))
    expect((await sprites(guest, campaignId)).find((row) => row.profile_id === guest.id)).toEqual({
      profile_id: guest.id,
      pixels: large,
    })
    await rpcOk(save(guest, campaignId, huge))
    expect((await rpcError(save(guest, campaignId, `${'A'.repeat(3000)}==`))).message).toBe(
      'sprite_invalid',
    )

    // The API cannot write the table directly.
    const direct = await guest.client
      .from('campaign_custom_sprites')
      .insert({ campaign_id: campaignId, pixels: first })
    expect(direct.error?.code).toBe('42501')
    const edited = await guest.client
      .from('campaign_custom_sprites')
      .update({ pixels: first })
      .eq('campaign_id', campaignId)
    expect(edited.error?.code).toBe('42501')

    // A member cannot remove another player's sprite; the owner can.
    const foreign = await guest.client
      .from('campaign_custom_sprites')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('profile_id', owner.id)
      .select('profile_id')
    expect(foreign.data ?? []).toHaveLength(0)
    const outsiderDelete = await outsider.client
      .from('campaign_custom_sprites')
      .delete()
      .eq('campaign_id', campaignId)
      .select('profile_id')
    expect(outsiderDelete.data ?? []).toHaveLength(0)
    expect(await sprites(owner, campaignId)).toHaveLength(2)
    const ownerRemoval = await owner.client
      .from('campaign_custom_sprites')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('profile_id', guest.id)
      .select('profile_id')
    expect(ownerRemoval.data).toHaveLength(1)
    expect(await sprites(owner, campaignId)).toHaveLength(1)

    // Leaving keeps the row but hides it from everyone; rejoining restores it.
    await rpcOk(save(guest, campaignId))
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    expect(await sprites(guest, campaignId)).toEqual([])
    expect((await sprites(owner, campaignId)).map((row) => row.profile_id)).toEqual([owner.id])
    await invite(owner, campaignId, guest)
    expect(await sprites(owner, campaignId)).toHaveLength(2)

    // A player removes their own sprite.
    const own = await guest.client
      .from('campaign_custom_sprites')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('profile_id', guest.id)
      .select('profile_id')
    expect(own.data).toHaveLength(1)

    // Deleting the campaign removes every sprite in it.
    await owner.client.from('campaigns').delete().eq('id', campaignId)
    expect(
      localDatabaseQuery(
        `select count(*) from public.campaign_custom_sprites where campaign_id = '${campaignId}'`,
        {},
      ),
    ).toContain('0')
  } finally {
    await cleanup(players, ids)
  }
})
