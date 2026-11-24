import { expect, test } from '@playwright/test'
import {
  cleanup,
  createCampaign,
  invite,
  newPlayers,
  rpcOk,
  type Client,
  type Player,
} from './support/localPlayers.ts'

// M03.7 Phase 6: live updates for sheets, notes, and adventures. The database checks each
// subscriber's select policy against the changed row, so an event never carries what its
// subscriber could not read. Against the real local stack.

type Event = { table: string; type: string; row: Record<string, unknown> }
type Inbox = { events: Event[]; close: () => Promise<unknown> }

const settle = (ms = 1500) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(condition: () => boolean, ms = 8000) {
  const end = Date.now() + ms
  while (!condition() && Date.now() < end) await settle(100)
}

/** Listens to inserts and updates on these tables, as the app's campaign channel does. */
async function listen(
  client: Client,
  name: string,
  tables: { table: string; filter?: string }[],
): Promise<Inbox> {
  const events: Event[] = []
  let channel = client.channel(`live-test-${name}-${crypto.randomUUID()}`)
  for (const { table, filter } of tables) {
    for (const event of ['INSERT', 'UPDATE'] as const) {
      channel = channel.on(
        'postgres_changes',
        { event, schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload) =>
          events.push({
            table,
            type: payload.eventType,
            row: payload.new as Record<string, unknown>,
          }),
      )
    }
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} did not subscribe`)), 10000)
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer)
        resolve()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer)
        reject(error ?? new Error(`${name}: ${status}`))
      }
    })
  })
  // SUBSCRIBED arrives before the server has registered the filters.
  await settle(1000)
  return { events, close: () => client.removeChannel(channel) }
}

async function table() {
  const { players } = await newPlayers(['owner', 'member', 'outsider'])
  const campaignId = await createCampaign(players.owner, 'Live table')
  await invite(players.owner, campaignId, players.member)
  return {
    players,
    campaignId,
    owner: players.owner,
    member: players.member,
    outsider: players.outsider,
  }
}

async function character(player: Player, campaignId: string, name: string) {
  const { data, error } = await player.client.rpc('create_character', {
    p_campaign_id: campaignId,
    p_name: name,
    p_in_party: true,
  })
  expect(error?.message ?? null).toBeNull()
  return data as string
}

const idsOf = (inbox: Inbox, table: string, column = 'id') =>
  inbox.events.filter((event) => event.table === table).map((event) => event.row[column])

test.describe('catalog', () => {
  test('the live tables are published, with default replica identity', async () => {
    const { localDatabaseQuery } = await import('./support/localSupabase.ts')
    expect(
      localDatabaseQuery(
        `select string_agg(tablename, ',' order by tablename) from pg_publication_tables
         where pubname = 'supabase_realtime';`,
        {},
      ),
    ).toBe(
      'adventure_handoffs,adventure_objectives,adventure_participants,adventure_updates,adventures,campaign_overviews,character_resources,character_sheets,dice_rolls,notes',
    )
    expect(
      localDatabaseQuery(
        `select string_agg(distinct relreplident::text, ',') from pg_class
         where oid in ('public.character_sheets'::regclass, 'public.notes'::regclass,
                       'public.adventures'::regclass, 'public.adventure_updates'::regclass,
                       'public.character_resources'::regclass);`,
        {},
      ),
    ).toBe('d')
  })
})

test.describe('sheets', () => {
  test('a private sheet is heard by its owner only, and a shared one by members', async () => {
    const { players, campaignId, owner, member, outsider } = await table()
    const inboxes: Inbox[] = []
    try {
      const brand = await character(member, campaignId, 'Brand')
      const watch = [{ table: 'character_sheets' }]
      const ownerInbox = await listen(owner.client, 'owner', watch)
      const memberInbox = await listen(member.client, 'member', watch)
      const outsiderInbox = await listen(outsider.client, 'outsider', watch)
      inboxes.push(ownerInbox, memberInbox, outsiderInbox)

      // Private (the default): only the sheet's owner hears the change.
      await rpcOk(
        member.client.from('character_sheets').update({ current_hp: 11 }).eq('character_id', brand),
      )
      await waitFor(() => idsOf(memberInbox, 'character_sheets', 'character_id').includes(brand))
      await settle()
      expect(idsOf(memberInbox, 'character_sheets', 'character_id')).toEqual([brand])
      expect(idsOf(ownerInbox, 'character_sheets', 'character_id')).not.toContain(brand)
      expect(outsiderInbox.events).toEqual([])

      // Shared with the campaign: another member now hears it, an outsider still does not.
      await rpcOk(
        member.client.from('characters').update({ sheet_visibility: 'campaign' }).eq('id', brand),
      )
      await rpcOk(
        member.client.from('character_sheets').update({ current_hp: 7 }).eq('character_id', brand),
      )
      await waitFor(() => idsOf(ownerInbox, 'character_sheets', 'character_id').includes(brand))
      const heard = ownerInbox.events.find((event) => event.row.character_id === brand)
      expect(heard?.row.current_hp).toBe(7)
      expect(outsiderInbox.events).toEqual([])

      // Taking it back stops the events again.
      await rpcOk(
        member.client.from('characters').update({ sheet_visibility: 'private' }).eq('id', brand),
      )
      const before = ownerInbox.events.length
      await rpcOk(
        member.client.from('character_sheets').update({ current_hp: 5 }).eq('character_id', brand),
      )
      await settle(2500)
      expect(ownerInbox.events).toHaveLength(before)
    } finally {
      for (const inbox of inboxes) await inbox.close()
      await cleanup(players, [campaignId])
    }
  })
})

test.describe('resources', () => {
  test("a shared sheet's tracker updates reach members; a private one stays silent", async () => {
    const { players, campaignId, owner, member, outsider } = await table()
    const inboxes: Inbox[] = []
    try {
      const brand = await character(member, campaignId, 'Brand')
      const added = await member.client
        .from('character_resources')
        .insert({
          character_id: brand,
          kind: 'tracker',
          name: 'Ki',
          maximum: 3,
          current: 3,
          reset: 'short',
        })
        .select('id')
        .single()
      expect(added.error).toBeNull()
      const resourceId = added.data!.id

      const watch = [{ table: 'character_resources' }]
      const ownerInbox = await listen(owner.client, 'owner', watch)
      const memberInbox = await listen(member.client, 'member', watch)
      const outsiderInbox = await listen(outsider.client, 'outsider', watch)
      inboxes.push(ownerInbox, memberInbox, outsiderInbox)

      // Private: only the character's owner hears the tap.
      await rpcOk(
        member.client.rpc('adjust_character_resource', { p_resource_id: resourceId, p_delta: -1 }),
      )
      await waitFor(() => idsOf(memberInbox, 'character_resources').includes(resourceId))
      await settle()
      expect(ownerInbox.events).toEqual([])
      expect(outsiderInbox.events).toEqual([])

      // Shared: another member hears the next tap, with the new value; an outsider still does not.
      await rpcOk(
        member.client.from('characters').update({ sheet_visibility: 'campaign' }).eq('id', brand),
      )
      await rpcOk(
        member.client.rpc('adjust_character_resource', { p_resource_id: resourceId, p_delta: -1 }),
      )
      await waitFor(() => idsOf(ownerInbox, 'character_resources').includes(resourceId))
      const heard = ownerInbox.events.find((event) => event.row.id === resourceId)
      expect(heard?.row.current).toBe(1)
      expect(outsiderInbox.events).toEqual([])
    } finally {
      for (const inbox of inboxes) await inbox.close()
      await cleanup(players, [campaignId])
    }
  })
})

test.describe('notes', () => {
  test('a private note stays silent; a shared one is heard by members, not outsiders', async () => {
    const { players, campaignId, owner, member, outsider } = await table()
    const inboxes: Inbox[] = []
    try {
      const watch = [{ table: 'notes', filter: `campaign_id=eq.${campaignId}` }]
      const ownerInbox = await listen(owner.client, 'owner', watch)
      const memberInbox = await listen(member.client, 'member', watch)
      const outsiderInbox = await listen(outsider.client, 'outsider', watch)
      inboxes.push(ownerInbox, memberInbox, outsiderInbox)

      const insert = async (title: string, visibility: string) => {
        const { data, error } = await member.client
          .from('notes')
          .insert({ campaign_id: campaignId, title, visibility, body: 'text' })
          .select('id')
          .single()
        expect(error?.message ?? null).toBeNull()
        return data!.id as string
      }

      const secret = await insert('Secret', 'private')
      await waitFor(() => idsOf(memberInbox, 'notes').includes(secret))
      await settle()
      expect(idsOf(ownerInbox, 'notes')).toEqual([])

      const shared = await insert('Plan', 'campaign')
      await waitFor(() => idsOf(ownerInbox, 'notes').includes(shared))
      expect(idsOf(ownerInbox, 'notes')).toEqual([shared])

      await rpcOk(member.client.from('notes').update({ body: 'edited' }).eq('id', shared))
      await waitFor(() => ownerInbox.events.some((event) => event.type === 'UPDATE'))
      expect(ownerInbox.events.find((event) => event.type === 'UPDATE')?.row.id).toBe(shared)

      // Made private again: the owner hears no more, even about the edit that hides it.
      await rpcOk(member.client.from('notes').update({ visibility: 'private' }).eq('id', shared))
      await rpcOk(member.client.from('notes').update({ body: 'hidden edit' }).eq('id', shared))
      await settle(2500)
      expect(ownerInbox.events.filter((event) => event.type === 'UPDATE')).toHaveLength(1)

      expect(outsiderInbox.events).toEqual([])
    } finally {
      for (const inbox of inboxes) await inbox.close()
      await cleanup(players, [campaignId])
    }
  })
})

test.describe('adventures', () => {
  test('a personal adventure and its children stay with its participants; a main one is heard by all', async () => {
    const { players, campaignId, owner, member, outsider } = await table()
    const inboxes: Inbox[] = []
    try {
      const brand = await character(member, campaignId, 'Brand')
      const watch = [
        { table: 'adventures', filter: `campaign_id=eq.${campaignId}` },
        { table: 'adventure_participants', filter: `campaign_id=eq.${campaignId}` },
        { table: 'adventure_objectives' },
        { table: 'adventure_updates' },
      ]
      const ownerInbox = await listen(owner.client, 'owner', watch)
      const memberInbox = await listen(member.client, 'member', watch)
      const outsiderInbox = await listen(outsider.client, 'outsider', watch)
      inboxes.push(ownerInbox, memberInbox, outsiderInbox)

      // A personal adventure: its participant hears every part of it; the owner hears none.
      const personal = await member.client.rpc('create_adventure', {
        p_campaign_id: campaignId,
        p_type: 'personal',
        p_title: 'Find the heir',
        p_character_id: brand,
      })
      expect(personal.error?.message ?? null).toBeNull()
      const personalId = personal.data as string
      await rpcOk(
        member.client
          .from('adventure_objectives')
          .insert({ adventure_id: personalId, title: 'Ask' }),
      )
      await rpcOk(
        member.client
          .from('adventure_updates')
          .insert({ adventure_id: personalId, body: 'Asked.' }),
      )
      await waitFor(
        () =>
          idsOf(memberInbox, 'adventure_updates', 'adventure_id').includes(personalId) &&
          idsOf(memberInbox, 'adventure_objectives', 'adventure_id').includes(personalId),
      )
      expect(idsOf(memberInbox, 'adventures')).toContain(personalId)
      expect(idsOf(memberInbox, 'adventure_participants', 'adventure_id')).toContain(personalId)
      await settle()
      expect(ownerInbox.events).toEqual([])
      expect(outsiderInbox.events).toEqual([])

      // A main adventure belongs to the table: members hear it and its updates, outsiders do not.
      const main = await owner.client.rpc('create_adventure', {
        p_campaign_id: campaignId,
        p_type: 'main',
        p_title: 'The road north',
      })
      expect(main.error?.message ?? null).toBeNull()
      const mainId = main.data as string
      await waitFor(() => idsOf(memberInbox, 'adventures').includes(mainId))
      await rpcOk(
        owner.client
          .from('adventure_updates')
          .insert({ adventure_id: mainId, body: 'We set out.' }),
      )
      await waitFor(() => idsOf(memberInbox, 'adventure_updates', 'adventure_id').includes(mainId))
      expect(idsOf(ownerInbox, 'adventures')).toContain(mainId)
      await settle()
      expect(outsiderInbox.events).toEqual([])
      // Nothing about the personal adventure reached the owner.
      expect(
        ownerInbox.events.filter(
          (event) => event.row.id === personalId || event.row.adventure_id === personalId,
        ),
      ).toEqual([])
    } finally {
      for (const inbox of inboxes) await inbox.close()
      await cleanup(players, [campaignId])
    }
  })

  test('a handoff source is heard by the people who can read its adventure, and no one else', async () => {
    const { players, campaignId, owner, member, outsider } = await table()
    const inboxes: Inbox[] = []
    try {
      const brand = await character(member, campaignId, 'Brand')
      const watch = [{ table: 'adventure_handoffs', filter: `campaign_id=eq.${campaignId}` }]
      const ownerInbox = await listen(owner.client, 'owner', watch)
      const memberInbox = await listen(member.client, 'member', watch)
      const outsiderInbox = await listen(outsider.client, 'outsider', watch)
      inboxes.push(ownerInbox, memberInbox, outsiderInbox)

      // A private thread: only its participant hears the source.
      const personal = await member.client.rpc('create_adventure', {
        p_campaign_id: campaignId,
        p_type: 'personal',
        p_title: 'Find the heir',
        p_character_id: brand,
      })
      expect(personal.error?.message ?? null).toBeNull()
      const personalId = personal.data as string
      await rpcOk(
        member.client.rpc('attach_adventure_handoff', {
          p_adventure_id: personalId,
          p_expected: {},
          p_changes: {},
          p_source_text: 'A private recap',
        }),
      )
      await waitFor(() =>
        idsOf(memberInbox, 'adventure_handoffs', 'adventure_id').includes(personalId),
      )
      await settle()
      expect(ownerInbox.events).toEqual([])
      expect(outsiderInbox.events).toEqual([])

      // A new adventure started from a handoff, and a main one, reach the table as they should.
      const started = await member.client.rpc('create_adventure_from_handoff', {
        p_campaign_id: campaignId,
        p_type: 'main',
        p_character_id: null as unknown as string,
        p_changes: { details: { title: 'The road north' } },
        p_source_text: 'The first recap',
      })
      expect(started.error?.message ?? null).toBeNull()
      const mainId = started.data as string
      await waitFor(
        () =>
          idsOf(ownerInbox, 'adventure_handoffs', 'adventure_id').includes(mainId) &&
          idsOf(memberInbox, 'adventure_handoffs', 'adventure_id').includes(mainId),
      )
      expect(idsOf(ownerInbox, 'adventure_handoffs', 'adventure_id')).not.toContain(personalId)
      await settle()
      expect(outsiderInbox.events).toEqual([])
    } finally {
      for (const inbox of inboxes) await inbox.close()
      await cleanup(players, [campaignId])
    }
  })
})
