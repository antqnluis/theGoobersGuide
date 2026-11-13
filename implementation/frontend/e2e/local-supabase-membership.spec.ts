import { expect, test } from '@playwright/test'
import { localClient, localDatabaseQuery } from './support/localSupabase.ts'

function sqlError(sql: string): string {
  try {
    localDatabaseQuery(sql, {})
  } catch (error) {
    const failure = error as { stderr?: string; message: string }
    return `${failure.stderr ?? ''}${failure.message}`
  }
  return ''
}

// Two accounts, one campaign owned by `owner`, and `member` on its roster.
// Every statement runs inside a transaction the caller rolls back.
const fixture = `
begin;
insert into auth.users (id, aud, role, email)
  values ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'm1-owner@example.test'),
         ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'm1-member@example.test');
insert into public.campaigns (id, name, owner_id)
  values ('00000000-0000-4000-8000-0000000000c1', 'M1 fixture', '00000000-0000-4000-8000-0000000000a1');
insert into public.campaign_members (campaign_id, profile_id, role)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b2', 'member');
set constraints all immediate;
set constraints all deferred;
`
const OWNER = "'00000000-0000-4000-8000-0000000000a1'"
const MEMBER = "'00000000-0000-4000-8000-0000000000b2'"
const CAMPAIGN = "'00000000-0000-4000-8000-0000000000c1'"

test('new objects created by postgres are not exposed to API roles by default', () => {
  const result = localDatabaseQuery(
    `
begin;
create table public.m1_probe_table (id int);
create function public.m1_probe_public_fn() returns int language sql as 'select 1';
create function private.m1_probe_private_fn() returns int language sql as 'select 1';
select 'table:' || r || ':' || has_table_privilege(r, 'public.m1_probe_table', 'select')
  from unnest(array['anon', 'authenticated', 'service_role']) as r;
select 'public_fn:' || r || ':' || has_function_privilege(r, 'public.m1_probe_public_fn()', 'execute')
  from unnest(array['anon', 'authenticated', 'service_role', 'public']) as r;
select 'private_fn:' || r || ':' || has_function_privilege(r, 'private.m1_probe_private_fn()', 'execute')
  from unnest(array['anon', 'authenticated', 'service_role', 'public']) as r;
rollback;
`,
    {},
  )
  const lines = result.split('\n').filter((line) => /^(table|public_fn|private_fn):/.test(line))
  expect(lines).toHaveLength(11)
  for (const line of lines) {
    expect(line, line).toMatch(/:false$/)
  }
})

test('existing campaigns have exactly one owner row that matches campaigns.owner_id', () => {
  const inconsistent = localDatabaseQuery(
    `select count(*) from public.campaigns c
     where (select count(*) from public.campaign_members m where m.campaign_id = c.id and m.role = 'owner') <> 1
        or not exists (select 1 from public.campaign_members m
                       where m.campaign_id = c.id and m.role = 'owner' and m.profile_id = c.owner_id);`,
    {},
  )
  expect(inconsistent).toBe('0')
})

test('owner deletion is restricted and ownership triggers are deferrable and initially deferred', () => {
  expect(
    localDatabaseQuery(
      `select pg_get_constraintdef(oid) from pg_constraint where conname = 'campaigns_owner_id_fkey';`,
      {},
    ),
  ).toMatch(/ON DELETE RESTRICT/)
  expect(
    localDatabaseQuery(
      `select tgname || ':' || tgdeferrable || ':' || tginitdeferred from pg_trigger
       where tgname in ('campaigns_ownership_consistent', 'campaign_members_ownership_consistent')
       order by tgname;`,
      {},
    ),
  ).toBe(
    'campaign_members_ownership_consistent:true:true\ncampaigns_ownership_consistent:true:true',
  )
  expect(
    localDatabaseQuery(
      `select string_agg(r || ':' || has_function_privilege(r, 'private.assert_campaign_ownership_consistent()', 'execute'), ',' order by r)
       from unnest(array['anon', 'authenticated', 'service_role', 'public']) as r;`,
      {},
    ),
  ).toBe('anon:false,authenticated:false,public:false,service_role:false')
})

test('a valid ownership swap passes the commit-time check', () => {
  const result = localDatabaseQuery(
    `${fixture}
update public.campaign_members set role = 'member' where campaign_id = ${CAMPAIGN} and profile_id = ${OWNER};
update public.campaign_members set role = 'owner' where campaign_id = ${CAMPAIGN} and profile_id = ${MEMBER};
update public.campaigns set owner_id = ${MEMBER} where id = ${CAMPAIGN};
set constraints all immediate;
select 'ok';
rollback;`,
    {},
  )
  expect(result).toContain('ok')
})

test('creating and deleting a campaign still satisfies the invariant', () => {
  const result = localDatabaseQuery(
    `${fixture}
set constraints all immediate;
delete from public.campaigns where id = ${CAMPAIGN};
set constraints all immediate;
select 'ok';
rollback;`,
    {},
  )
  expect(result).toContain('ok')
})

test('demoting the owner row without promoting another fails at commit', () => {
  expect(
    sqlError(`${fixture}
update public.campaign_members set role = 'member' where campaign_id = ${CAMPAIGN} and profile_id = ${OWNER};
set constraints all immediate;
rollback;`),
  ).toContain('campaign_ownership_inconsistent')
})

test('pointing campaigns.owner_id at a member without changing roles fails at commit', () => {
  expect(
    sqlError(`${fixture}
update public.campaigns set owner_id = ${MEMBER} where id = ${CAMPAIGN};
set constraints all immediate;
rollback;`),
  ).toContain('campaign_ownership_inconsistent')
})

test('deleting an owner account is blocked until their campaign is gone', () => {
  const error = sqlError(`${fixture}
delete from auth.users where id = ${OWNER};
rollback;`)
  expect(error).toContain('campaigns_owner_id_fkey')

  const result = localDatabaseQuery(
    `${fixture}
delete from public.campaigns where id = ${CAMPAIGN};
delete from auth.users where id = ${OWNER};
select 'ok';
rollback;`,
    {},
  )
  expect(result).toContain('ok')
})

test('deleting a member account removes only their membership and keeps the invariant', () => {
  const result = localDatabaseQuery(
    `${fixture}
delete from auth.users where id = ${MEMBER};
set constraints all immediate;
select 'members:' || count(*) from public.campaign_members where campaign_id = ${CAMPAIGN};
rollback;`,
    {},
  )
  expect(result).toContain('members:1')
})

// --- Membership RPCs against the real local stack ---------------------------------

type Client = ReturnType<typeof localClient>
const PASSWORD = crypto.randomUUID()

async function createAccount(client: Client, username: string): Promise<string> {
  const { data, error } = await client.auth.signUp({
    email: `${username}@example.com`,
    password: PASSWORD,
    options: { data: { username } },
  })
  expect(error).toBeNull()
  expect(data.session).toBeTruthy()
  return data.user!.id
}

async function rpcError(call: PromiseLike<{ error: { code: string; message: string } | null }>) {
  const { error } = await call
  expect(error, 'expected the call to fail').not.toBeNull()
  return { code: error!.code, message: error!.message }
}

async function rpcOk(call: PromiseLike<{ error: { code: string; message: string } | null }>) {
  const { error } = await call
  expect(error?.message ?? null).toBeNull()
}

interface Player {
  client: Client
  id: string
  username: string
}

async function newPlayers(names: string[]) {
  const run = crypto.randomUUID().replaceAll('-', '').slice(0, 10)
  const players: Record<string, Player> = {}
  for (const name of names) {
    const client = localClient()
    const username = `${name}_${run}`
    players[name] = { client, id: await createAccount(client, username), username }
  }
  return { run, players }
}

async function invite(owner: Player, campaignId: string, recipient: Player) {
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

async function createCampaign(owner: Player, name: string) {
  const { data, error } = await owner.client.from('campaigns').insert({ name }).select('id')
  expect(error).toBeNull()
  return data![0].id as string
}

async function roster(client: Client, campaignId: string) {
  const { data, error } = await client.rpc('get_campaign_roster', { p_campaign_id: campaignId })
  expect(error).toBeNull()
  return (data as { profile_id: string; role: string; username: string }[]).map(
    (row) => `${row.username}:${row.role}`,
  )
}

async function canRead(client: Client, campaignId: string) {
  const { data: campaigns } = await client.from('campaigns').select('id').eq('id', campaignId)
  const { data: members } = await client
    .from('campaign_members')
    .select('id')
    .eq('campaign_id', campaignId)
  return {
    campaigns: campaigns!.length,
    members: members!.length,
    roster: (await roster(client, campaignId)).length,
  }
}

function invariantViolations(campaignId: string) {
  return localDatabaseQuery(
    `select count(*) from public.campaigns c
     where c.id = '${campaignId}'
       and ((select count(*) from public.campaign_members m where m.campaign_id = c.id and m.role = 'owner') <> 1
         or not exists (select 1 from public.campaign_members m
                        where m.campaign_id = c.id and m.role = 'owner' and m.profile_id = c.owner_id));`,
    {},
  )
}

function ownerOf(campaignId: string) {
  return localDatabaseQuery(`select owner_id from public.campaigns where id = '${campaignId}';`, {})
}

const RANDOM_ID = '00000000-0000-4000-8000-00000000dead'

async function cleanup(players: Record<string, Player>, ids: string[]) {
  for (const id of ids) {
    for (const player of Object.values(players)) {
      await player.client.from('campaigns').delete().eq('id', id)
    }
  }
}

test('leaving, rejoining, and leave authorization', async () => {
  test.setTimeout(90_000)
  const { players } = await newPlayers(['owner', 'guest', 'other', 'outsider'])
  const { owner, guest, other, outsider } = players
  const anonymous = localClient()
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M1 leave')
    const otherCampaignId = await createCampaign(outsider, 'M1 leave other')
    ids.push(campaignId, otherCampaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    expect(await roster(owner.client, campaignId)).toHaveLength(3)

    const joinedBefore = localDatabaseQuery(
      `select joined_at from public.campaign_members where campaign_id = '${campaignId}' and profile_id = '${guest.id}';`,
      {},
    )

    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    expect(await canRead(guest.client, campaignId)).toEqual({ campaigns: 0, members: 0, roster: 0 })
    expect(await roster(owner.client, campaignId)).not.toContain(`${guest.username}:member`)
    expect(await roster(owner.client, campaignId)).toHaveLength(2)
    expect(invariantViolations(campaignId)).toBe('0')

    // Same response for already left, non-member, and unknown campaigns.
    for (const [client, id] of [
      [guest.client, campaignId],
      [outsider.client, campaignId],
      [guest.client, RANDOM_ID],
    ] as const) {
      expect(await rpcError(client.rpc('leave_campaign', { p_campaign_id: id }))).toEqual({
        code: 'P0001',
        message: 'campaign_membership_unavailable',
      })
    }

    expect(
      await rpcError(owner.client.rpc('leave_campaign', { p_campaign_id: campaignId })),
    ).toEqual({
      code: 'P0001',
      message: 'campaign_leave_owner_must_transfer',
    })
    expect(ownerOf(campaignId)).toBe(owner.id)
    expect(invariantViolations(campaignId)).toBe('0')

    expect(
      (await rpcError(anonymous.rpc('leave_campaign', { p_campaign_id: campaignId }))).code,
    ).toBe('42501')
    expect((await rpcError(other.client.rpc('leave_campaign', { p_campaign_id: null }))).code).toBe(
      '22023',
    )

    // Rejoin: no already-member conflict, fresh row, access restored.
    await invite(owner, campaignId, guest)
    expect(await canRead(guest.client, campaignId)).toEqual({ campaigns: 1, members: 3, roster: 3 })
    expect(await roster(owner.client, campaignId)).toContain(`${guest.username}:member`)
    expect(
      localDatabaseQuery(
        `select joined_at > '${joinedBefore}'::timestamptz from public.campaign_members where campaign_id = '${campaignId}' and profile_id = '${guest.id}';`,
        {},
      ),
    ).toBe('t')
  } finally {
    await cleanup(players, ids)
  }
})

test('removing members and remove authorization', async () => {
  test.setTimeout(90_000)
  const { players } = await newPlayers(['owner', 'guest', 'other', 'outsider'])
  const { owner, guest, other, outsider } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M1 remove')
    const outsiderCampaignId = await createCampaign(outsider, 'M1 remove other')
    ids.push(campaignId, outsiderCampaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)

    await rpcOk(
      owner.client.rpc('remove_campaign_member', {
        p_campaign_id: campaignId,
        p_profile_id: guest.id,
      }),
    )
    expect(await canRead(guest.client, campaignId)).toEqual({ campaigns: 0, members: 0, roster: 0 })
    expect(await roster(owner.client, campaignId)).toHaveLength(2)
    expect(invariantViolations(campaignId)).toBe('0')

    // Members cannot remove anyone.
    for (const target of [owner.id, other.id]) {
      expect(
        (
          await rpcError(
            other.client.rpc('remove_campaign_member', {
              p_campaign_id: campaignId,
              p_profile_id: target,
            }),
          )
        ).code,
      ).toBe('42501')
    }
    // Non-members and the owner of another campaign cannot either.
    for (const client of [guest.client, outsider.client]) {
      expect(
        await rpcError(
          client.rpc('remove_campaign_member', {
            p_campaign_id: campaignId,
            p_profile_id: other.id,
          }),
        ),
      ).toEqual({ code: '42501', message: 'campaign_member_owner_required' })
    }
    expect(
      (
        await rpcError(
          owner.client.rpc('remove_campaign_member', {
            p_campaign_id: outsiderCampaignId,
            p_profile_id: outsider.id,
          }),
        )
      ).code,
    ).toBe('42501')

    expect(
      await rpcError(
        owner.client.rpc('remove_campaign_member', {
          p_campaign_id: campaignId,
          p_profile_id: owner.id,
        }),
      ),
    ).toEqual({ code: 'P0001', message: 'campaign_member_remove_owner' })
    for (const target of [guest.id, RANDOM_ID]) {
      expect(
        await rpcError(
          owner.client.rpc('remove_campaign_member', {
            p_campaign_id: campaignId,
            p_profile_id: target,
          }),
        ),
      ).toEqual({ code: 'P0001', message: 'campaign_member_unavailable' })
    }
    expect(
      (
        await rpcError(
          owner.client.rpc('remove_campaign_member', {
            p_campaign_id: null,
            p_profile_id: other.id,
          }),
        )
      ).code,
    ).toBe('22023')
    expect(
      (
        await rpcError(
          localClient().rpc('remove_campaign_member', {
            p_campaign_id: campaignId,
            p_profile_id: other.id,
          }),
        )
      ).code,
    ).toBe('42501')

    // A removed player can be re-invited and rejoin.
    await invite(owner, campaignId, guest)
    expect(await canRead(guest.client, campaignId)).toEqual({ campaigns: 1, members: 3, roster: 3 })
    expect(invariantViolations(campaignId)).toBe('0')
  } finally {
    await cleanup(players, ids)
  }
})

test('transferring ownership moves every owner right and keeps one owner', async () => {
  test.setTimeout(90_000)
  const { players } = await newPlayers(['owner', 'guest', 'other', 'outsider', 'invitee'])
  const { owner, guest, other, outsider, invitee } = players
  const anonymous = localClient()
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M1 transfer')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    // Pending invitation sent by the original owner.
    await rpcOk(
      owner.client.rpc('send_campaign_invitation', {
        p_campaign_id: campaignId,
        p_username: invitee.username,
      }),
    )

    const transfer = (client: Client, target: string | null, id: string | null = campaignId) =>
      client.rpc('transfer_campaign_ownership', { p_campaign_id: id, p_profile_id: target })

    // Failure cases first; none may change ownership.
    expect(await rpcError(transfer(owner.client, owner.id))).toEqual({
      code: 'P0001',
      message: 'campaign_transfer_self',
    })
    for (const target of [outsider.id, RANDOM_ID]) {
      expect(await rpcError(transfer(owner.client, target))).toEqual({
        code: 'P0001',
        message: 'campaign_transfer_target_unavailable',
      })
    }
    expect(await rpcError(transfer(guest.client, other.id))).toEqual({
      code: '42501',
      message: 'campaign_transfer_owner_required',
    })
    expect((await rpcError(transfer(anonymous, guest.id))).code).toBe('42501')
    expect((await rpcError(transfer(owner.client, null))).code).toBe('22023')
    expect(ownerOf(campaignId)).toBe(owner.id)

    // Direct writes stay denied.
    const ownerUpdate = await guest.client
      .from('campaigns')
      .update({ owner_id: guest.id } as never)
      .eq('id', campaignId)
    expect(ownerUpdate.error?.code).toBe('42501')
    const roleUpdate = await owner.client
      .from('campaign_members')
      .update({ role: 'member' } as never)
      .eq('campaign_id', campaignId)
    expect(roleUpdate.error?.code).toBe('42501')
    const memberDelete = await owner.client
      .from('campaign_members')
      .delete()
      .eq('campaign_id', campaignId)
    expect(memberDelete.error?.code).toBe('42501')
    expect(ownerOf(campaignId)).toBe(owner.id)

    await rpcOk(transfer(owner.client, guest.id))
    expect(ownerOf(campaignId)).toBe(guest.id)
    expect(invariantViolations(campaignId)).toBe('0')
    expect(await roster(guest.client, campaignId)).toEqual(
      expect.arrayContaining([
        `${guest.username}:owner`,
        `${owner.username}:member`,
        `${other.username}:member`,
      ]),
    )
    expect(
      localDatabaseQuery(
        `select count(*) from public.campaign_members where campaign_id = '${campaignId}' and role = 'owner';`,
        {},
      ),
    ).toBe('1')

    // The previous owner is now an ordinary member.
    const rename = await owner.client
      .from('campaigns')
      .update({ name: 'Hijacked' })
      .eq('id', campaignId)
      .select('id')
    expect(rename.data).toEqual([])
    const remove = await owner.client.from('campaigns').delete().eq('id', campaignId).select('id')
    expect(remove.data).toEqual([])
    expect(
      (
        await rpcError(
          owner.client.rpc('send_campaign_invitation', {
            p_campaign_id: campaignId,
            p_username: outsider.username,
          }),
        )
      ).code,
    ).toBe('42501')
    const oldOutgoing = await owner.client.rpc('list_campaign_outgoing_invitations', {
      p_campaign_id: campaignId,
    })
    expect(oldOutgoing.data).toEqual([])
    expect(await rpcError(transfer(owner.client, other.id))).toEqual({
      code: '42501',
      message: 'campaign_transfer_owner_required',
    })

    // The new owner can manage the campaign and the inherited pending invitation.
    const newName = await guest.client
      .from('campaigns')
      .update({ name: 'M1 transferred' })
      .eq('id', campaignId)
      .select('name')
    expect(newName.data).toEqual([{ name: 'M1 transferred' }])
    const inherited = await guest.client.rpc('list_campaign_outgoing_invitations', {
      p_campaign_id: campaignId,
    })
    expect(inherited.data).toHaveLength(1)
    await rpcOk(
      guest.client.rpc('cancel_campaign_invitation', { p_invitation_id: inherited.data[0].id }),
    )
    await rpcOk(
      guest.client.rpc('send_campaign_invitation', {
        p_campaign_id: campaignId,
        p_username: invitee.username,
      }),
    )
    expect(
      await rpcError(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId })),
    ).toEqual({
      code: 'P0001',
      message: 'campaign_leave_owner_must_transfer',
    })

    // The previous owner may now leave.
    await rpcOk(owner.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    expect(await canRead(owner.client, campaignId)).toEqual({ campaigns: 0, members: 0, roster: 0 })
    expect(invariantViolations(campaignId)).toBe('0')
  } finally {
    await cleanup(players, ids)
  }
})

test('concurrent membership changes serialize and keep exactly one owner', async () => {
  test.setTimeout(120_000)
  const { players } = await newPlayers(['owner', 'x', 'y'])
  const { owner, x, y } = players
  const ids: string[] = []
  const transfer = (client: Client, target: string, id: string) =>
    client.rpc('transfer_campaign_ownership', { p_campaign_id: id, p_profile_id: target })
  const fresh = async (name: string) => {
    const id = await createCampaign(owner, name)
    ids.push(id)
    await invite(owner, id, x)
    await invite(owner, id, y)
    return id
  }
  const messages = (results: { error: { message: string } | null }[]) =>
    results.map((result) => result.error?.message ?? 'ok').sort()

  try {
    // Two transfers to different members.
    let id = await fresh('M1 race transfers')
    let results = await Promise.all([
      transfer(owner.client, x.id, id),
      transfer(owner.client, y.id, id),
    ])
    expect(messages(results)).toEqual(['campaign_transfer_owner_required', 'ok'])
    expect(invariantViolations(id)).toBe('0')

    // Transfer to X while X leaves.
    id = await fresh('M1 race transfer-leave')
    results = await Promise.all([
      transfer(owner.client, x.id, id),
      x.client.rpc('leave_campaign', { p_campaign_id: id }),
    ])
    const outcome = messages(results)
    expect(outcome).toContain('ok')
    expect(
      outcome.includes('campaign_transfer_target_unavailable') ||
        outcome.includes('campaign_leave_owner_must_transfer'),
    ).toBe(true)
    expect(invariantViolations(id)).toBe('0')

    // Remove X while transferring to X.
    id = await fresh('M1 race remove-transfer')
    results = await Promise.all([
      owner.client.rpc('remove_campaign_member', { p_campaign_id: id, p_profile_id: x.id }),
      transfer(owner.client, x.id, id),
    ])
    const raced = messages(results)
    expect(raced).toContain('ok')
    expect(raced.filter((message) => message !== 'ok')).toHaveLength(1)
    expect(invariantViolations(id)).toBe('0')

    // Leave while the owner deletes the campaign.
    id = await fresh('M1 race leave-delete')
    const [left, deleted] = await Promise.all([
      x.client.rpc('leave_campaign', { p_campaign_id: id }),
      owner.client.from('campaigns').delete().eq('id', id),
    ])
    expect(deleted.error).toBeNull()
    expect([null, 'campaign_membership_unavailable']).toContain(left.error?.message ?? null)
    expect(
      localDatabaseQuery(
        `select count(*) from public.campaign_members where campaign_id = '${id}';`,
        {},
      ),
    ).toBe('0')
  } finally {
    await cleanup(players, ids)
  }
})

test('membership functions are executable only by authenticated users', () => {
  const grants = localDatabaseQuery(
    `select string_agg(f || ':' || r || ':' || has_function_privilege(r, f, 'execute'), E'\n' order by f, r)
     from unnest(array[
       'public.leave_campaign(uuid)',
       'public.remove_campaign_member(uuid, uuid)',
       'public.transfer_campaign_ownership(uuid, uuid)',
       'private.handle_campaign_member_departure(uuid, uuid)'
     ]) as f,
     unnest(array['anon', 'authenticated', 'service_role', 'public']) as r;`,
    {},
  )
  for (const line of grants.split('\n')) {
    const [fn, role, allowed] = line.split(':')
    const expected = fn.startsWith('public.') && role === 'authenticated'
    expect(allowed, line).toBe(String(expected))
  }
})
