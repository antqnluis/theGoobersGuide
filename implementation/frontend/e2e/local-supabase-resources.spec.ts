import { expect, test } from '@playwright/test'
import { localClient, localDatabaseQuery, sqlError } from './support/localSupabase.ts'
import {
  cleanup,
  createCampaign,
  invite,
  newPlayers,
  rpcError,
  rpcOk,
  type Player,
} from './support/localPlayers.ts'

// M04 live resources: status columns and the body revision (Phase 1), against the local stack.

const FIXTURE_OWNER = "'00000000-0000-4000-8000-0000000000a1'"
const FIXTURE_CAMPAIGN = "'00000000-0000-4000-8000-0000000000c1'"
const FIXTURE_CHARACTER = "'00000000-0000-4000-8000-0000000000e1'"

// Rolled-back fixture: one campaign, one character with a sheet row, in the same transaction.
const fixture = `
begin;
insert into auth.users (id, aud, role, email)
  values (${FIXTURE_OWNER}, 'authenticated', 'authenticated', 'm4-owner@example.test');
insert into public.campaigns (id, name, owner_id) values (${FIXTURE_CAMPAIGN}, 'M4 fixture', ${FIXTURE_OWNER});
set constraints all immediate;
set constraints all deferred;
with c as (
  insert into public.characters (id, campaign_id, owner_id, name)
  values (${FIXTURE_CHARACTER}, ${FIXTURE_CAMPAIGN}, ${FIXTURE_OWNER}, 'Fixture') returning id
)
insert into public.character_sheets (character_id) select id from c;
`

function seedCharacter(campaignId: string, ownerId: string, name: string) {
  return localDatabaseQuery(
    `with c as (insert into public.characters (campaign_id, owner_id, name) values ('${campaignId}', '${ownerId}', '${name}') returning id),
          s as (insert into public.character_sheets (character_id) select id from c)
     select id from c;`,
    {},
  )
}

test.describe('status columns and body revision', () => {
  test('new columns default cleanly and are granted to the owner only as planned', () => {
    expect(
      localDatabaseQuery(
        `${fixture}
select conditions::text || '|' || exhaustion || '|' || death_save_successes || '|' || death_save_failures
  || '|' || coalesce(concentration, 'null') || '|' || inspiration || '|' || body_revision
from public.character_sheets where character_id = ${FIXTURE_CHARACTER};
rollback;`,
        {},
      ),
    ).toContain('{}|0|0|0|null|false|0')

    expect(
      localDatabaseQuery(
        `select string_agg(c, ',' order by c) from unnest(array['conditions','exhaustion','death_save_successes','death_save_failures','concentration','inspiration','body_revision','updated_at','character_id']) c
         where has_column_privilege('authenticated', 'public.character_sheets', c, 'update');`,
        {},
      ),
    ).toBe(
      'concentration,conditions,death_save_failures,death_save_successes,exhaustion,inspiration',
    )
    expect(
      localDatabaseQuery(
        `select coalesce(string_agg(r, ',' order by r), '') from unnest(array['anon','public','service_role']) r
         where has_column_privilege(r, 'public.character_sheets', 'conditions', 'update');`,
        {},
      ),
    ).toBe('')
  })

  test('constraints bound conditions, exhaustion, death saves, and concentration', () => {
    const cases: [string, string][] = [
      [`conditions = array['']`, 'character_sheets_conditions_check'],
      [`conditions = array[' padded']`, 'character_sheets_conditions_check'],
      [`conditions = array[repeat('x', 41)]`, 'character_sheets_conditions_check'],
      [`conditions = array[E'tab\\there']`, 'character_sheets_conditions_check'],
      [`conditions = array['Prone', 'prone']`, 'character_sheets_conditions_check'],
      [`conditions = array[null]::text[]`, 'character_sheets_conditions_check'],
      [
        `conditions = (select array_agg('c' || n) from generate_series(1, 21) n)`,
        'character_sheets_conditions_check',
      ],
      ['exhaustion = 7', 'character_sheets_exhaustion_check'],
      ['exhaustion = -1', 'character_sheets_exhaustion_check'],
      ['death_save_successes = 4', 'character_sheets_death_saves_check'],
      ['death_save_failures = -1', 'character_sheets_death_saves_check'],
      [`concentration = ''`, 'character_sheets_concentration_check'],
      [`concentration = ' Bless'`, 'character_sheets_concentration_check'],
      [`concentration = repeat('x', 81)`, 'character_sheets_concentration_check'],
    ]
    for (const [assignment, constraint] of cases) {
      expect(
        sqlError(`${fixture}
update public.character_sheets set ${assignment} where character_id = ${FIXTURE_CHARACTER};
rollback;`),
        assignment,
      ).toContain(constraint)
    }

    expect(
      localDatabaseQuery(
        `${fixture}
update public.character_sheets set conditions = array['Prone', 'Hexed by the Moon'], exhaustion = 6,
  death_save_successes = 3, death_save_failures = 3, concentration = 'Bless', inspiration = true where character_id = ${FIXTURE_CHARACTER};
select 'valid';
rollback;`,
        {},
      ),
    ).toContain('valid')
  })

  test('body_revision counts body changes only, whatever the writer', () => {
    const result = localDatabaseQuery(
      `${fixture}
update public.character_sheets set current_hp = 1, max_hp = 5, temp_hp = 2, cp = 3, exhaustion = 1, conditions = array['Prone'] where character_id = ${FIXTURE_CHARACTER};
select 'after_vitals:' || body_revision from public.character_sheets where character_id = ${FIXTURE_CHARACTER};
update public.character_sheets set sheet = '{"version": 1, "features": "Rage"}'::jsonb where character_id = ${FIXTURE_CHARACTER};
select 'after_body:' || body_revision from public.character_sheets where character_id = ${FIXTURE_CHARACTER};
update public.character_sheets set sheet = '{"version": 1, "features": "Rage"}'::jsonb where character_id = ${FIXTURE_CHARACTER};
select 'after_same_body:' || body_revision from public.character_sheets where character_id = ${FIXTURE_CHARACTER};
update public.character_sheets set body_revision = 99 where character_id = ${FIXTURE_CHARACTER};
select 'after_manual:' || body_revision from public.character_sheets where character_id = ${FIXTURE_CHARACTER};
rollback;`,
      {},
    )
    expect(result).toContain('after_vitals:0')
    expect(result).toContain('after_body:1')
    expect(result).toContain('after_same_body:1')
    expect(result).toContain('after_manual:1')
  })
})

test('a body save survives HP, coin, and status writes, and fails after another body save', async () => {
  test.setTimeout(90_000)
  const { players } = await newPlayers(['owner'])
  const { owner } = players as Record<'owner', Player>
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M4 revision')
    ids.push(campaignId)
    const characterId = seedCharacter(campaignId, owner.id, 'Reva')

    const read = async () => {
      const { data, error } = await owner.client
        .from('character_sheets')
        .select('body_revision, updated_at')
        .eq('character_id', characterId)
        .single()
      expect(error).toBeNull()
      return data!
    }
    const saveBody = async (revision: number, features: string) =>
      owner.client
        .from('character_sheets')
        .update({ sheet: { version: 1, features } })
        .eq('character_id', characterId)
        .eq('body_revision', revision)
        .select('body_revision')
        .maybeSingle()

    // Another device's edit view opens here.
    const opened = await read()

    // Meanwhile the table moves: vitals and status writes change updated_at but not the revision.
    for (const patch of [
      { max_hp: 20, current_hp: 12 },
      { temp_hp: 3 },
      { conditions: ['Prone'], exhaustion: 2, concentration: 'Bless', inspiration: true },
    ]) {
      const { error } = await owner.client
        .from('character_sheets')
        .update(patch)
        .eq('character_id', characterId)
      expect(error).toBeNull()
    }
    const busy = await read()
    expect(busy.updated_at).not.toBe(opened.updated_at)
    expect(busy.body_revision).toBe(opened.body_revision)

    // The open edit still saves, and the revision advances.
    const saved = await saveBody(opened.body_revision, 'Rage')
    expect(saved.error).toBeNull()
    expect(saved.data).toEqual({ body_revision: opened.body_revision + 1 })

    // A second device holding the old revision matches nothing and changes nothing.
    const stale = await saveBody(opened.body_revision, 'Stale write')
    expect(stale.error).toBeNull()
    expect(stale.data).toBeNull()
    expect(
      localDatabaseQuery(
        `select sheet->>'features' from public.character_sheets where character_id = '${characterId}';`,
        {},
      ),
    ).toBe('Rage')

    // The revision itself is not writable through the API.
    const forced = await owner.client
      .from('character_sheets')
      .update({ body_revision: 50 })
      .eq('character_id', characterId)
    expect(forced.error).not.toBeNull()
  } finally {
    await cleanup(players, ids)
  }
})

// --- Phase 2: the resources table, its policies, and the RPCs ---------------------------

function insertResource(columns: Record<string, string>) {
  const all = { character_id: FIXTURE_CHARACTER, ...columns }
  return `insert into public.character_resources (${Object.keys(all).join(', ')})
    values (${Object.values(all).join(', ')})`
}

test.describe('character_resources schema', () => {
  test('RLS is on, grants and function privileges are exactly the planned set', () => {
    expect(
      localDatabaseQuery(
        `select relrowsecurity::text from pg_class where oid = 'public.character_resources'::regclass;`,
        {},
      ),
    ).toBe('true')
    for (const [privilege, expected] of [
      ['select', 'authenticated'],
      ['delete', 'authenticated'],
      ['insert', ''],
      ['update', ''],
      ['truncate', ''],
    ]) {
      expect(
        localDatabaseQuery(
          `select coalesce(string_agg(r, ',' order by r), '') from unnest(array['anon','authenticated','service_role','public']) r
           where has_table_privilege(r, 'public.character_resources', '${privilege}');`,
          {},
        ),
        privilege,
      ).toBe(expected)
    }
    const columns = `array['id','character_id','kind','name','slot_level','die','maximum','current','reset','position','created_at','updated_at']`
    for (const [privilege, expected] of [
      ['insert', 'character_id,current,die,kind,maximum,name,position,reset,slot_level'],
      ['update', 'current,maximum,name,position,reset'],
    ]) {
      expect(
        localDatabaseQuery(
          `select string_agg(c, ',' order by c) from unnest(${columns}) c
           where has_column_privilege('authenticated', 'public.character_resources', c, '${privilege}');`,
          {},
        ),
        privilege,
      ).toBe(expected)
    }
    expect(
      localDatabaseQuery(
        `select string_agg(policyname, ',' order by policyname) from pg_policies where tablename = 'character_resources';`,
        {},
      ),
    ).toBe(
      'Owners add resources,Owners and shared members read resources,Owners delete resources,Owners update resources',
    )
    for (const fn of [
      'public.apply_character_hp(uuid, text, integer)',
      'public.adjust_character_resource(uuid, integer)',
      'public.take_character_rest(uuid, text, jsonb)',
      'public.record_death_save(uuid, text)',
    ]) {
      expect(
        localDatabaseQuery(
          `select string_agg(r || ':' || has_function_privilege(r, '${fn}', 'execute'), ',' order by r)
           from unnest(array['anon','authenticated','public','service_role']) r;`,
          {},
        ),
        fn,
      ).toBe('anon:false,authenticated:true,public:false,service_role:false')
    }
    for (const fn of [
      'private.lock_owned_character_sheet(uuid)',
      'private.guard_character_resource_write()',
    ]) {
      expect(
        localDatabaseQuery(
          `select string_agg(r || ':' || has_function_privilege(r, '${fn}', 'execute'), ',' order by r)
           from unnest(array['anon','authenticated','public','service_role']) r;`,
          {},
        ),
        fn,
      ).toBe('anon:false,authenticated:false,public:false,service_role:false')
    }
  })

  test('constraints bound each kind, name, maximum, current, reset, and position', () => {
    const bad: [Record<string, string>, string][] = [
      [{ kind: "'potion'", maximum: '1', current: '1', reset: "'long'" }, 'kind_check'],
      // Slots need a level, hit dice a die, trackers a name, and none of them the others' columns.
      [{ kind: "'spell_slots'", maximum: '1', current: '1', reset: "'long'" }, 'shape_check'],
      [
        { kind: "'spell_slots'", slot_level: '10', maximum: '1', current: '1', reset: "'long'" },
        'shape_check',
      ],
      [
        {
          kind: "'spell_slots'",
          slot_level: '1',
          die: '6',
          maximum: '1',
          current: '1',
          reset: "'long'",
        },
        'shape_check',
      ],
      [{ kind: "'hit_dice'", maximum: '1', current: '1', reset: "'long'" }, 'shape_check'],
      [
        { kind: "'hit_dice'", die: '7', maximum: '1', current: '1', reset: "'long'" },
        'shape_check',
      ],
      [
        {
          kind: "'hit_dice'",
          die: '8',
          slot_level: '1',
          maximum: '1',
          current: '1',
          reset: "'long'",
        },
        'shape_check',
      ],
      [{ kind: "'tracker'", maximum: '1', current: '1', reset: "'long'" }, 'shape_check'],
      [
        { kind: "'tracker'", name: "'Ki'", die: '6', maximum: '1', current: '1', reset: "'long'" },
        'shape_check',
      ],
      [
        { kind: "'tracker'", name: "''", maximum: '1', current: '1', reset: "'long'" },
        'name_check',
      ],
      [
        { kind: "'tracker'", name: "' Ki'", maximum: '1', current: '1', reset: "'long'" },
        'name_check',
      ],
      [
        { kind: "'tracker'", name: "repeat('x', 61)", maximum: '1', current: '1', reset: "'long'" },
        'name_check',
      ],
      [
        { kind: "'tracker'", name: "'Ki'", maximum: '1000', current: '1', reset: "'long'" },
        'maximum_check',
      ],
      [
        { kind: "'tracker'", name: "'Ki'", maximum: '2', current: '3', reset: "'long'" },
        'current_check',
      ],
      [
        { kind: "'tracker'", name: "'Ki'", maximum: '2', current: '-1', reset: "'long'" },
        'current_check',
      ],
      [
        { kind: "'tracker'", name: "'Ki'", maximum: '2', current: '1', reset: "'dawn'" },
        'reset_check',
      ],
      [
        {
          kind: "'tracker'",
          name: "'Ki'",
          maximum: '2',
          current: '1',
          reset: "'long'",
          position: '-1',
        },
        'position_check',
      ],
    ]
    for (const [columns, constraint] of bad) {
      expect(
        sqlError(`${fixture}
${insertResource(columns)};
rollback;`),
        JSON.stringify(columns),
      ).toContain(constraint)
    }

    expect(
      localDatabaseQuery(
        `${fixture}
${insertResource({ kind: "'spell_slots'", slot_level: '3', name: "'Pact slots'", maximum: '2', current: '2', reset: "'short'" })};
${insertResource({ kind: "'hit_dice'", die: '10', maximum: '5', current: '5', reset: "'long'" })};
${insertResource({ kind: "'tracker'", name: "'Ki'", maximum: '999', current: '0', reset: "'none'" })};
select 'valid:' || count(*) from public.character_resources where character_id = ${FIXTURE_CHARACTER};
rollback;`,
        {},
      ),
    ).toContain('valid:3')
  })

  test('the guard clamps current when maximum drops, pins ids, caps at 40, and cascades', () => {
    const tracker = {
      kind: "'tracker'",
      name: "'Ki'",
      maximum: '5',
      current: '4',
      reset: "'short'",
    }
    const result = localDatabaseQuery(
      `${fixture}
${insertResource(tracker)};
update public.character_resources set maximum = 2 where character_id = ${FIXTURE_CHARACTER};
select 'clamped:' || current || '/' || maximum from public.character_resources where character_id = ${FIXTURE_CHARACTER};
update public.character_resources set maximum = 9 where character_id = ${FIXTURE_CHARACTER};
select 'kept:' || current || '/' || maximum from public.character_resources where character_id = ${FIXTURE_CHARACTER};
delete from public.characters where id = ${FIXTURE_CHARACTER};
select 'cascaded:' || count(*) from public.character_resources where character_id = ${FIXTURE_CHARACTER};
rollback;`,
      {},
    )
    expect(result).toContain('clamped:2/2')
    expect(result).toContain('kept:2/9')
    expect(result).toContain('cascaded:0')

    expect(
      sqlError(`${fixture}
${insertResource(tracker)};
update public.character_resources set character_id = gen_random_uuid() where character_id = ${FIXTURE_CHARACTER};
rollback;`),
    ).toContain('resource_reassignment_forbidden')
    expect(
      sqlError(`${fixture}
${insertResource(tracker)};
update public.character_resources set current = 99 where character_id = ${FIXTURE_CHARACTER};
rollback;`),
    ).toContain('character_resources_current_check')

    const rows = Array.from({ length: 41 }, (_, i) =>
      insertResource({ ...tracker, name: `'T${i}'`, position: String(i) }),
    )
    expect(
      sqlError(`${fixture}
${rows.slice(0, 40).join(';\n')};
select 'forty:' || count(*) from public.character_resources where character_id = ${FIXTURE_CHARACTER};
${rows[40]};
rollback;`),
    ).toContain('resource_limit')
  })
})

async function newTable() {
  const { players } = await newPlayers(['owner', 'guest', 'other', 'outsider'])
  const cast = players as Record<'owner' | 'guest' | 'other' | 'outsider', Player>
  const campaignId = await createCampaign(cast.owner, 'M4 resources')
  await invite(cast.owner, campaignId, cast.guest)
  await invite(cast.owner, campaignId, cast.other)
  const characterId = seedCharacter(campaignId, cast.guest.id, 'Pip')
  return { cast, players, campaignId, characterId }
}

async function addResource(player: Player, characterId: string, values: Record<string, unknown>) {
  const { data, error } = await player.client
    .from('character_resources')
    .insert({ character_id: characterId, reset: 'long', ...values } as never)
    .select('id, current, maximum')
    .single()
  expect(error?.message ?? null).toBeNull()
  return data as { id: string; current: number; maximum: number }
}

test('trackers: the owner manages them; spending past zero is refused; restores clamp', async () => {
  test.setTimeout(90_000)
  const { cast, players, campaignId, characterId } = await newTable()
  const { guest } = cast
  try {
    const ki = await addResource(guest, characterId, {
      kind: 'tracker',
      name: 'Ki',
      maximum: 3,
      current: 3,
      reset: 'short',
    })
    const slots = await addResource(guest, characterId, {
      kind: 'spell_slots',
      slot_level: 1,
      maximum: 4,
      current: 4,
    })

    const spend = await guest.client.rpc('adjust_character_resource', {
      p_resource_id: ki.id,
      p_delta: -2,
    })
    expect(spend.error).toBeNull()
    expect(spend.data).toEqual([{ current: 1, updated_at: expect.any(String) }])

    expect(
      (
        await rpcError(
          guest.client.rpc('adjust_character_resource', { p_resource_id: ki.id, p_delta: -2 }),
        )
      ).message,
    ).toBe('resource_empty')
    const unchanged = await guest.client
      .from('character_resources')
      .select('current')
      .eq('id', ki.id)
      .single()
    expect(unchanged.data?.current).toBe(1)

    const restore = await guest.client.rpc('adjust_character_resource', {
      p_resource_id: ki.id,
      p_delta: 50,
    })
    expect(restore.data?.[0].current).toBe(3)

    for (const delta of [0, 1000, -1000, null]) {
      expect(
        (
          await rpcError(
            guest.client.rpc('adjust_character_resource', {
              p_resource_id: ki.id,
              p_delta: delta as never,
            }),
          )
        ).code,
        String(delta),
      ).toBe('22023')
    }

    // Typed corrections and edits go through the table; kind, level, die, and owner are fixed.
    const edited = await guest.client
      .from('character_resources')
      .update({ name: 'Ki points', maximum: 2, reset: 'long', position: 4 })
      .eq('id', ki.id)
      .select('current, maximum')
      .single()
    expect(edited.data).toEqual({ current: 2, maximum: 2 })
    const kindWrite = await guest.client
      .from('character_resources')
      .update({ kind: 'hit_dice' } as never)
      .eq('id', ki.id)
    expect(kindWrite.error).not.toBeNull()
    const levelWrite = await guest.client
      .from('character_resources')
      .update({ slot_level: 2 } as never)
      .eq('id', slots.id)
    expect(levelWrite.error).not.toBeNull()

    // Someone else's character takes no trackers; the owner's row is not reachable by id either.
    const forged = await cast.other.client
      .from('character_resources')
      .insert({
        character_id: characterId,
        kind: 'tracker',
        name: 'Forged',
        maximum: 1,
        current: 1,
        reset: 'long',
      })
      .select('id')
    expect(forged.error).not.toBeNull()
    expect(
      (
        await rpcError(
          cast.other.client.rpc('adjust_character_resource', { p_resource_id: ki.id, p_delta: -1 }),
        )
      ).message,
    ).toBe('resource_unavailable')

    const removed = await guest.client
      .from('character_resources')
      .delete()
      .eq('id', slots.id)
      .select('id')
    expect(removed.data).toHaveLength(1)
  } finally {
    await cleanup(players, [campaignId])
  }
})

test('visibility: members read shared trackers only, no one else writes, and leavers lose access', async () => {
  test.setTimeout(120_000)
  const { cast, players, campaignId, characterId } = await newTable()
  const { guest, owner, other, outsider } = cast
  try {
    const ki = await addResource(guest, characterId, {
      kind: 'tracker',
      name: 'Ki',
      maximum: 3,
      current: 3,
    })
    const count = async (player: Player) => {
      const { data, error } = await player.client
        .from('character_resources')
        .select('id')
        .eq('character_id', characterId)
      expect(error).toBeNull()
      return data!.length
    }

    // Private by default: the character's owner only. No rows and no counts for anyone else.
    expect([
      await count(guest),
      await count(owner),
      await count(other),
      await count(outsider),
    ]).toEqual([1, 0, 0, 0])
    expect(
      (
        await rpcError(
          other.client.rpc('adjust_character_resource', { p_resource_id: ki.id, p_delta: -1 }),
        )
      ).message,
    ).toBe('resource_unavailable')

    await rpcOk(
      guest.client
        .from('characters')
        .update({ sheet_visibility: 'campaign' })
        .eq('id', characterId),
    )
    expect([
      await count(guest),
      await count(owner),
      await count(other),
      await count(outsider),
    ]).toEqual([1, 1, 1, 0])

    // Shared means read-only for everyone but the character's owner, by table and by RPC.
    for (const reader of [owner, other]) {
      const update = await reader.client
        .from('character_resources')
        .update({ current: 0 })
        .eq('id', ki.id)
        .select('id')
      expect(update.data ?? []).toHaveLength(0)
      const remove = await reader.client
        .from('character_resources')
        .delete()
        .eq('id', ki.id)
        .select('id')
      expect(remove.data ?? []).toHaveLength(0)
      const insert = await reader.client.from('character_resources').insert({
        character_id: characterId,
        kind: 'tracker',
        name: 'Nope',
        maximum: 1,
        current: 1,
        reset: 'long',
      })
      expect(insert.error).not.toBeNull()
      expect(
        (
          await rpcError(
            reader.client.rpc('adjust_character_resource', { p_resource_id: ki.id, p_delta: -1 }),
          )
        ).message,
      ).toBe('resource_unavailable')
      for (const call of [
        reader.client.rpc('apply_character_hp', {
          p_character_id: characterId,
          p_kind: 'heal',
          p_amount: 1,
        }),
        reader.client.rpc('record_death_save', {
          p_character_id: characterId,
          p_result: 'success',
        }),
        reader.client.rpc('take_character_rest', {
          p_character_id: characterId,
          p_kind: 'long',
          p_plan: {},
        }),
      ]) {
        expect((await rpcError(call)).message).toBe('character_unavailable')
      }
      const status = await reader.client
        .from('character_sheets')
        .update({ conditions: ['Prone'], exhaustion: 3 })
        .eq('character_id', characterId)
        .select('character_id')
      expect(status.data ?? []).toHaveLength(0)
    }
    expect(
      localDatabaseQuery(
        `select current from public.character_resources where id = '${ki.id}';`,
        {},
      ),
    ).toBe('3')

    // Anonymous callers can do nothing.
    const anonymous = localClient()
    const anonRead = await anonymous.from('character_resources').select('id')
    expect(anonRead.data ?? []).toHaveLength(0)
    expect(
      (
        await rpcError(
          anonymous.rpc('adjust_character_resource', { p_resource_id: ki.id, p_delta: -1 }),
        )
      ).code,
    ).not.toBe('')

    // After leaving, the former member can neither read nor roll anything.
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    expect(await count(guest)).toBe(0)
    expect(await count(other)).toBe(0)
    for (const call of [
      guest.client.rpc('adjust_character_resource', { p_resource_id: ki.id, p_delta: -1 }),
      guest.client.rpc('apply_character_hp', {
        p_character_id: characterId,
        p_kind: 'temp',
        p_amount: 5,
      }),
    ]) {
      const failure = await rpcError(call)
      expect(['character_unavailable', 'resource_unavailable']).toContain(failure.message)
    }
  } finally {
    await cleanup(players, [campaignId])
  }
})

test('apply_character_hp: temp HP absorbs first, damage floors at 0, healing caps and revives', async () => {
  test.setTimeout(90_000)
  const { players, cast, campaignId, characterId } = await newTable()
  const { guest } = cast
  const hp = (kind: string, amount: number) =>
    guest.client.rpc('apply_character_hp', {
      p_character_id: characterId,
      p_kind: kind,
      p_amount: amount,
    })
  const row = async (kind: string, amount: number) => {
    const { data, error } = await hp(kind, amount)
    expect(error?.message ?? null).toBeNull()
    return data![0]
  }
  try {
    // Without HP set, damage and healing are refused; temp HP is not.
    expect((await rpcError(hp('damage', 1))).message).toBe('hp_not_set')
    expect((await rpcError(hp('heal', 1))).message).toBe('hp_not_set')
    expect((await row('temp', 4)).temp_hp).toBe(4)

    await rpcOk(
      guest.client
        .from('character_sheets')
        .update({ max_hp: 20, current_hp: 15, temp_hp: 0, concentration: 'Bless' })
        .eq('character_id', characterId),
    )

    // Temp HP does not stack: the larger pool wins.
    expect((await row('temp', 5)).temp_hp).toBe(5)
    expect((await row('temp', 3)).temp_hp).toBe(5)

    // Damage takes temp HP first; only the remainder counts for the concentration save.
    expect(await row('damage', 3)).toMatchObject({
      current_hp: 15,
      temp_hp: 2,
      damage_taken: 0,
      concentration: 'Bless',
    })
    expect(await row('damage', 6)).toMatchObject({ current_hp: 11, temp_hp: 0, damage_taken: 4 })

    // Floor at zero; further damage at 0 HP adds a death-save failure; temp HP absorbs it.
    expect(await row('damage', 50)).toMatchObject({
      current_hp: 0,
      damage_taken: 50,
      death_save_failures: 0,
    })
    expect(await row('damage', 2)).toMatchObject({ current_hp: 0, death_save_failures: 1 })
    await row('temp', 5)
    expect(await row('damage', 4)).toMatchObject({
      current_hp: 0,
      temp_hp: 1,
      death_save_failures: 1,
    })
    expect(await row('damage', 1)).toMatchObject({
      temp_hp: 0,
      damage_taken: 0,
      death_save_failures: 1,
    })

    // Healing from 0 clears death saves; healing caps at max HP.
    await rpcOk(
      guest.client
        .from('character_sheets')
        .update({ death_save_successes: 2 })
        .eq('character_id', characterId),
    )
    expect(await row('heal', 4)).toMatchObject({
      current_hp: 4,
      death_save_successes: 0,
      death_save_failures: 0,
    })
    expect((await row('heal', 9999)).current_hp).toBe(20)

    for (const [kind, amount] of [
      ['smite', 1],
      ['damage', 0],
      ['damage', 10000],
      ['heal', -3],
    ] as const) {
      expect((await rpcError(hp(kind, amount))).code, `${kind} ${amount}`).toBe('22023')
    }

    // Two devices tapping at once: both damage calls land.
    await rpcOk(
      guest.client
        .from('character_sheets')
        .update({ current_hp: 20 })
        .eq('character_id', characterId),
    )
    const results = await Promise.all([hp('damage', 3), hp('damage', 4), hp('damage', 5)])
    for (const result of results) expect(result.error).toBeNull()
    expect(
      localDatabaseQuery(
        `select current_hp from public.character_sheets where character_id = '${characterId}';`,
        {},
      ),
    ).toBe('8')
  } finally {
    await cleanup(players, [campaignId])
  }
})

test('take_character_rest applies a checked plan in one step and refuses a bad one whole', async () => {
  test.setTimeout(90_000)
  const { players, cast, campaignId, characterId } = await newTable()
  const { guest, other } = cast
  const rest = (kind: string, plan: unknown) =>
    guest.client.rpc('take_character_rest', {
      p_character_id: characterId,
      p_kind: kind,
      p_plan: plan as never,
    })
  try {
    await rpcOk(
      guest.client
        .from('character_sheets')
        .update({
          max_hp: 30,
          current_hp: 4,
          temp_hp: 6,
          exhaustion: 2,
          death_save_successes: 1,
          death_save_failures: 2,
        })
        .eq('character_id', characterId),
    )
    const ki = await addResource(guest, characterId, {
      kind: 'tracker',
      name: 'Ki',
      maximum: 4,
      current: 0,
      reset: 'short',
      position: 1,
    })
    const dice = await addResource(guest, characterId, {
      kind: 'hit_dice',
      die: 8,
      maximum: 5,
      current: 1,
      position: 2,
    })

    // Another player's tracker, in the same campaign, is not this character's to reset.
    const theirCharacter = seedCharacter(campaignId, other.id, 'Other')
    const theirs = await addResource(other, theirCharacter, {
      kind: 'tracker',
      name: 'Theirs',
      maximum: 2,
      current: 0,
    })

    // A bad plan changes nothing, even when earlier entries were fine.
    const before = localDatabaseQuery(
      `select current_hp || ',' || temp_hp || ',' || exhaustion || ',' || (select string_agg(current::text, ',' order by position) from public.character_resources where character_id = '${characterId}')
       from public.character_sheets where character_id = '${characterId}';`,
      {},
    )
    expect(before).toBe('4,6,2,0,1')
    const bad: [string, unknown, string][] = [
      ['long', { hp: 'max', resources: [{ id: ki.id, current: 5 }] }, '22023'],
      [
        'long',
        {
          hp: 'max',
          resources: [
            { id: ki.id, current: 1 },
            { id: ki.id, current: 2 },
          ],
        },
        '22023',
      ],
      ['long', { hp: 31 }, '22023'],
      ['long', { hp: 1.5 }, '22023'],
      ['long', { temp_hp: -1 }, '22023'],
      ['long', { exhaustion: 7 }, '22023'],
      ['long', { clear_death_saves: 'yes' }, '22023'],
      ['long', { unknown: 1 }, '22023'],
      ['long', { resources: [{ id: ki.id, current: 1, extra: true }] }, '22023'],
      ['long', { resources: [{ id: 'not-a-uuid', current: 1 }] }, '22023'],
      ['long', [], '22023'],
      ['dawn', {}, '22023'],
    ]
    for (const [kind, plan, code] of bad) {
      expect((await rpcError(rest(kind, plan))).code, JSON.stringify(plan)).toBe(code)
    }
    const stranger = await rpcError(
      rest('long', {
        hp: 'max',
        resources: [{ id: '00000000-0000-4000-8000-00000000dead', current: 0 }],
      }),
    )
    expect(stranger.message).toBe('resource_unavailable')
    expect(
      (await rpcError(rest('long', { hp: 'max', resources: [{ id: theirs.id, current: 1 }] })))
        .message,
    ).toBe('resource_unavailable')
    expect(
      localDatabaseQuery(
        `select current_hp || ',' || temp_hp || ',' || exhaustion || ',' || (select string_agg(current::text, ',' order by position) from public.character_resources where character_id = '${characterId}')
         from public.character_sheets where character_id = '${characterId}';`,
        {},
      ),
    ).toBe(before)

    const done = await rest('long', {
      hp: 'max',
      temp_hp: 0,
      exhaustion: -1,
      clear_death_saves: true,
      resources: [
        { id: ki.id, current: 4 },
        { id: dice.id, current: 3 },
      ],
    })
    expect(done.error).toBeNull()
    const result = done.data as {
      sheet: Record<string, unknown>
      resources: { id: string; current: number }[]
    }
    expect(result.sheet).toMatchObject({
      current_hp: 30,
      temp_hp: 0,
      exhaustion: 1,
      death_save_successes: 0,
      death_save_failures: 0,
    })
    expect(result.resources.map(({ id, current }) => [id, current])).toEqual([
      [ki.id, 4],
      [dice.id, 3],
    ])

    // Exhaustion never goes below zero; a short rest may cover only resets.
    expect((await rest('long', { exhaustion: -6 })).error).toBeNull()
    expect((await rest('long', { exhaustion: -6 })).data).toMatchObject({
      sheet: { exhaustion: 0 },
    })
    const short = await rest('short', { resources: [{ id: dice.id, current: 4 }] })
    expect(short.error).toBeNull()
    expect(short.data).toMatchObject({ sheet: { current_hp: 30 } })
  } finally {
    await cleanup(players, [campaignId])
  }
})

test('record_death_save: only at 0 HP; criticals revive or double the failures; counters cap at 3', async () => {
  test.setTimeout(90_000)
  const { players, cast, campaignId, characterId } = await newTable()
  const { guest } = cast
  const save = (result: string) =>
    guest.client.rpc('record_death_save', { p_character_id: characterId, p_result: result })
  const sheet = (patch: Record<string, number>) =>
    rpcOk(guest.client.from('character_sheets').update(patch).eq('character_id', characterId))
  try {
    await sheet({ max_hp: 12, current_hp: 5 })
    expect((await rpcError(save('success'))).message).toBe('not_dying')

    await sheet({ current_hp: 0 })
    const first = await save('success')
    expect(first.data?.[0]).toMatchObject({
      current_hp: 0,
      death_save_successes: 1,
      death_save_failures: 0,
    })
    expect((await save('failure')).data?.[0]).toMatchObject({
      death_save_successes: 1,
      death_save_failures: 1,
    })
    // A natural 1 counts as two failures, and counters stop at three.
    expect((await save('critical_failure')).data?.[0]).toMatchObject({ death_save_failures: 3 })
    expect((await save('failure')).data?.[0]).toMatchObject({ death_save_failures: 3 })
    expect((await rpcError(save('lucky'))).code).toBe('22023')

    // A natural 20 brings the character back at 1 HP with clean saves.
    expect((await save('critical_success')).data?.[0]).toMatchObject({
      current_hp: 1,
      death_save_successes: 0,
      death_save_failures: 0,
    })
    expect((await rpcError(save('success'))).message).toBe('not_dying')
  } finally {
    await cleanup(players, [campaignId])
  }
})
