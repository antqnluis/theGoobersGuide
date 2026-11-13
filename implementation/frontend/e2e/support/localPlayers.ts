import { expect } from '@playwright/test'
import { localClient } from './localSupabase.ts'

export type Client = ReturnType<typeof localClient>
export const PASSWORD = crypto.randomUUID()

export async function createAccount(client: Client, username: string): Promise<string> {
  const { data, error } = await client.auth.signUp({
    email: `${username}@example.com`,
    password: PASSWORD,
    options: { data: { username } },
  })
  expect(error).toBeNull()
  expect(data.session).toBeTruthy()
  return data.user!.id
}

export async function rpcError(
  call: PromiseLike<{ error: { code: string; message: string } | null }>,
) {
  const { error } = await call
  expect(error, 'expected the call to fail').not.toBeNull()
  return { code: error!.code, message: error!.message }
}

export async function rpcOk(
  call: PromiseLike<{ error: { code: string; message: string } | null }>,
) {
  const { error } = await call
  expect(error?.message ?? null).toBeNull()
}

export interface Player {
  client: Client
  id: string
  username: string
}

export async function newPlayers(names: string[]) {
  const run = crypto.randomUUID().replaceAll('-', '').slice(0, 10)
  const players: Record<string, Player> = {}
  for (const name of names) {
    const client = localClient()
    const username = `${name}_${run}`
    players[name] = { client, id: await createAccount(client, username), username }
  }
  return { run, players }
}

export async function invite(owner: Player, campaignId: string, recipient: Player) {
  await rpcOk(
    owner.client.rpc('send_campaign_invitation', {
      p_campaign_id: campaignId,
      p_username: recipient.username,
    }),
  )
  const { data, error } = await recipient.client.rpc('list_my_campaign_invitations')
  expect(error).toBeNull()
  expect(data).toHaveLength(1)
  await rpcOk(
    recipient.client.rpc('respond_to_campaign_invitation', {
      p_invitation_id: data[0].id,
      p_accept: true,
    }),
  )
}

export async function createCampaign(owner: Player, name: string) {
  const { data, error } = await owner.client.from('campaigns').insert({ name }).select('id')
  expect(error).toBeNull()
  return data![0].id as string
}

export const RANDOM_ID = '00000000-0000-4000-8000-00000000dead'

export async function cleanup(players: Record<string, Player>, ids: string[]) {
  for (const id of ids) {
    for (const player of Object.values(players)) {
      await player.client.from('campaigns').delete().eq('id', id)
    }
  }
}
