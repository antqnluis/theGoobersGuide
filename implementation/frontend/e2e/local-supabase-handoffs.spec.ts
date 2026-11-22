import { expect, test } from '@playwright/test'
import { localDatabaseQuery } from './support/localSupabase.ts'
import {
  cleanup,
  createCampaign,
  invite,
  newPlayers,
  PASSWORD,
  rpcError,
  rpcOk,
  type Player,
} from './support/localPlayers.ts'

// M03.9 Phase 1: adventure_handoffs, the handoff_id links, attach_adventure_handoff, and
// create_adventure_from_handoff against the real local stack. The plan is §3, §4, and §8.1.

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

function columnsWith(table: string, role: string, privilege: string) {
  return localDatabaseQuery(
    `select coalesce(string_agg(attname, ',' order by attname), '') from pg_attribute
     where attrelid = 'public.${table}'::regclass and attnum > 0 and not attisdropped
       and has_column_privilege('${role}', 'public.${table}', attname, '${privilege}');`,
    {},
  )
}

// --- Catalog and privileges -------------------------------------------------------------------

test.describe('catalog and privileges', () => {
  test('RLS, grants, helpers, policies, triggers, and the publication are exactly the planned set', () => {
    expect(
      localDatabaseQuery(
        `select relrowsecurity from pg_class where oid = 'public.adventure_handoffs'::regclass;`,
        {},
      ),
    ).toBe('t')

    for (const privilege of [
      'select',
      'insert',
      'update',
      'delete',
      'truncate',
      'references',
      'trigger',
    ]) {
      expect(
        holders((r) => `has_table_privilege(${r}, 'public.adventure_handoffs', '${privilege}')`),
        privilege,
      ).toBe(privilege === 'select' || privilege === 'delete' ? 'authenticated' : '')
    }
    expect(columnsWith('adventure_handoffs', 'authenticated', 'insert')).toBe('')
    expect(columnsWith('adventure_handoffs', 'authenticated', 'update')).toBe('')

    // The new link columns are readable but have no write grant (H9). The existing column grants
    // are unchanged.
    expect(columnsWith('adventure_objectives', 'authenticated', 'select')).toContain('handoff_id')
    expect(columnsWith('adventure_updates', 'authenticated', 'select')).toContain('handoff_id')
    expect(columnsWith('adventure_objectives', 'authenticated', 'insert')).toBe(
      'adventure_id,title',
    )
    expect(columnsWith('adventure_objectives', 'authenticated', 'update')).toBe('done,title')
    expect(columnsWith('adventure_updates', 'authenticated', 'insert')).toBe('adventure_id,body')
    expect(columnsWith('adventure_updates', 'authenticated', 'update')).toBe('')

    const executable = (signature: string) =>
      holders((r) => `has_function_privilege(${r}, '${signature}', 'execute')`)
    for (const signature of [
      'public.attach_adventure_handoff(uuid, jsonb, jsonb, text, text)',
      'public.create_adventure_from_handoff(uuid, text, uuid, jsonb, text, text)',
      // The invoker RPCs call these as the signed-in user. The private schema is not exposed.
      'private.lock_handoff_target(uuid)',
      'private.record_adventure_handoff(uuid, text, text, text, jsonb, integer, uuid[], uuid)',
      'private.handoff_changes_are_valid(jsonb, text)',
      'private.normalize_handoff_label(text)',
    ]) {
      expect(executable(signature), signature).toBe('authenticated')
    }
    expect(executable('private.guard_adventure_handoff_insert()')).toBe('')

    // Only the two RPCs are SECURITY INVOKER with a pinned search path; the two helpers that
    // lock and write are the only definers.
    const security = (signature: string) =>
      localDatabaseQuery(
        `select p.prosecdef::text || ':' || coalesce(array_to_string(p.proconfig, ','), '')
         from pg_proc as p where p.oid = '${signature}'::regprocedure;`,
        {},
      )
    for (const signature of [
      'public.attach_adventure_handoff(uuid, jsonb, jsonb, text, text)',
      'public.create_adventure_from_handoff(uuid, text, uuid, jsonb, text, text)',
    ]) {
      expect(security(signature), signature).toBe('false:search_path=""')
    }
    for (const signature of [
      'private.lock_handoff_target(uuid)',
      'private.record_adventure_handoff(uuid, text, text, text, jsonb, integer, uuid[], uuid)',
    ]) {
      expect(security(signature), signature).toBe('true:search_path=""')
    }

    expect(
      localDatabaseQuery(
        `select string_agg(policyname || ':' || cmd, ' | ' order by policyname) from pg_policies
         where schemaname = 'public' and tablename = 'adventure_handoffs';`,
        {},
      ),
    ).toBe('Importers delete their sources:DELETE | Readers see sources:SELECT')
    expect(
      localDatabaseQuery(
        `select string_agg(tgname, ',' order by tgname) from pg_trigger
         where tgrelid = 'public.adventure_handoffs'::regclass and not tgisinternal;`,
        {},
      ),
    ).toBe('adventure_handoffs_guard_insert')

    // H12: the link columns clear on deletion; sources go with the adventure.
    expect(
      localDatabaseQuery(
        `select string_agg(conrelid::regclass::text || ':' || confdeltype::text, ',' order by conrelid::regclass::text)
         from pg_constraint
         where confrelid = 'public.adventure_handoffs'::regclass and contype = 'f';`,
        {},
      ),
    ).toBe('adventure_objectives:n,adventure_updates:n')
    expect(
      localDatabaseQuery(
        `select confdeltype from pg_constraint where conname = 'adventure_handoffs_adventure_fkey';`,
        {},
      ),
    ).toBe('c')

    // H13.
    expect(
      localDatabaseQuery(
        `select count(*) from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public'
           and tablename = 'adventure_handoffs';`,
        {},
      ),
    ).toBe('1')
    expect(
      localDatabaseQuery(
        `select relreplident from pg_class where oid = 'public.adventure_handoffs'::regclass;`,
        {},
      ),
    ).toBe('d')
  })

  test('the RPCs and helpers refuse anonymous callers and are not reachable through the API', async () => {
    const { players } = await newPlayers(['anon_check'])
    const anonymous = (await import('./support/localSupabase.ts')).localClient()
    const errors = await Promise.all([
      anonymous.rpc('attach_adventure_handoff', {
        p_adventure_id: RANDOM_ADVENTURE,
        p_expected: {},
        p_changes: {},
        p_source_text: 'text',
      }),
      anonymous.rpc('create_adventure_from_handoff', {
        p_campaign_id: RANDOM_ADVENTURE,
        p_type: 'main',
        p_character_id: null,
        p_changes: { details: { title: 'x' } },
        p_source_text: 'text',
      }),
    ])
    for (const { error } of errors) expect(error).not.toBeNull()

    // The helpers live in the private schema, which the API does not expose.
    const { client } = players.anon_check
    for (const [name, args] of [
      ['lock_handoff_target', { p_adventure_id: RANDOM_ADVENTURE }],
      [
        'record_adventure_handoff',
        {
          p_adventure_id: RANDOM_ADVENTURE,
          p_kind: 'attach',
          p_source_text: 'text',
          p_source_label: null,
          p_applied: {},
          p_change_count: 0,
          p_objective_ids: [],
          p_update_id: null,
        },
      ],
    ] as const) {
      const viaApi = await client.rpc(name, args)
      expect(viaApi.error, name).not.toBeNull()
    }
    const unauthenticated = await anonymous.from('adventure_handoffs').select('id')
    expect(unauthenticated.error?.code).toBe('42501')
  })
})

const RANDOM_ADVENTURE = '00000000-0000-4000-8000-00000000dead'

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
  const campaignId = await createCampaign(typed.owner, 'M9 scene')
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

/** A personal adventure for one player. */
const personal = (scene: Scene, role: Role, title = 'The Drowned Bell') =>
  create(scene.players[role], scene.campaignId, 'personal', title, scene.chars[role])

/** A side adventure for `a` and `b`, with no sharing. */
async function sideThread(scene: Scene, title = 'The deal') {
  const { a, b } = scene.players
  const adventureId = await create(a, scene.campaignId, 'side', title, scene.chars.a)
  const proposed = await a.client.rpc('propose_adventure_participant', {
    p_adventure_id: adventureId,
    p_character_id: scene.chars.b,
  })
  expect(proposed.error?.message ?? null).toBeNull()
  await rpcOk(
    b.client.rpc('respond_to_adventure_invitation', {
      p_participant_id: proposed.data as string,
      p_accept: true,
    }),
  )
  return adventureId
}

interface Versions {
  adventure_updated_at: string
  objectives: Record<string, string>
}

/** The expected versions the review would send: the adventure and the targeted objectives. */
async function versions(player: Player, adventureId: string, targets: string[] = []) {
  const adventure = await player.client
    .from('adventures')
    .select('updated_at')
    .eq('id', adventureId)
    .single()
  expect(adventure.error).toBeNull()
  const objectives: Record<string, string> = {}
  for (const id of targets) {
    const row = await player.client
      .from('adventure_objectives')
      .select('updated_at')
      .eq('id', id)
      .single()
    expect(row.error).toBeNull()
    objectives[id] = row.data!.updated_at
  }
  return { adventure_updated_at: adventure.data!.updated_at, objectives } satisfies Versions
}

async function addObjective(player: Player, adventureId: string, title: string) {
  const { data, error } = await player.client
    .from('adventure_objectives')
    .insert({ adventure_id: adventureId, title })
    .select('id')
    .single()
  expect(error?.message ?? null).toBeNull()
  return data!.id
}

const SOURCE = '# Session 4\n\nThe party reached Saltmere.\r\n\tThe bell was stolen.'

function attach(
  player: Player,
  adventureId: string,
  expected: unknown,
  changes: unknown,
  source: string | null = SOURCE,
  label?: string | null,
) {
  return player.client.rpc('attach_adventure_handoff', {
    p_adventure_id: adventureId,
    p_expected: expected as never,
    p_changes: changes as never,
    p_source_text: source as string,
    ...(label === undefined ? {} : { p_source_label: label as string }),
  })
}

function startFromHandoff(
  player: Player,
  campaignId: string,
  type: string,
  characterId: string | null,
  changes: unknown,
  source: string | null = SOURCE,
  label?: string | null,
) {
  return player.client.rpc('create_adventure_from_handoff', {
    p_campaign_id: campaignId,
    p_type: type,
    p_character_id: characterId as string,
    p_changes: changes as never,
    p_source_text: source as string,
    ...(label === undefined ? {} : { p_source_label: label as string }),
  })
}

async function expectFail(
  call: PromiseLike<{ error: { code: string; message: string } | null }>,
  code: string,
  message: string,
) {
  expect(await rpcError(call)).toEqual({ code, message })
}

const invalid = (call: PromiseLike<{ error: { code: string; message: string } | null }>) =>
  expectFail(call, '22023', 'handoff_invalid')

async function sources(player: Player, adventureId: string) {
  const { data, error } = await player.client
    .from('adventure_handoffs')
    .select('id, kind, source_label, source_text, applied, change_count, imported_by')
    .eq('adventure_id', adventureId)
    .order('imported_at')
  expect(error).toBeNull()
  return data ?? []
}

/** What a fresh attach to this adventure left behind: sources, objectives, and updates. */
function footprint(adventureId: string) {
  return localDatabaseQuery(
    `select (select count(*) from public.adventure_handoffs where adventure_id = '${adventureId}')
        || ':' || (select count(*) from public.adventure_objectives where adventure_id = '${adventureId}')
        || ':' || (select count(*) from public.adventure_updates where adventure_id = '${adventureId}');`,
    {},
  )
}

function adventureRow(adventureId: string) {
  return JSON.parse(
    localDatabaseQuery(
      `select row_to_json(r) from (
         select type, visibility, status, title, description, next_step, reference, archived_at
         from public.adventures where id = '${adventureId}') r;`,
      {},
    ),
  ) as Record<string, string | null>
}

// --- Attach -----------------------------------------------------------------------------------

test.describe('attach_adventure_handoff', () => {
  test('applies details, objectives, and the update in one transaction and tags only new rows', async () => {
    const scene = await newScene()
    const { a } = scene.players
    try {
      const adventureId = await personal(scene, 'a')
      const rename = await addObjective(a, adventureId, 'Find the bell')
      const reopen = await addObjective(a, adventureId, 'Hold the ring')
      const complete = await addObjective(a, adventureId, 'Cross the marsh')
      const untouched = await addObjective(a, adventureId, 'Leave it alone')
      await rpcOk(
        a.client.from('adventure_objectives').update({ done: true }).eq('id', reopen) as never,
      )

      const expected = await versions(a, adventureId, [rename, reopen, complete])
      const { data: id, error } = await attach(
        a,
        adventureId,
        expected,
        {
          details: {
            title: 'The Drowned Bell, part two',
            status: 'in_progress',
            next_step: 'Saltmere',
          },
          objectives: {
            add: ['Recover the clapper', 'Ask the harbourmaster'],
            update: [
              { id: rename, title: 'Find the bell-ringer' },
              { id: reopen, done: false },
              { id: complete, done: true },
            ],
          },
          update: 'We reached Saltmere.',
        },
        SOURCE,
        '  session-4.md  ',
      )
      expect(error?.message ?? null).toBeNull()
      expect(id).toMatch(/^[0-9a-f-]{36}$/)

      expect(adventureRow(adventureId)).toMatchObject({
        title: 'The Drowned Bell, part two',
        status: 'in_progress',
        next_step: 'Saltmere',
        type: 'personal',
        visibility: 'participants',
      })

      // One source, with the label trimmed, CRLF normalised, and a correct summary.
      const [source] = await sources(a, adventureId)
      expect(source).toMatchObject({
        id,
        kind: 'attach',
        source_label: 'session-4.md',
        source_text: '# Session 4\n\nThe party reached Saltmere.\n\tThe bell was stolen.',
        change_count: 9,
        imported_by: a.id,
        applied: {
          fields: ['next_step', 'status', 'title'],
          objectives_added: 2,
          objectives_changed: 3,
          update: true,
        },
      })

      const objectives = await a.client
        .from('adventure_objectives')
        .select('id, title, done, handoff_id')
        .eq('adventure_id', adventureId)
      const byTitle = new Map((objectives.data ?? []).map((row) => [row.title, row]))
      expect(byTitle.get('Find the bell-ringer')).toMatchObject({ id: rename, done: false })
      expect(byTitle.get('Hold the ring')).toMatchObject({ id: reopen, done: false })
      expect(byTitle.get('Cross the marsh')).toMatchObject({ id: complete, done: true })
      expect(byTitle.get('Leave it alone')).toMatchObject({ id: untouched, done: false })
      // Only the rows the handoff created link to it.
      expect((objectives.data ?? []).filter((row) => row.handoff_id === id)).toHaveLength(2)
      expect(byTitle.get('Recover the clapper')!.handoff_id).toBe(id)
      expect(byTitle.get('Ask the harbourmaster')!.handoff_id).toBe(id)
      for (const title of [
        'Find the bell-ringer',
        'Hold the ring',
        'Cross the marsh',
        'Leave it alone',
      ])
        expect(byTitle.get(title)!.handoff_id, title).toBeNull()

      const updates = await a.client
        .from('adventure_updates')
        .select('body, author_id, handoff_id')
        .eq('adventure_id', adventureId)
      expect(updates.data).toEqual([
        { body: 'We reached Saltmere.', author_id: a.id, handoff_id: id },
      ])
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })

  test('a source-only attach records the source and changes nothing else', async () => {
    const scene = await newScene()
    const { a } = scene.players
    try {
      const adventureId = await personal(scene, 'a')
      await addObjective(a, adventureId, 'Find the bell')
      const before = await versions(a, adventureId)
      const rowBefore = adventureRow(adventureId)

      const { data: id, error } = await attach(a, adventureId, {}, {}, SOURCE, null)
      expect(error?.message ?? null).toBeNull()
      // The expected versions are ignored when nothing changes, so a stale or null value is fine.
      await rpcOk(attach(a, adventureId, null, {}, 'A second copy of the recap', 'recap'))

      expect(footprint(adventureId)).toBe('2:1:0')
      expect(await versions(a, adventureId)).toEqual(before)
      expect(adventureRow(adventureId)).toEqual(rowBefore)
      const found = await sources(a, adventureId)
      expect(found.map((row) => row.id)).toContain(id)
      expect(found[0]).toMatchObject({ change_count: 0, source_label: null })
      expect(found[0].applied).toEqual({
        fields: [],
        objectives_added: 0,
        objectives_changed: 0,
        update: false,
      })
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })

  test('a main adventure takes handoffs from any member, and every member reads the sources', async () => {
    const scene = await newScene()
    const { owner, a, b, c } = scene.players
    try {
      const adventureId = await create(owner, scene.campaignId, 'main', 'The campaign')
      await rpcOk(attach(b, adventureId, {}, {}, 'From b', 'b.md'))
      const expected = await versions(a, adventureId)
      await rpcOk(
        attach(
          a,
          adventureId,
          { ...expected },
          { objectives: { add: ['A shared goal'] } },
          'From a',
        ),
      )

      for (const player of [owner, a, b, c]) {
        expect((await sources(player, adventureId)).map((row) => row.source_text)).toEqual([
          'From b',
          'From a',
        ])
      }
      expect(footprint(adventureId)).toBe('2:1:0')
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })

  test('is refused for archived, unreadable, unknown, and departed targets', async () => {
    const scene = await newScene()
    const { owner, a, b, c, d } = scene.players
    try {
      const own = await personal(scene, 'a')
      const side = await sideThread(scene)
      const main = await create(owner, scene.campaignId, 'main', 'Everyone')

      // Archived: refused even for a source-only attach.
      await rpcOk(
        a.client
          .from('adventures')
          .update({ archived_at: new Date().toISOString() })
          .eq('id', own) as never,
      )
      await expectFail(attach(a, own, {}, {}), 'P0001', 'adventure_archived')
      await rpcOk(a.client.from('adventures').update({ archived_at: null }).eq('id', own) as never)
      await rpcOk(attach(a, own, {}, {}))

      // Not a participant: the campaign owner, another player, and an unknown id look the same.
      for (const [who, id] of [
        [owner, own],
        [b, own],
        [c, side],
        [a, RANDOM_ADVENTURE],
      ] as const) {
        await expectFail(attach(who, id, {}, {}), 'P0001', 'adventure_unavailable')
      }

      // A non-member never sees the campaign at all.
      const { players: strangers } = await newPlayers(['stranger'])
      await expectFail(attach(strangers.stranger, main, {}, {}), 'P0001', 'adventure_unavailable')

      // Departed members lose the main adventure and their old threads.
      await rpcOk(attach(d, main, {}, {}, 'Before leaving'))
      await rpcOk(d.client.rpc('leave_campaign', { p_campaign_id: scene.campaignId }))
      await expectFail(attach(d, main, {}, {}), 'P0001', 'adventure_unavailable')
      expect(await sources(d, main)).toEqual([])
      // Sources stay with the adventure (H12); the others still read them.
      expect((await sources(owner, main)).map((row) => row.source_text)).toEqual(['Before leaving'])
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })

  test('private threads hide sources from the campaign owner, invitees, and party readers until shared', async () => {
    const scene = await newScene()
    const { owner, a, b, c } = scene.players
    try {
      const side = await sideThread(scene)
      await rpcOk(attach(a, side, {}, {}, 'Private recap'))
      // c is invited but has not accepted.
      const proposed = await a.client.rpc('propose_adventure_participant', {
        p_adventure_id: side,
        p_character_id: scene.chars.c,
      })
      expect(proposed.error?.message ?? null).toBeNull()
      await rpcOk(
        b.client.rpc('approve_adventure_participant', {
          p_participant_id: proposed.data as string,
        }),
      )

      for (const player of [owner, c]) expect(await sources(player, side)).toEqual([])
      await expectFail(attach(c, side, {}, {}), 'P0001', 'adventure_unavailable')
      expect((await sources(b, side)).map((row) => row.source_text)).toEqual(['Private recap'])

      // Sharing with the party shows the sources to party readers, who still cannot write.
      for (const player of [a, b])
        await rpcOk(
          player.client.rpc('set_adventure_share_consent', {
            p_adventure_id: side,
            p_consent: true,
          }),
        )
      const party = await c.client.from('adventures').select('visibility').eq('id', side)
      expect(party.data).toEqual([{ visibility: 'party' }])
      // The invitation is still pending, so c reads only as a party reader.
      expect((await sources(c, side)).map((row) => row.source_text)).toEqual(['Private recap'])
      await expectFail(attach(c, side, {}, {}), 'P0001', 'adventure_unavailable')
      const deleted = await c.client.from('adventure_handoffs').delete().eq('adventure_id', side)
      expect(deleted.error).toBeNull()
      expect(await sources(a, side)).toHaveLength(1)
      // The owner is in the campaign but not the party, so they still read nothing.
      expect(await sources(owner, side)).toEqual([])

      // Withdrawing consent ends the share and the party loses the sources.
      await rpcOk(
        b.client.rpc('set_adventure_share_consent', { p_adventure_id: side, p_consent: false }),
      )
      expect(await sources(c, side)).toEqual([])
      expect(await sources(a, side)).toHaveLength(1)
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })
})

// --- Payload rules ----------------------------------------------------------------------------

test.describe('payload rules', () => {
  test('refuses forbidden keys, bad shapes, and missing expected versions without side effects', async () => {
    const scene = await newScene()
    const { a } = scene.players
    try {
      const adventureId = await personal(scene, 'a')
      const objective = await addObjective(a, adventureId, 'Find the bell')
      const expected = await versions(a, adventureId, [objective])
      const before = footprint(adventureId)
      const row = adventureRow(adventureId)

      const shapes: [string, unknown][] = [
        ['visibility', { details: { title: 'x' }, visibility: 'party' }],
        ['type in details', { details: { type: 'main' } }],
        ['visibility in details', { details: { visibility: 'campaign' } }],
        ['archived_at in details', { details: { archived_at: new Date().toISOString() } }],
        ['participants', { participants: [{ character_id: scene.chars.b }] }],
        ['consent', { share_consent: true }],
        ['unknown key', { notes: 'x' }],
        ['unknown objective key', { objectives: { add: ['x'], remove: [objective] } }],
        ['unknown op key', { objectives: { update: [{ id: objective, done: true, extra: 1 }] } }],
        ['array', []],
        ['string', 'details'],
        ['empty details', { details: {} }],
        ['numeric title', { details: { title: 5 } }],
        ['null description', { details: { description: null } }],
        ['empty objectives', { objectives: {} }],
        ['empty add', { objectives: { add: [] } }],
        ['non-string objective', { objectives: { add: [5] } }],
        ['bad id', { objectives: { update: [{ id: 'nope', done: true }] } }],
        ['op without change', { objectives: { update: [{ id: objective }] } }],
        ['non-boolean done', { objectives: { update: [{ id: objective, done: 'yes' }] } }],
        [
          'duplicate target',
          {
            objectives: {
              update: [
                { id: objective, done: true },
                { id: objective, title: 'x' },
              ],
            },
          },
        ],
        [
          'too many adds',
          { objectives: { add: Array.from({ length: 51 }, (_, n) => `Goal ${n}`) } },
        ],
        ['non-string update', { update: 7 }],
      ]
      for (const [label, changes] of shapes) {
        await invalid(attach(a, adventureId, expected, changes))
        expect(footprint(adventureId), label).toBe(before)
      }
      await invalid(attach(a, adventureId, expected, null))
      await invalid(attach(a, null as unknown as string, expected, {}))

      // Expected versions are required when anything changes, and must cover each target.
      const change = { details: { status: 'on_hold' } }
      for (const bad of [
        null,
        {},
        [],
        { adventure_updated_at: expected.adventure_updated_at },
        { adventure_updated_at: expected.adventure_updated_at, objectives: [] },
        { adventure_updated_at: 5, objectives: {} },
        { adventure_updated_at: 'not a date', objectives: {} },
        { ...expected, extra: true },
        { adventure_updated_at: expected.adventure_updated_at, objectives: { nope: 'x' } },
        { adventure_updated_at: expected.adventure_updated_at, objectives: { [objective]: 5 } },
      ]) {
        await invalid(attach(a, adventureId, bad, change))
      }
      await invalid(
        attach(
          a,
          adventureId,
          { adventure_updated_at: expected.adventure_updated_at, objectives: {} },
          { objectives: { update: [{ id: objective, done: true }] } },
        ),
      )

      expect(footprint(adventureId)).toBe(before)
      expect(adventureRow(adventureId)).toEqual(row)
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })

  test('maps database rule failures to handoff_values_invalid and rolls everything back', async () => {
    const scene = await newScene()
    const { a } = scene.players
    try {
      const adventureId = await personal(scene, 'a')
      const expected = await versions(a, adventureId)
      const before = footprint(adventureId)
      const row = adventureRow(adventureId)

      const cases: [string, unknown][] = [
        ['status', { details: { status: 'finished' } }],
        ['untrimmed title', { details: { title: ' padded ' } }],
        ['empty title', { details: { title: '' } }],
        ['long title', { details: { title: 'x'.repeat(121) } }],
        ['multi-line next step', { details: { next_step: 'a\nb' } }],
        ['long reference', { details: { reference: 'x'.repeat(281) } }],
        ['long description', { details: { description: 'x'.repeat(4001) } }],
        ['empty objective', { objectives: { add: [''] } }],
        ['long objective', { objectives: { add: ['x'.repeat(201)] } }],
        ['empty update', { update: '' }],
        ['long update', { update: 'x'.repeat(2001) }],
        // A valid change alongside the bad one must not survive.
        ['mixed', { details: { next_step: 'fine' }, objectives: { add: ['ok'] }, update: ' ' }],
      ]
      for (const [label, changes] of cases) {
        await expectFail(
          attach(a, adventureId, expected, changes),
          '22023',
          'handoff_values_invalid',
        )
        expect(footprint(adventureId), label).toBe(before)
        expect(adventureRow(adventureId), label).toEqual(row)
      }
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })

  test('validates the source text and label', async () => {
    const scene = await newScene()
    const { a } = scene.players
    try {
      const adventureId = await personal(scene, 'a')
      const failure = (source: string | null, label?: string | null) =>
        expectFail(attach(a, adventureId, {}, {}, source, label), '22023', 'handoff_source_invalid')

      await failure('')
      await failure('   \n\t ')
      await failure(null)
      await failure('x'.repeat(65537))
      await failure('é'.repeat(32769)) // 65,538 bytes
      await failure('bell\u0001')
      await failure('bell\u007f')
      await failure('ok', 'x'.repeat(121))
      await failure('ok', 'two\nlines')
      await failure('ok', 'tab\there')
      expect(footprint(adventureId)).toBe('0:0:0')

      // The boundary sizes and multi-byte text are accepted; a blank label is stored as null.
      await rpcOk(attach(a, adventureId, {}, {}, 'x'.repeat(65536), 'y'.repeat(120)))
      await rpcOk(attach(a, adventureId, {}, {}, 'é'.repeat(32768), '   '))
      await rpcOk(attach(a, adventureId, {}, {}, 'Line one\r\nLine two\rLine three\n\tTabbed'))
      const stored = await sources(a, adventureId)
      expect(stored.map((row) => row.source_label)).toEqual(['y'.repeat(120), null, null])
      expect(stored[2].source_text).toBe('Line one\nLine two\nLine three\n\tTabbed')
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })

  test('clients cannot write handoff_id, sources, or tag rows they did not create', async () => {
    const scene = await newScene()
    const { a, b } = scene.players
    try {
      const adventureId = await create(a, scene.campaignId, 'main', 'Shared story')
      const mine = await addObjective(a, adventureId, 'Written earlier')
      const theirs = await addObjective(b, adventureId, 'Written by b')
      const { data: sourceId } = await attach(a, adventureId, {}, {}, 'Source')

      // No client grant on the link columns or the table.
      const direct = await a.client
        .from('adventure_objectives')
        .update({ handoff_id: sourceId })
        .eq('id', mine)
      expect(direct.error?.code).toBe('42501')
      const insertedLink = await a.client
        .from('adventure_objectives')
        .insert({ adventure_id: adventureId, title: 'x', handoff_id: sourceId } as never)
      expect(insertedLink.error?.code).toBe('42501')
      const insertedUpdate = await a.client
        .from('adventure_updates')
        .insert({ adventure_id: adventureId, body: 'x', handoff_id: sourceId } as never)
      expect(insertedUpdate.error?.code).toBe('42501')
      const insertedSource = await a.client.from('adventure_handoffs').insert({
        adventure_id: adventureId,
        campaign_id: scene.campaignId,
        kind: 'attach',
        source_text: 'forged',
        change_count: 0,
      })
      expect(insertedSource.error?.code).toBe('42501')
      const updatedSource = await a.client
        .from('adventure_handoffs')
        .update({ source_text: 'edited' })
        .eq('id', sourceId as string)
      expect(updatedSource.error?.code).toBe('42501')

      // The record helper tags only rows the caller created in the same transaction, so rows
      // that exist already (the caller's own earlier row or someone else's) are never tagged.
      const claims = `{"sub":"${a.id}","role":"authenticated"}`
      const tagged = localDatabaseQuery(
        `begin;
         select set_config('request.jwt.claims', '${claims}', true);
         set local role authenticated;
         select private.record_adventure_handoff(
           '${adventureId}', 'attach', 'Tagging attempt', null, '{}', 0,
           array['${mine}', '${theirs}']::uuid[], null);
         reset role;
         select count(*) from public.adventure_objectives
           where adventure_id = '${adventureId}' and handoff_id is not null;
         rollback;`,
        {},
      )
      expect(tagged.split('\n').pop()).toBe('0')
      expect(
        count(
          `select count(*) from public.adventure_objectives
           where adventure_id = '${adventureId}' and handoff_id is not null;`,
        ),
      ).toBe(0)
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })
})

// --- Conflicts and caps -----------------------------------------------------------------------

test.describe('conflicts and caps', () => {
  test('an edit during review fails the whole apply and leaves nothing behind', async () => {
    const scene = await newScene()
    const { a, b } = scene.players
    try {
      const adventureId = await sideThread(scene)
      const objective = await addObjective(a, adventureId, 'Find the bell')
      const expected = await versions(a, adventureId, [objective])
      const before = footprint(adventureId)
      const changes = {
        details: { status: 'in_progress' },
        objectives: { add: ['New goal'], update: [{ id: objective, done: true }] },
        update: 'Recap',
      }

      // The other player edits the adventure's details.
      await rpcOk(
        b.client
          .from('adventures')
          .update({ next_step: 'Somewhere else' })
          .eq('id', adventureId) as never,
      )
      await expectFail(attach(a, adventureId, expected, changes), 'P0001', 'handoff_conflict')
      expect(footprint(adventureId)).toBe(before)
      expect(adventureRow(adventureId).status).toBe('pending')

      // Reloaded versions pass, until the targeted objective moves.
      const reloaded = await versions(a, adventureId, [objective])
      await rpcOk(
        b.client
          .from('adventure_objectives')
          .update({ title: 'Find the bell tower' })
          .eq('id', objective) as never,
      )
      await expectFail(attach(a, adventureId, reloaded, changes), 'P0001', 'handoff_conflict')
      expect(footprint(adventureId)).toBe(before)
      const stillThere = await a.client
        .from('adventure_objectives')
        .select('title, done')
        .eq('id', objective)
        .single()
      expect(stillThere.data).toEqual({ title: 'Find the bell tower', done: false })

      await rpcOk(attach(a, adventureId, await versions(a, adventureId, [objective]), changes))
      expect(footprint(adventureId)).toBe('1:2:1')
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })

  test('an objective from another adventure or a deleted objective fails and changes nothing', async () => {
    const scene = await newScene()
    const { a, b } = scene.players
    try {
      const adventureId = await personal(scene, 'a')
      const other = await create(b, scene.campaignId, 'personal', 'Elsewhere', scene.chars.b)
      const foreign = await addObjective(b, other, 'Not yours')
      const gone = await addObjective(a, adventureId, 'Soon deleted')
      const stamp = await versions(a, adventureId)
      const foreignStamp = await versions(b, other, [foreign])
      const goneStamp = await versions(a, adventureId, [gone])
      await rpcOk(a.client.from('adventure_objectives').delete().eq('id', gone) as never)
      const before = footprint(adventureId)

      const withExpected = (id: string, versionsFor: Versions): [unknown, unknown] => [
        { adventure_updated_at: stamp.adventure_updated_at, objectives: versionsFor.objectives },
        {
          details: { status: 'on_hold' },
          objectives: { update: [{ id, done: true }] },
          update: 'x',
        },
      ]
      for (const [id, versionsFor] of [
        [foreign, foreignStamp],
        [gone, goneStamp],
      ] as const) {
        const [expected, changes] = withExpected(id, versionsFor)
        await expectFail(attach(a, adventureId, expected, changes), 'P0001', 'handoff_conflict')
        expect(footprint(adventureId)).toBe(before)
      }
      expect(adventureRow(adventureId).status).toBe('pending')
      const untouched = await b.client
        .from('adventure_objectives')
        .select('done')
        .eq('id', foreign)
        .single()
      expect(untouched.data).toEqual({ done: false })
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })

  test('concurrent handoffs on the same versions apply once and conflict once', async () => {
    const scene = await newScene()
    const { a, b } = scene.players
    try {
      const adventureId = await sideThread(scene)
      const expected = await versions(a, adventureId)
      const results = await Promise.all([
        attach(a, adventureId, expected, { details: { next_step: 'From a' }, update: 'a' }, 'A'),
        attach(b, adventureId, expected, { details: { next_step: 'From b' }, update: 'b' }, 'B'),
      ])
      const failures = results.filter((result) => result.error)
      expect(failures).toHaveLength(1)
      expect(failures[0].error!.message).toBe('handoff_conflict')
      expect(footprint(adventureId)).toBe('1:0:1')
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })

  test('a handoff racing a departure either lands before it or is refused after it', async () => {
    const scene = await newScene()
    const { owner, b } = scene.players
    try {
      const main = await create(owner, scene.campaignId, 'main', 'The campaign')
      const [attached, left] = await Promise.all([
        attach(b, main, {}, {}, 'Racing'),
        b.client.rpc('leave_campaign', { p_campaign_id: scene.campaignId }),
      ])
      expect(left.error?.message ?? null).toBeNull()
      if (attached.error) expect(attached.error.message).toBe('adventure_unavailable')
      expect((await sources(owner, main)).length).toBe(attached.error ? 0 : 1)
      await expectFail(attach(b, main, {}, {}), 'P0001', 'adventure_unavailable')
      expect(await sources(b, main)).toEqual([])
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })

  test('the 51st source and objectives past 50 roll back the whole import', async () => {
    const scene = await newScene()
    const { a } = scene.players
    try {
      const adventureId = await personal(scene, 'a')
      const insertSources = (n: number) =>
        localDatabaseQuery(
          `insert into public.adventure_handoffs (adventure_id, campaign_id, imported_by, kind, source_text, change_count)
           select '${adventureId}', '${scene.campaignId}', '${a.id}', 'attach', 'filler ' || g, 0
           from generate_series(1, ${n}) g;`,
          {},
        )
      insertSources(49)
      await rpcOk(attach(a, adventureId, {}, {}, 'The 50th'))
      expect(
        count(
          `select count(*) from public.adventure_handoffs where adventure_id = '${adventureId}';`,
        ),
      ).toBe(50)
      const expected = await versions(a, adventureId)
      await expectFail(
        attach(a, adventureId, expected, { objectives: { add: ['x'] }, update: 'x' }),
        'P0001',
        'handoff_limit_reached',
      )
      expect(footprint(adventureId)).toBe('50:0:0')

      // Objective cap: 49 exist, so a handoff adding two fails as a whole.
      const capped = await personal(scene, 'b', 'Crowded')
      localDatabaseQuery(
        `insert into public.adventure_objectives (adventure_id, title, created_by)
         select '${capped}', 'Goal ' || g, '${scene.players.b.id}' from generate_series(1, 49) g;`,
        {},
      )
      const cappedExpected = await versions(scene.players.b, capped)
      await expectFail(
        attach(scene.players.b, capped, cappedExpected, {
          details: { status: 'on_hold' },
          objectives: { add: ['One', 'Two'] },
          update: 'Recap',
        }),
        'P0001',
        'adventure_objective_limit_reached',
      )
      expect(footprint(capped)).toBe('0:49:0')
      expect(adventureRow(capped).status).toBe('pending')
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })
})

// --- Deleting sources -------------------------------------------------------------------------

test.describe('deleting sources', () => {
  test('only the importer deletes, only while editable, and linked rows keep their content', async () => {
    const scene = await newScene()
    const { a, b, c } = scene.players
    try {
      const adventureId = await sideThread(scene)
      const expected = await versions(a, adventureId)
      const { data: sourceId } = await attach(
        a,
        adventureId,
        expected,
        { objectives: { add: ['Kept goal'] }, update: 'Kept update' },
        'Importer recap',
        'recap.md',
      )
      const remaining = async () => (await sources(a, adventureId)).length

      // Another participant, a stranger to the thread, and the owner cannot delete it.
      for (const player of [b, c, scene.players.owner]) {
        const result = await player.client
          .from('adventure_handoffs')
          .delete()
          .eq('id', sourceId as string)
        expect(result.error).toBeNull()
        expect(await remaining()).toBe(1)
      }

      // Archived adventures are read-only, so the importer cannot delete there either.
      await rpcOk(
        a.client
          .from('adventures')
          .update({ archived_at: new Date().toISOString() })
          .eq('id', adventureId) as never,
      )
      await a.client
        .from('adventure_handoffs')
        .delete()
        .eq('id', sourceId as string)
      expect(await remaining()).toBe(1)
      await rpcOk(
        a.client.from('adventures').update({ archived_at: null }).eq('id', adventureId) as never,
      )

      const deleted = await a.client
        .from('adventure_handoffs')
        .delete()
        .eq('id', sourceId as string)
        .select('id')
      expect(deleted.data).toEqual([{ id: sourceId }])
      expect(await remaining()).toBe(0)

      const objective = await a.client
        .from('adventure_objectives')
        .select('title, handoff_id')
        .eq('adventure_id', adventureId)
      expect(objective.data).toEqual([{ title: 'Kept goal', handoff_id: null }])
      const update = await a.client
        .from('adventure_updates')
        .select('body, handoff_id')
        .eq('adventure_id', adventureId)
      expect(update.data).toEqual([{ body: 'Kept update', handoff_id: null }])
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })

  test('deleting an account removes its sources, and the campaign takes the rest', async () => {
    const scene = await newScene()
    const { owner, a, b } = scene.players
    const adventureId = await sideThread(scene)
    const { data: sourceId } = await attach(
      b,
      adventureId,
      await versions(b, adventureId),
      { objectives: { add: ['Goal from b'] } },
      "b's recap",
    )
    await rpcOk(attach(a, adventureId, {}, {}, "a's recap"))
    const link = () =>
      localDatabaseQuery(
        `select coalesce(handoff_id::text, 'none') from public.adventure_objectives
         where adventure_id = '${adventureId}';`,
        {},
      )
    expect(link()).toBe(sourceId)

    // H12: the importer's sources cascade with the profile; the objective stays, unlinked.
    localDatabaseQuery(`delete from auth.users where id = '${b.id}';`, {})
    expect(
      count(
        `select count(*) from public.adventure_handoffs where adventure_id = '${adventureId}';`,
      ),
    ).toBe(1)
    expect(link()).toBe('none')

    // Deleting the campaign deletes its adventures and their sources.
    await cleanup({ owner, a }, scene.ids)
    expect(
      count(
        `select count(*) from public.adventure_handoffs where campaign_id = '${scene.campaignId}';`,
      ),
    ).toBe(0)
  })
})

// --- New adventure from a handoff -------------------------------------------------------------

test.describe('create_adventure_from_handoff', () => {
  test('creates a private personal adventure with objectives, an update, and its source', async () => {
    const scene = await newScene()
    const { owner, a, b } = scene.players
    try {
      const { data: id, error } = await startFromHandoff(
        a,
        scene.campaignId,
        'personal',
        scene.chars.a,
        {
          details: {
            title: 'The Drowned Bell',
            status: 'in_progress',
            next_step: 'Go to Saltmere',
            reference: 'Maren Vos',
            description: 'A bell is missing.\nSomeone took it.',
          },
          objectives: { add: ['Recover the clapper', 'Ask Maren'] },
          update: 'We began.',
        },
        SOURCE,
        'session-1.md',
      )
      expect(error?.message ?? null).toBeNull()
      const adventureId = id as string

      expect(adventureRow(adventureId)).toMatchObject({
        type: 'personal',
        visibility: 'participants',
        status: 'in_progress',
        title: 'The Drowned Bell',
        next_step: 'Go to Saltmere',
        reference: 'Maren Vos',
        description: 'A bell is missing.\nSomeone took it.',
        archived_at: null,
      })
      const participants = await a.client
        .from('adventure_participants')
        .select('profile_id, status')
        .eq('adventure_id', adventureId)
      expect(participants.data).toEqual([{ profile_id: a.id, status: 'accepted' }])

      const [source] = await sources(a, adventureId)
      expect(source).toMatchObject({
        kind: 'new',
        source_label: 'session-1.md',
        change_count: 8,
        applied: {
          fields: ['description', 'next_step', 'reference', 'status', 'title'],
          objectives_added: 2,
          objectives_changed: 0,
          update: true,
        },
      })
      const objectives = await a.client
        .from('adventure_objectives')
        .select('title, handoff_id')
        .eq('adventure_id', adventureId)
        .order('created_at')
      expect(objectives.data).toEqual([
        { title: 'Recover the clapper', handoff_id: source.id },
        { title: 'Ask Maren', handoff_id: source.id },
      ])
      const updates = await a.client
        .from('adventure_updates')
        .select('handoff_id')
        .eq('adventure_id', adventureId)
      expect(updates.data).toEqual([{ handoff_id: source.id }])

      // Private: nobody else reads the adventure or its sources.
      for (const player of [owner, b]) {
        expect(await sources(player, adventureId)).toEqual([])
        const row = await player.client.from('adventures').select('id').eq('id', adventureId)
        expect(row.data).toEqual([])
      }
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })

  test('creates side and main adventures, with a title alone being enough', async () => {
    const scene = await newScene()
    const { owner, a, b, c } = scene.players
    try {
      const side = await startFromHandoff(a, scene.campaignId, 'side', scene.chars.a, {
        details: { title: 'Side hustle' },
      })
      expect(side.error?.message ?? null).toBeNull()
      expect(adventureRow(side.data as string)).toMatchObject({
        type: 'side',
        visibility: 'participants',
        status: 'pending',
      })
      const [sideSource] = await sources(a, side.data as string)
      expect(sideSource).toMatchObject({ kind: 'new', change_count: 1, source_label: null })

      const main = await startFromHandoff(b, scene.campaignId, 'main', null, {
        details: { title: 'The campaign', status: 'on_hold' },
        update: 'Opening recap',
      })
      expect(main.error?.message ?? null).toBeNull()
      expect(adventureRow(main.data as string)).toMatchObject({
        type: 'main',
        visibility: 'campaign',
        status: 'on_hold',
      })
      for (const player of [owner, a, b, c])
        expect(await sources(player, main.data as string)).toHaveLength(1)
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })

  test('refuses bad input, other rules, and non-members, and creates nothing', async () => {
    const scene = await newScene()
    const { a } = scene.players
    const adventures = () =>
      count(`select count(*) from public.adventures where campaign_id = '${scene.campaignId}';`)
    const handoffs = () =>
      count(
        `select count(*) from public.adventure_handoffs where campaign_id = '${scene.campaignId}';`,
      )
    try {
      const okDetails = { details: { title: 'Fine' } }
      const forbidden: [string, unknown][] = [
        ['no title', { details: { status: 'pending' } }],
        ['no details', { update: 'only an update' }],
        ['empty', {}],
        ['numeric title', { details: { title: 7 } }],
        ['visibility', { ...okDetails, visibility: 'party' }],
        ['type', { details: { title: 'Fine', type: 'main' } }],
        ['participants', { ...okDetails, participants: [] }],
        [
          'update op',
          { ...okDetails, objectives: { update: [{ id: RANDOM_ADVENTURE, done: true }] } },
        ],
        [
          'too many objectives',
          { ...okDetails, objectives: { add: Array.from({ length: 51 }, (_, n) => `G${n}`) } },
        ],
      ]
      for (const [label, changes] of forbidden) {
        await invalid(startFromHandoff(a, scene.campaignId, 'side', scene.chars.a, changes))
        expect(adventures(), label).toBe(0)
      }
      await invalid(startFromHandoff(a, scene.campaignId, 'side', scene.chars.a, null))
      await invalid(
        startFromHandoff(a, null as unknown as string, 'side', scene.chars.a, okDetails),
      )

      // Whole-import failures from the database leave no adventure behind.
      await expectFail(
        startFromHandoff(a, scene.campaignId, 'side', scene.chars.a, {
          details: { title: 'Fine', status: 'finished' },
          objectives: { add: ['x'] },
        }),
        '22023',
        'handoff_values_invalid',
      )
      await expectFail(
        startFromHandoff(a, scene.campaignId, 'side', scene.chars.a, { ...okDetails, update: ' ' }),
        '22023',
        'handoff_values_invalid',
      )
      await expectFail(
        startFromHandoff(a, scene.campaignId, 'side', scene.chars.a, okDetails, ''),
        '22023',
        'handoff_source_invalid',
      )
      await expectFail(
        startFromHandoff(
          a,
          scene.campaignId,
          'side',
          scene.chars.a,
          okDetails,
          SOURCE,
          'x'.repeat(121),
        ),
        '22023',
        'handoff_source_invalid',
      )
      await expectFail(
        startFromHandoff(a, scene.campaignId, 'side', scene.chars.a, {
          details: { title: 'x'.repeat(121) },
        }),
        '22023',
        'adventure_title_invalid',
      )

      // The existing create rules pass through unchanged.
      await expectFail(
        startFromHandoff(a, scene.campaignId, 'side', null, okDetails),
        '22023',
        'adventure_character_required',
      )
      await expectFail(
        startFromHandoff(a, scene.campaignId, 'main', scene.chars.a, okDetails),
        '22023',
        'adventure_main_has_no_participants',
      )
      await expectFail(
        startFromHandoff(a, scene.campaignId, 'epic', null, okDetails),
        '22023',
        'adventure_type_invalid',
      )
      // Someone else's character, and a non-member.
      await expectFail(
        startFromHandoff(a, scene.campaignId, 'side', scene.chars.b, okDetails),
        'P0001',
        'adventure_character_unavailable',
      )
      const { players: strangers } = await newPlayers(['outsider'])
      await expectFail(
        startFromHandoff(strangers.outsider, scene.campaignId, 'main', null, okDetails),
        'P0001',
        'adventure_campaign_unavailable',
      )

      expect(adventures()).toBe(0)
      expect(handoffs()).toBe(0)
    } finally {
      await cleanup(scene.players, scene.ids)
    }
  })
})

// --- The real UI against the real stack ---------------------------------------------------------

test('a player imports a handoff into an adventure and starts another from one, and the labels survive a refresh', async ({
  browser,
}) => {
  test.setTimeout(150_000)
  const scene = await newScene()
  const { a } = scene.players
  const adventureId = await personal(scene, 'a', 'The Drowned Bell')
  await addObjective(a, adventureId, 'Find the bell')

  const source = '# Session 4\n\nThe party reached Saltmere.\nThe <b>bell</b> was stolen.'
  const attachDocument = JSON.stringify({
    format: 'the-goobers-guide-adventure-handoff',
    version: 1,
    proposal: {
      next_step: 'Talk to Maren',
      objectives: [{ op: 'add', title: 'Recover the clapper' }],
      update: 'We reached Saltmere.',
    },
  })
  const startDocument = JSON.stringify({
    format: 'the-goobers-guide-adventure-handoff',
    version: 1,
    proposal: {
      title: 'The Salt Road',
      status: 'in_progress',
      objectives: [{ op: 'add', title: 'Cross the marsh' }],
    },
  })

  // Light on resources: one context, reduced motion, no screenshots or video.
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  try {
    const page = await context.newPage()
    await page.goto('/login')
    await page.getByLabel('Username or email').fill(`${a.username}@example.com`)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/campaigns$/)

    const openBoard = async () => {
      await page.goto(`/app/campaigns/${scene.campaignId}`)
      await page
        .getByRole('list', { name: 'Camp places' })
        .getByRole('button', { name: /^Adventures/ })
        .click()
      const dialog = page.getByRole('dialog', { name: 'Adventures' })
      await expect(dialog).toBeVisible()
      return dialog
    }

    // Attach: paste the handoff and the assistant's answer, choose two changes, apply.
    let board = await openBoard()
    await board
      .getByRole('button', { name: /The Drowned Bell/ })
      .first()
      .click()
    await expect(board.getByRole('heading', { level: 3, name: 'The Drowned Bell' })).toBeVisible()
    await expect(board.getByText('No handoffs yet.')).toBeVisible()

    await board.getByRole('button', { name: 'Import handoff' }).click()
    const importer = page.getByRole('dialog', { name: 'Import handoff' })
    await importer.getByLabel('1. The handoff text').fill(source)
    await importer.getByLabel(/Source label/).fill('session-4.md')
    await importer.getByText('2. Copy the prompt').click()
    await expect(importer.getByLabel('Handoff prompt')).toHaveValue(/The Drowned Bell/)
    await importer.getByLabel('3. The assistant’s answer (JSON)').fill(attachDocument)
    await expect(importer.getByRole('region', { name: 'Review' })).toBeVisible()
    await importer.getByRole('checkbox', { name: 'New objective: Recover the clapper' }).check()
    await importer.getByRole('checkbox', { name: 'Progress update' }).check()
    await importer.getByRole('button', { name: 'Apply 2 changes' }).click()
    await expect(importer).toBeHidden()
    await expect(board.getByText('Handoff saved — 2 changes applied.')).toBeVisible()

    // The next step was not chosen, so it stays; the two chosen changes are in.
    await expect
      .poll(() =>
        localDatabaseQuery(
          `select (select next_step from public.adventures where id = '${adventureId}')
             || '|' || (select count(*) from public.adventure_handoffs where adventure_id = '${adventureId}')
             || '|' || (select count(*) from public.adventure_objectives
                        where adventure_id = '${adventureId}' and handoff_id is not null)
             || '|' || (select count(*) from public.adventure_updates
                        where adventure_id = '${adventureId}' and handoff_id is not null);`,
          {},
        ),
      )
      .toBe('|1|1|1')

    // After a refresh the source and the labels are still there, and the source is plain text.
    board = await openBoard()
    await board
      .getByRole('button', { name: /The Drowned Bell/ })
      .first()
      .click()
    const sources = board.getByRole('region', { name: 'Sources' })
    await expect(sources).toContainText('session-4.md')
    await expect(sources).toContainText('1 objective added. 1 progress update posted.')
    await expect(board.getByText('From handoff: session-4.md')).toHaveCount(2)
    await sources.getByRole('button', { name: 'Show source' }).click()
    const text = sources.getByRole('region', { name: 'Source text: session-4.md' })
    await expect(text).toContainText('The <b>bell</b> was stolen.')
    await expect(text.locator('b')).toHaveCount(0)

    // Start from a handoff: a new personal adventure with its own source and labels.
    await board.getByRole('button', { name: 'Back to adventures' }).click()
    await board.getByRole('button', { name: 'Start from a handoff' }).click()
    const starter = page.getByRole('dialog', { name: 'Start from a handoff' })
    await starter.getByLabel('1. The handoff text').fill('Recap of the salt road.')
    await starter.getByLabel(/Source label/).fill('road.md')
    await starter.getByLabel('3. The assistant’s answer (JSON)').fill(startDocument)
    await expect(starter.getByLabel('Status of the new adventure')).toHaveValue('pending')
    await starter.getByLabel('Status of the new adventure').selectOption('in_progress')
    await starter.getByRole('button', { name: 'Create adventure with 3 changes' }).click()
    await expect(starter).toBeHidden()
    await expect(board.getByRole('heading', { level: 3, name: 'The Salt Road' })).toBeVisible()
    await expect(board.getByText('From handoff: road.md')).toBeVisible()
    await expect(board.getByRole('region', { name: 'Sources' })).toContainText('road.md')

    expect(
      localDatabaseQuery(
        `select a.type || '|' || a.visibility || '|' || a.status || '|'
                || (select count(*) from public.adventure_participants p where p.adventure_id = a.id)
                || '|' || (select kind from public.adventure_handoffs h where h.adventure_id = a.id)
           from public.adventures a
          where a.campaign_id = '${scene.campaignId}' and a.title = 'The Salt Road';`,
        {},
      ),
    ).toBe('personal|participants|in_progress|1|new')
  } finally {
    // A failure while closing must not leave the campaign behind for other specs to trip over.
    await context.close().catch(() => undefined)
    await cleanup(scene.players, scene.ids)
  }
})
