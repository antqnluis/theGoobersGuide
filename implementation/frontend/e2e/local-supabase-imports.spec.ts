import { expect, test } from '@playwright/test'
import { localClient, localDatabaseQuery, sqlError } from './support/localSupabase.ts'
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

// M03.8 Phase 1: attack ids, character_imports, import_character, and apply_character_update,
// against the real local stack.

type Cast = Record<'owner' | 'guest' | 'other' | 'outsider', Player>

const ROLES = ['anon', 'authenticated', 'service_role', 'public']
const STALE = '2000-01-01T00:00:00+00:00'
const UNAVAILABLE = { code: 'P0001', message: 'character_unavailable' }

async function newCast() {
  const { players } = await newPlayers(['owner', 'guest', 'other', 'outsider'])
  return players as Cast
}

function holders(sql: (role: string) => string) {
  return localDatabaseQuery(
    `select coalesce(string_agg(r, ',' order by r), '') from unnest(array['${ROLES.join("','")}']) r
     where ${sql('r')};`,
    {},
  )
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 15, cha: 8 },
    saving_throws: ['str', 'dex'],
    skills: { survival: 'proficient', stealth: 'expertise' },
    attacks: [
      { id: crypto.randomUUID(), name: 'Longbow', bonus: '+5', damage: '1d8 + 3', notes: '' },
    ],
    features: 'Favored Enemy',
    spells: '',
    notes: 'Keeps watch at dusk.',
    alignment: 'Neutral good',
    experience: 900,
    ...overrides,
  }
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    details: {
      name: 'Arlen Vale',
      species: 'Human',
      class_name: 'Ranger',
      subclass: null,
      background: 'Outlander',
      level: 3,
    },
    vitals: { max_hp: 24, current_hp: 20, temp_hp: 2, armor_class: 15, speed: 30 },
    sheet: body(),
    items: [
      {
        name: 'Rope',
        quantity: 1,
        weight: 10,
        description: '50 ft., hempen',
        equipped: false,
        attuned: false,
      },
      {
        name: 'Torch',
        quantity: 3,
        weight: null,
        description: null,
        equipped: false,
        attuned: false,
      },
      {
        name: 'Longbow',
        quantity: 1,
        weight: 2,
        description: null,
        equipped: true,
        attuned: false,
      },
    ],
    coins: { cp: 0, sp: 4, gp: 12 },
    ...overrides,
  }
}

function importCharacter(
  player: Player,
  campaignId: string,
  character: unknown = payload(),
  label: string | null = null,
) {
  return player.client.rpc('import_character', {
    p_campaign_id: campaignId,
    p_character: character,
    p_source_label: label,
  })
}

async function importedCharacter(player: Player, campaignId: string, character = payload()) {
  const { data, error } = await importCharacter(player, campaignId, character)
  expect(error?.message ?? null).toBeNull()
  return data as string
}

async function createdCharacter(player: Player, campaignId: string, name = 'Hero') {
  const { data, error } = await player.client.rpc('create_character', {
    p_campaign_id: campaignId,
    p_name: name,
  })
  expect(error?.message ?? null).toBeNull()
  return data as string
}

type Snapshot = {
  character: Record<string, unknown> & { updated_at: string }
  sheet: Record<string, unknown> & { updated_at: string; sheet: Record<string, unknown> }
  items: Array<Record<string, unknown> & { id: string; name: string; updated_at: string }>
}

async function snapshot(player: Player, characterId: string): Promise<Snapshot> {
  const character = await player.client
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .single()
  const sheet = await player.client
    .from('character_sheets')
    .select('*')
    .eq('character_id', characterId)
    .single()
  const items = await player.client
    .from('character_items')
    .select('*')
    .eq('character_id', characterId)
    .order('name')
  expect(character.error).toBeNull()
  expect(sheet.error).toBeNull()
  expect(items.error).toBeNull()
  return {
    character: character.data as Snapshot['character'],
    sheet: sheet.data as Snapshot['sheet'],
    items: items.data as Snapshot['items'],
  }
}

function expectedFrom(state: Snapshot) {
  return {
    character_updated_at: state.character.updated_at,
    sheet_updated_at: state.sheet.updated_at,
    items: Object.fromEntries(state.items.map((item) => [item.id, item.updated_at])),
  }
}

function applyUpdate(
  player: Player,
  characterId: string,
  expected: unknown,
  changes: unknown,
  label: string | null = null,
) {
  return player.client.rpc('apply_character_update', {
    p_character_id: characterId,
    p_expected: expected,
    p_changes: changes,
    p_source_label: label,
  })
}

async function applied(
  player: Player,
  characterId: string,
  expected: unknown,
  changes: unknown,
  label: string | null = null,
) {
  const { data, error } = await applyUpdate(player, characterId, expected, changes, label)
  expect(error?.message ?? null).toBeNull()
  return data as string
}

function importRows(characterId: string) {
  return localDatabaseQuery(
    `select coalesce(string_agg(kind || '|' || coalesce(source_label, '~') || '|' || change_count, ';' order by imported_at, kind), '')
     from public.character_imports where character_id = '${characterId}';`,
    {},
  )
}

function coinLogCount(characterId: string) {
  return Number(
    localDatabaseQuery(
      `select count(*) from public.character_currency_log where character_id = '${characterId}';`,
      {},
    ),
  )
}

function purse(characterId: string) {
  return localDatabaseQuery(
    `select cp || ',' || sp || ',' || gp from public.character_sheets where character_id = '${characterId}';`,
    {},
  )
}

function characterCount(campaignId: string) {
  return Number(
    localDatabaseQuery(
      `select count(*) from public.characters where campaign_id = '${campaignId}';`,
      {},
    ),
  )
}

/** Everything an update must be able to leave untouched, as one comparable string. */
function frozen(characterId: string) {
  return localDatabaseQuery(
    `select c.name || '|' || coalesce(c.species, '~') || '|' || c.level || '|' || c.status || '|' || c.in_party
            || '|' || c.sheet_visibility || '|' || coalesce(c.portrait_path, '~')
            || '|' || s.max_hp || '|' || s.current_hp || '|' || s.temp_hp || '|' || s.sheet::text
            || '|' || s.cp || ',' || s.sp || ',' || s.gp
            || '|' || (select coalesce(string_agg(i.id || ':' || i.name || ':' || i.quantity || ':' || i.updated_at, ',' order by i.id), '')
                       from public.character_items i where i.character_id = c.id)
     from public.characters c join public.character_sheets s on s.character_id = c.id
     where c.id = '${characterId}';`,
    {},
  )
}

test.describe('catalog and privileges', () => {
  test('character_imports is read-only for authenticated and has no other holders', () => {
    expect(
      localDatabaseQuery(
        `select relrowsecurity from pg_class where oid = 'public.character_imports'::regclass;`,
        {},
      ),
    ).toBe('t')
    expect(
      localDatabaseQuery(
        `select count(*) from pg_policy where polrelid = 'public.character_imports'::regclass;`,
        {},
      ),
    ).toBe('1')
    expect(
      localDatabaseQuery(
        `select polcmd from pg_policy where polrelid = 'public.character_imports'::regclass;`,
        {},
      ),
    ).toBe('r')

    for (const [privilege, expected] of [
      ['select', 'authenticated'],
      ['insert', ''],
      ['update', ''],
      ['delete', ''],
      ['truncate', ''],
      ['references', ''],
      ['trigger', ''],
    ]) {
      expect(
        holders((r) => `has_table_privilege(${r}, 'public.character_imports', '${privilege}')`),
        privilege,
      ).toBe(expected)
    }
    for (const privilege of ['insert', 'update']) {
      expect(
        holders(
          (r) => `has_any_column_privilege(${r}, 'public.character_imports', '${privilege}')`,
        ),
        privilege,
      ).toBe('')
    }
  })

  test('the RPCs are security invoker, the provenance helper is definer, and only authenticated executes', () => {
    const functions: Array<[string, boolean]> = [
      ['public.import_character(uuid, jsonb, text)', false],
      ['public.apply_character_update(uuid, jsonb, jsonb, text)', false],
      ['private.record_character_import(uuid, text, text, integer)', true],
    ]
    for (const [signature, definer] of functions) {
      expect(
        localDatabaseQuery(
          `select prosecdef from pg_proc where oid = '${signature}'::regprocedure;`,
          {},
        ),
        signature,
      ).toBe(definer ? 't' : 'f')
      expect(
        holders((r) => `has_function_privilege(${r}, '${signature}', 'execute')`),
        signature,
      ).toBe('authenticated')
    }
    expect(
      localDatabaseQuery(
        `select pg_get_functiondef('public.import_character(uuid, jsonb, text)'::regprocedure) ~ 'search_path';`,
        {},
      ),
    ).toBe('t')
  })

  test('anonymous callers cannot execute either RPC', async () => {
    const anonymous = localClient()
    const imported = await rpcError(
      anonymous.rpc('import_character', { p_campaign_id: RANDOM_ID, p_character: payload() }),
    )
    expect(imported.code).toBe('42501')
    const updated = await rpcError(
      anonymous.rpc('apply_character_update', {
        p_character_id: RANDOM_ID,
        p_expected: {},
        p_changes: {},
      }),
    )
    expect(updated.code).toBe('42501')
  })
})

test.describe('attack ids', () => {
  const fixture = `
begin;
insert into auth.users (id, aud, role, email)
  values ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'm8-owner@example.test');
insert into public.campaigns (id, name, owner_id)
  values ('00000000-0000-4000-8000-0000000000c1', 'M8 fixture', '00000000-0000-4000-8000-0000000000a1');
insert into public.characters (id, campaign_id, owner_id, name)
  values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1',
          '00000000-0000-4000-8000-0000000000a1', 'Fixture');
insert into public.character_sheets (character_id) values ('00000000-0000-4000-8000-0000000000e1');
`
  const id1 = '3f1c9a52-8d4e-4b7a-9c61-0a2b5d7e9f10'
  const id2 = '4a2d0b63-9e5f-4c8b-8d72-1b3c6e8f0a21'

  test('the check constraint requires a unique lowercase UUID id on every attack', () => {
    const rejected: string[] = [
      `'[{"name": "Axe"}]'`,
      `'[{"id": null, "name": "Axe"}]'`,
      `'[{"id": 7, "name": "Axe"}]'`,
      `'[{"id": "not-a-uuid", "name": "Axe"}]'`,
      `'[{"id": "${id1.toUpperCase()}", "name": "Axe"}]'`,
      `'[{"id": "${id1}"}, {"id": "${id1}"}]'`,
      `'[{"id": "${id1}"}, {"name": "No id"}]'`,
    ]
    for (const attacks of rejected) {
      expect(
        sqlError(`${fixture}
update public.character_sheets set sheet = jsonb_build_object('version', 1, 'attacks', ${attacks}::jsonb);
rollback;`),
        attacks,
      ).toContain('character_sheets_sheet_check')
    }

    expect(
      localDatabaseQuery(
        `${fixture}
update public.character_sheets set sheet = jsonb_build_object('version', 1,
  'attacks', '[{"id": "${id1}", "name": "Axe"}, {"id": "${id2}", "name": "Bow", "extra": true}]'::jsonb);
select 'valid';
rollback;`,
        {},
      ),
    ).toContain('valid')
    expect(
      localDatabaseQuery(
        `${fixture}
update public.character_sheets set sheet = '{"version": 1, "attacks": []}'::jsonb;
select 'empty-ok';
rollback;`,
        {},
      ),
    ).toContain('empty-ok')
  })

  test('the API rejects a sheet save with a missing or duplicated attack id', async () => {
    test.setTimeout(60_000)
    const players = await newCast()
    const { owner } = players
    const ids: string[] = []
    try {
      const campaignId = await createCampaign(owner, 'M8 attack ids')
      ids.push(campaignId)
      const characterId = await createdCharacter(owner, campaignId)
      const save = (attacks: unknown) =>
        owner.client
          .from('character_sheets')
          .update({ sheet: { version: 1, attacks } })
          .eq('character_id', characterId)
          .select('character_id')

      expect((await save([{ name: 'No id' }])).error?.code).toBe('23514')
      expect(
        (
          await save([
            { id: id1, name: 'A' },
            { id: id1, name: 'B' },
          ])
        ).error?.code,
      ).toBe('23514')
      const ok = await save([
        { id: id1, name: 'A' },
        { id: id2, name: 'B' },
      ])
      expect(ok.error).toBeNull()
      expect(ok.data).toHaveLength(1)
    } finally {
      await cleanup(players, ids)
    }
  })
})

test('import_character creates the character, sheet, items, coins, and one history row', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 new import')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)

    const characterId = await importedCharacter(guest, campaignId)
    const state = await snapshot(guest, characterId)

    expect(state.character).toMatchObject({
      owner_id: guest.id,
      campaign_id: campaignId,
      name: 'Arlen Vale',
      species: 'Human',
      class_name: 'Ranger',
      subclass: null,
      background: 'Outlander',
      level: 3,
      status: 'active',
      in_party: false,
      sheet_visibility: 'private',
      portrait_path: null,
    })
    expect(state.sheet).toMatchObject({
      max_hp: 24,
      current_hp: 20,
      temp_hp: 2,
      armor_class: 15,
      speed: 30,
      cp: 0,
      sp: 4,
      gp: 12,
    })
    expect(state.sheet.sheet).toMatchObject({
      version: 1,
      features: 'Favored Enemy',
      experience: 900,
    })
    expect(state.items.map((item) => [item.name, item.quantity, item.equipped])).toEqual([
      ['Longbow', 1, true],
      ['Rope', 1, false],
      ['Torch', 3, false],
    ])
    expect(coinLogCount(characterId)).toBe(1)
    // 1 character + 3 items + 1 for coins.
    expect(importRows(characterId)).toBe('new|~|5')
    expect(
      localDatabaseQuery(
        `select imported_by = '${guest.id}' from public.character_imports where character_id = '${characterId}';`,
        {},
      ),
    ).toBe('t')

    // The campaign owner has no override on a private sheet.
    expect((await owner.client.from('character_imports').select('id')).data).toEqual([])
  } finally {
    await cleanup(players, ids)
  }
})

test('a minimal import works, and a label is trimmed and stored', async () => {
  test.setTimeout(60_000)
  const players = await newCast()
  const { owner } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 minimal import')
    ids.push(campaignId)
    const minimal = {
      details: { name: 'Bare' },
      vitals: {},
      sheet: { version: 1 },
      items: [],
      coins: {},
    }
    const { data, error } = await importCharacter(owner, campaignId, minimal, '  handoff.md  ')
    expect(error?.message ?? null).toBeNull()
    const characterId = data as string
    expect(importRows(characterId)).toBe('new|handoff.md|1')
    expect(coinLogCount(characterId)).toBe(0)
    expect(purse(characterId)).toBe('0,0,0')

    // A blank label is stored as no label.
    const second = await createCampaign(owner, 'M8 blank label')
    ids.push(second)
    const blank = await importCharacter(owner, second, minimal, '   ')
    expect(blank.error?.message ?? null).toBeNull()
    expect(importRows(blank.data as string)).toBe('new|~|1')
  } finally {
    await cleanup(players, ids)
  }
})

test('import_character is denied to non-members and creates nothing', async () => {
  test.setTimeout(60_000)
  const players = await newCast()
  const { owner, outsider, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 import access')
    ids.push(campaignId)

    for (const who of [outsider, guest]) {
      expect(await rpcError(importCharacter(who, campaignId))).toEqual({
        code: 'P0001',
        message: 'character_campaign_unavailable',
      })
    }
    expect(await rpcError(importCharacter(owner, RANDOM_ID))).toEqual({
      code: 'P0001',
      message: 'character_campaign_unavailable',
    })
    expect(characterCount(campaignId)).toBe(0)
    expect(
      localDatabaseQuery(
        `select count(*) from public.character_imports i join public.characters c on c.id = i.character_id
         where c.campaign_id = '${campaignId}';`,
        {},
      ),
    ).toBe('0')
  } finally {
    await cleanup(players, ids)
  }
})

test('import_character is refused while an active character exists and changes nothing', async () => {
  test.setTimeout(60_000)
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 one active')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const existing = await createdCharacter(guest, campaignId, 'Already here')

    expect(await rpcError(importCharacter(guest, campaignId))).toEqual({
      code: 'P0001',
      message: 'character_active_exists',
    })
    expect(characterCount(campaignId)).toBe(1)
    expect(importRows(existing)).toBe('')

    // Retiring the active character frees the slot.
    await rpcOk(
      guest.client.rpc('set_character_status', { p_character_id: existing, p_status: 'retired' }),
    )
    await importedCharacter(guest, campaignId)
    expect(characterCount(campaignId)).toBe(2)
  } finally {
    await cleanup(players, ids)
  }
})

test('a failed import rolls back completely and records nothing', async () => {
  test.setTimeout(120_000)
  const players = await newCast()
  const { owner } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 import rollback')
    ids.push(campaignId)

    const item = (n: number) => ({ name: `Item ${n}`, quantity: 1 })
    const cases: Array<[string, unknown, string, string]> = [
      [
        '201 items',
        payload({ items: Array.from({ length: 201 }, (_, n) => item(n)) }),
        '22023',
        'import_invalid',
      ],
      [
        'an attack without an id',
        payload({ sheet: body({ attacks: [{ name: 'No id' }] }) }),
        '22023',
        'import_values_invalid',
      ],
      [
        'duplicate attack ids',
        payload({
          sheet: body({
            attacks: [
              { id: '3f1c9a52-8d4e-4b7a-9c61-0a2b5d7e9f10', name: 'A' },
              { id: '3f1c9a52-8d4e-4b7a-9c61-0a2b5d7e9f10', name: 'B' },
            ],
          }),
        }),
        '22023',
        'import_values_invalid',
      ],
      [
        'an invalid sheet body',
        payload({ sheet: { version: 2 } }),
        '22023',
        'import_values_invalid',
      ],
      [
        'max_hp of zero',
        payload({ vitals: { max_hp: 0, current_hp: 0, temp_hp: 0 } }),
        '22023',
        'import_values_invalid',
      ],
      [
        'current_hp above max_hp',
        payload({ vitals: { max_hp: 10, current_hp: 11, temp_hp: 0 } }),
        '22023',
        'import_values_invalid',
      ],
      [
        'a huge integer',
        payload({ vitals: { max_hp: 1e12, current_hp: 1, temp_hp: 0 } }),
        '22023',
        'import_values_invalid',
      ],
      [
        'a bad item value',
        payload({ items: [{ name: 'Rope', quantity: 10000 }] }),
        '22023',
        'import_values_invalid',
      ],
      [
        'an item weight over the bound',
        payload({ items: [{ name: 'Anvil', weight: 100000 }] }),
        '22023',
        'import_values_invalid',
      ],
      [
        'an item with a blank name',
        payload({ items: [{ name: '' }] }),
        '22023',
        'import_values_invalid',
      ],
      [
        'a long name',
        payload({ details: { name: 'x'.repeat(81) } }),
        '22023',
        'character_name_invalid',
      ],
      [
        'level 21',
        payload({ details: { name: 'Hero', level: 21 } }),
        '22023',
        'character_level_invalid',
      ],
      ['negative coins', payload({ coins: { cp: 0, sp: 0, gp: -5 } }), '22023', 'import_invalid'],
      [
        'coins over the limit',
        payload({ coins: { cp: 0, sp: 0, gp: 10_000_000 } }),
        '22023',
        'import_invalid',
      ],
    ]
    for (const [label, character, code, message] of cases) {
      expect(await rpcError(importCharacter(owner, campaignId, character)), label).toEqual({
        code,
        message,
      })
      expect(characterCount(campaignId), label).toBe(0)
    }
    expect(
      localDatabaseQuery(
        `select count(*) from public.character_imports i join public.characters c on c.id = i.character_id
         where c.campaign_id = '${campaignId}';`,
        {},
      ),
    ).toBe('0')

    // Exactly 200 items is allowed.
    const full = await importCharacter(
      owner,
      campaignId,
      payload({
        items: Array.from({ length: 200 }, (_, n) => item(n)),
        coins: {},
      }),
    )
    expect(full.error?.message ?? null).toBeNull()
    expect(importRows(full.data as string)).toBe('new|~|201')
  } finally {
    await cleanup(players, ids)
  }
})

test('import_character rejects payloads with the wrong shape or application-owned keys', async () => {
  test.setTimeout(120_000)
  const players = await newCast()
  const { owner } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 import shape')
    ids.push(campaignId)
    const base = payload()
    const cases: Array<[string, unknown]> = [
      ['null', null],
      ['an array', []],
      ['no details', { ...base, details: undefined }],
      ['no items', { ...base, items: undefined }],
      ['status', { ...base, status: 'deceased' }],
      ['in_party', { ...base, in_party: true }],
      ['sheet_visibility', { ...base, sheet_visibility: 'campaign' }],
      ['portrait_path', { ...base, portrait_path: 'x/y.png' }],
      ['owner_id', { ...base, owner_id: RANDOM_ID }],
      ['campaign_id', { ...base, campaign_id: RANDOM_ID }],
      ['status inside details', payload({ details: { name: 'Hero', status: 'deceased' } })],
      ['in_party inside details', payload({ details: { name: 'Hero', in_party: true } })],
      ['a numeric name', payload({ details: { name: 5 } })],
      ['a missing name', payload({ details: { level: 2 } })],
      ['a string level', payload({ details: { name: 'Hero', level: '3' } })],
      ['a fractional level', payload({ details: { name: 'Hero', level: 2.5 } })],
      ['a string vital', payload({ vitals: { max_hp: '24' } })],
      ['a null temp_hp', payload({ vitals: { temp_hp: null } })],
      ['an unknown vital', payload({ vitals: { initiative: 2 } })],
      ['a non-object sheet', payload({ sheet: [] })],
      ['items as an object', payload({ items: {} })],
      ['an item id', payload({ items: [{ id: RANDOM_ID, name: 'Rope' }] })],
      ['an unknown item key', payload({ items: [{ name: 'Rope', cursed: true }] })],
      ['an item without a name', payload({ items: [{ quantity: 1 }] })],
      ['a string quantity', payload({ items: [{ name: 'Rope', quantity: '2' }] })],
      ['a numeric description', payload({ items: [{ name: 'Rope', description: 4 }] })],
      ['electrum', payload({ coins: { ep: 1 } })],
      ['fractional coins', payload({ coins: { gp: 1.5 } })],
      ['string coins', payload({ coins: { gp: '5' } })],
    ]
    for (const [label, character] of cases) {
      expect(await rpcError(importCharacter(owner, campaignId, character)), label).toEqual({
        code: '22023',
        message: 'import_invalid',
      })
      expect(characterCount(campaignId), label).toBe(0)
    }

    // A bad label fails before anything is written.
    for (const label of ['x'.repeat(121), 'line\nbreak', 'tab\there']) {
      expect(await rpcError(importCharacter(owner, campaignId, payload(), label)), label).toEqual({
        code: '22023',
        message: 'import_source_invalid',
      })
    }
    expect(characterCount(campaignId)).toBe(0)
    const longest = await importCharacter(owner, campaignId, payload(), 'x'.repeat(120))
    expect(longest.error?.message ?? null).toBeNull()
  } finally {
    await cleanup(players, ids)
  }
})

test('the owner applies every kind of change in one call, and one history and coin-log row are written', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 update')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const characterId = await importedCharacter(guest, campaignId)
    // The sheet is shared and the character is in the party: an update must leave both alone.
    await guest.client
      .from('characters')
      .update({ sheet_visibility: 'campaign' })
      .eq('id', characterId)
    await rpcOk(
      guest.client.rpc('set_character_in_party', { p_character_id: characterId, p_in_party: true }),
    )

    const before = await snapshot(guest, characterId)
    const rope = before.items.find((item) => item.name === 'Rope')!
    const torch = before.items.find((item) => item.name === 'Torch')!
    const bow = before.items.find((item) => item.name === 'Longbow')!
    const newSheet = {
      ...before.sheet.sheet,
      notes: 'Updated notes.',
      attacks: [
        ...(before.sheet.sheet.attacks as unknown[]),
        { id: crypto.randomUUID(), name: 'Shortsword', bonus: '+5', damage: '1d6 + 3', notes: '' },
      ],
    }
    const logBefore = coinLogCount(characterId)

    const stamp = await applied(
      guest,
      characterId,
      expectedFrom(before),
      {
        details: { level: 4, subclass: 'Gloom Stalker', species: null },
        vitals: { max_hp: 31, current_hp: 31, temp_hp: 0, speed: null },
        sheet: newSheet,
        items: {
          add: [
            {
              name: 'Healing potion',
              quantity: 2,
              weight: 0.5,
              description: 'Red',
              equipped: false,
            },
          ],
          update: [{ id: torch.id, quantity: 1, equipped: true, description: 'Burning' }],
          remove: [rope.id],
        },
        coins: { gp: 20, sp: 4, cp: 0 },
        change_count: 9,
      },
      'Handoff #2',
    )

    const after = await snapshot(guest, characterId)
    expect(stamp).toBe(after.sheet.updated_at)
    expect(after.character).toMatchObject({
      level: 4,
      subclass: 'Gloom Stalker',
      species: null,
      name: 'Arlen Vale',
      class_name: 'Ranger',
      sheet_visibility: 'campaign',
      in_party: true,
      status: 'active',
      portrait_path: null,
    })
    expect(after.sheet).toMatchObject({
      max_hp: 31,
      current_hp: 31,
      temp_hp: 0,
      speed: null,
      armor_class: 15,
      cp: 0,
      sp: 4,
      gp: 20,
    })
    expect(after.sheet.sheet).toEqual(newSheet)
    expect(after.items.map((item) => item.name)).toEqual(['Healing potion', 'Longbow', 'Torch'])
    expect(after.items.find((item) => item.name === 'Torch')).toMatchObject({
      quantity: 1,
      equipped: true,
      description: 'Burning',
      weight: null,
    })
    expect(after.items.find((item) => item.id === bow.id)!.updated_at).toBe(bow.updated_at)
    expect(after.items.find((item) => item.name === 'Healing potion')).toMatchObject({
      quantity: 2,
      weight: 0.5,
    })
    expect(coinLogCount(characterId)).toBe(logBefore + 1)
    expect(importRows(characterId)).toBe('new|~|5;update|Handoff #2|9')
  } finally {
    await cleanup(players, ids)
  }
})

test('a derived change count is stored when the client sends none, and coin targets become deltas', async () => {
  test.setTimeout(60_000)
  const players = await newCast()
  const { owner } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 derived count')
    ids.push(campaignId)
    const characterId = await importedCharacter(owner, campaignId)
    expect(purse(characterId)).toBe('0,4,12')
    const logBefore = coinLogCount(characterId)

    // Raising one coin and lowering another applies both deltas in one logged change.
    await applied(owner, characterId, expectedFrom(await snapshot(owner, characterId)), {
      coins: { cp: 5, gp: 3 },
    })
    expect(purse(characterId)).toBe('5,4,3')
    expect(coinLogCount(characterId)).toBe(logBefore + 1)
    expect(
      localDatabaseQuery(
        `select cp_delta || ',' || sp_delta || ',' || gp_delta from public.character_currency_log
         where character_id = '${characterId}' order by seq desc limit 1;`,
        {},
      ),
    ).toBe('5,0,-9')

    // A target equal to the current balance logs nothing.
    await applied(owner, characterId, expectedFrom(await snapshot(owner, characterId)), {
      coins: { cp: 5 },
    })
    expect(coinLogCount(characterId)).toBe(logBefore + 1)
    // details (2 keys) + 1 sheet + 1 coin key = 4; the coins above counted 2 and 1.
    await applied(owner, characterId, expectedFrom(await snapshot(owner, characterId)), {
      details: { level: 5, background: null },
      sheet: body({ attacks: [] }),
      coins: { gp: 4 },
    })
    expect(importRows(characterId)).toBe('new|~|5;update|~|2;update|~|1;update|~|4')
  } finally {
    await cleanup(players, ids)
  }
})

test('apply_character_update is unavailable to everyone but the character owner', async () => {
  test.setTimeout(120_000)
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 update access')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const characterId = await importedCharacter(guest, campaignId)
    await guest.client
      .from('characters')
      .update({ sheet_visibility: 'campaign' })
      .eq('id', characterId)
    const state = await snapshot(guest, characterId)
    const expected = expectedFrom(state)
    const changes = { details: { level: 9 } }
    const unchanged = frozen(characterId)

    // Another member (even with a shared sheet), the campaign owner, a non-member, an unknown id.
    for (const who of [other, owner, outsider]) {
      expect(await rpcError(applyUpdate(who, characterId, expected, changes))).toEqual(UNAVAILABLE)
    }
    expect(await rpcError(applyUpdate(guest, RANDOM_ID, expected, changes))).toEqual(UNAVAILABLE)
    expect(frozen(characterId)).toBe(unchanged)

    // A departed owner gets the same answer; rejoining restores access.
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    expect(await rpcError(applyUpdate(guest, characterId, expected, changes))).toEqual(UNAVAILABLE)
    expect(frozen(characterId)).toBe(unchanged)
    await invite(owner, campaignId, guest)
    const rejoined = await snapshot(guest, characterId)
    await applied(guest, characterId, expectedFrom(rejoined), changes)

    // A removed owner too.
    await rpcOk(
      owner.client.rpc('remove_campaign_member', {
        p_campaign_id: campaignId,
        p_profile_id: guest.id,
      }),
    )
    const afterRemoval = frozen(characterId)
    expect(await rpcError(applyUpdate(guest, characterId, expected, changes))).toEqual(UNAVAILABLE)
    expect(frozen(characterId)).toBe(afterRemoval)
    expect(importRows(characterId)).toBe('new|~|5;update|~|1')
  } finally {
    await cleanup(players, ids)
  }
})

test('a stale character, sheet, or item version fails the whole update and applies nothing', async () => {
  test.setTimeout(120_000)
  const players = await newCast()
  const { owner } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 conflicts')
    ids.push(campaignId)
    const characterId = await importedCharacter(owner, campaignId)
    const state = await snapshot(owner, characterId)
    const torch = state.items.find((item) => item.name === 'Torch')!
    const unchanged = frozen(characterId)
    const everything = {
      details: { level: 7 },
      vitals: { max_hp: 40, current_hp: 40 },
      items: { update: [{ id: torch.id, quantity: 9 }], add: [{ name: 'Extra' }] },
      coins: { gp: 99 },
    }
    const expected = expectedFrom(state)
    const conflict = { code: 'P0001', message: 'import_conflict' }

    expect(
      await rpcError(
        applyUpdate(owner, characterId, { ...expected, character_updated_at: STALE }, everything),
      ),
    ).toEqual(conflict)
    expect(
      await rpcError(
        applyUpdate(owner, characterId, { ...expected, sheet_updated_at: STALE }, everything),
      ),
    ).toEqual(conflict)
    expect(
      await rpcError(
        applyUpdate(owner, characterId, { ...expected, items: { [torch.id]: STALE } }, everything),
      ),
    ).toEqual(conflict)
    expect(frozen(characterId)).toBe(unchanged)
    expect(importRows(characterId)).toBe('new|~|5')

    // Every kind of edit made elsewhere after the review was loaded is a conflict.
    // 1. A coin change from another client moves the sheet token.
    await rpcOk(
      owner.client.rpc('adjust_character_currency', { p_character_id: characterId, p_gp: 1 }),
    )
    expect(await rpcError(applyUpdate(owner, characterId, expected, everything))).toEqual(conflict)
    // 2. A sheet save.
    const fresh = await snapshot(owner, characterId)
    await owner.client
      .from('character_sheets')
      .update({ max_hp: 25 })
      .eq('character_id', characterId)
    expect(
      await rpcError(applyUpdate(owner, characterId, expectedFrom(fresh), everything)),
    ).toEqual(conflict)
    // 3. A detail edit.
    const second = await snapshot(owner, characterId)
    await owner.client.from('characters').update({ background: 'Sage' }).eq('id', characterId)
    expect(
      await rpcError(applyUpdate(owner, characterId, expectedFrom(second), everything)),
    ).toEqual(conflict)
    // 4. An item edit, and 5. an item removal.
    const third = await snapshot(owner, characterId)
    await owner.client.from('character_items').update({ quantity: 4 }).eq('id', torch.id)
    expect(
      await rpcError(applyUpdate(owner, characterId, expectedFrom(third), everything)),
    ).toEqual(conflict)
    const fourth = await snapshot(owner, characterId)
    await owner.client.from('character_items').delete().eq('id', torch.id)
    expect(
      await rpcError(applyUpdate(owner, characterId, expectedFrom(fourth), everything)),
    ).toEqual(conflict)

    expect(importRows(characterId)).toBe('new|~|5')
    const after = await snapshot(owner, characterId)
    expect(after.character).toMatchObject({ level: 3, background: 'Sage' })
    expect(after.sheet).toMatchObject({ max_hp: 25, gp: 13 })
    expect(after.items.some((item) => item.name === 'Extra')).toBe(false)

    // The latest versions apply cleanly.
    await applied(owner, characterId, expectedFrom(after), {
      details: { level: 7 },
      vitals: { max_hp: 40, current_hp: 40 },
      items: { add: [{ name: 'Extra' }] },
      coins: { gp: 99 },
    })
    expect(importRows(characterId)).toBe('new|~|5;update|~|5')
  } finally {
    await cleanup(players, ids)
  }
})

test('an item that belongs to another character fails and changes nothing', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 foreign items')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const mine = await importedCharacter(guest, campaignId)
    const theirs = await importedCharacter(owner, campaignId)
    const foreign = (await snapshot(owner, theirs)).items.find((item) => item.name === 'Rope')!
    const before = await snapshot(guest, mine)
    const unchanged = frozen(mine)
    const foreignFrozen = frozen(theirs)
    const expected = { ...expectedFrom(before), items: { [foreign.id]: foreign.updated_at } }

    for (const changes of [
      { items: { remove: [foreign.id] }, details: { level: 8 } },
      { items: { update: [{ id: foreign.id, quantity: 7 }] }, details: { level: 8 } },
    ]) {
      expect(await rpcError(applyUpdate(guest, mine, expected, changes))).toEqual({
        code: 'P0001',
        message: 'import_conflict',
      })
    }
    // An id that is simply unknown behaves the same way.
    const ghost = { ...expectedFrom(before), items: { [RANDOM_ID]: foreign.updated_at } }
    expect(
      await rpcError(
        applyUpdate(guest, mine, ghost, { items: { remove: [RANDOM_ID] }, details: { level: 8 } }),
      ),
    ).toEqual({ code: 'P0001', message: 'import_conflict' })

    expect(frozen(mine)).toBe(unchanged)
    expect(frozen(theirs)).toBe(foreignFrozen)
    expect(importRows(mine)).toBe('new|~|5')
  } finally {
    await cleanup(players, ids)
  }
})

test('apply_character_update rejects malformed or forbidden payloads before changing anything', async () => {
  test.setTimeout(120_000)
  const players = await newCast()
  const { owner } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 update shape')
    ids.push(campaignId)
    const characterId = await importedCharacter(owner, campaignId)
    const state = await snapshot(owner, characterId)
    const expected = expectedFrom(state)
    const torch = state.items.find((item) => item.name === 'Torch')!
    const rope = state.items.find((item) => item.name === 'Rope')!
    const unchanged = frozen(characterId)
    const invalid = { code: '22023', message: 'import_invalid' }

    const changeCases: Array<[string, unknown]> = [
      ['null', null],
      ['an array', []],
      ['nothing selected', {}],
      ['only change_count', { change_count: 3 }],
      ['status', { status: 'deceased' }],
      ['in_party', { in_party: true }],
      ['sheet_visibility', { sheet_visibility: 'campaign' }],
      ['portrait_path', { portrait_path: 'a/b.png' }],
      ['status inside details', { details: { status: 'deceased' } }],
      ['a null name', { details: { name: null } }],
      ['empty details', { details: {} }],
      ['empty vitals', { vitals: {} }],
      ['empty coins', { coins: {} }],
      ['empty items', { items: {} }],
      ['empty item lists', { items: { add: [], update: [], remove: [] } }],
      ['a non-object sheet', { sheet: [] }],
      ['a null temp_hp', { vitals: { temp_hp: null } }],
      ['negative coin targets', { coins: { gp: -1 } }],
      ['coin targets over the limit', { coins: { gp: 10_000_000 } }],
      ['electrum', { coins: { ep: 1 } }],
      ['an item id in add', { items: { add: [{ id: torch.id, name: 'X' }] } }],
      ['an update without fields', { items: { update: [{ id: torch.id }] } }],
      ['an update without an id', { items: { update: [{ quantity: 2 }] } }],
      ['an unknown item key', { items: { update: [{ id: torch.id, cursed: true }] } }],
      ['a non-uuid remove', { items: { remove: ['rope'] } }],
      ['an unknown items key', { items: { replace: [] } }],
      [
        'an id targeted twice',
        { items: { remove: [torch.id], update: [{ id: torch.id, quantity: 1 }] } },
      ],
      ['an id removed twice', { items: { remove: [torch.id, torch.id] } }],
      [
        'an id without an expected version',
        { items: { remove: [RANDOM_ID.replace('dead', 'beef')] } },
      ],
      ['change_count zero', { details: { level: 4 }, change_count: 0 }],
      ['a fractional change_count', { details: { level: 4 }, change_count: 1.5 }],
    ]
    for (const [label, changes] of changeCases) {
      expect(await rpcError(applyUpdate(owner, characterId, expected, changes)), label).toEqual(
        invalid,
      )
      expect(frozen(characterId), label).toBe(unchanged)
    }

    const expectedCases: Array<[string, unknown]> = [
      ['null', null],
      [
        'no items',
        {
          character_updated_at: expected.character_updated_at,
          sheet_updated_at: expected.sheet_updated_at,
        },
      ],
      ['a bad timestamp', { ...expected, sheet_updated_at: 'not-a-time' }],
      ['a numeric timestamp', { ...expected, character_updated_at: 5 }],
      ['a bad item key', { ...expected, items: { rope: expected.sheet_updated_at } }],
      ['a bad item timestamp', { ...expected, items: { [rope.id]: 'soon' } }],
      ['an unknown key', { ...expected, extra: true }],
    ]
    for (const [label, bad] of expectedCases) {
      expect(
        await rpcError(applyUpdate(owner, characterId, bad, { details: { level: 4 } })),
        label,
      ).toEqual(invalid)
    }
    expect(
      await rpcError(
        applyUpdate(owner, null as unknown as string, expected, { details: { level: 4 } }),
      ),
    ).toMatchObject({
      code: '22023',
    })

    // Values a database rule rejects roll the whole update back, including earlier steps.
    const valueCases: Array<[string, unknown]> = [
      ['level 99', { details: { level: 99 }, items: { add: [{ name: 'Stays out' }] } }],
      ['a blank name', { details: { name: '' } }],
      ['current_hp above max_hp', { vitals: { max_hp: 10, current_hp: 11 } }],
      ['an invalid sheet body', { details: { level: 4 }, sheet: { version: 2 } }],
      [
        'an attack without an id',
        { details: { level: 4 }, sheet: { version: 1, attacks: [{ name: 'x' }] } },
      ],
      [
        'a bad item quantity',
        { details: { level: 4 }, items: { update: [{ id: torch.id, quantity: 10000 }] } },
      ],
      ['a blank item name', { details: { level: 4 }, items: { add: [{ name: ' ' }] } }],
    ]
    for (const [label, changes] of valueCases) {
      const result = await rpcError(applyUpdate(owner, characterId, expected, changes))
      expect(result, label).toEqual({ code: '22023', message: 'import_values_invalid' })
      expect(frozen(characterId), label).toBe(unchanged)
    }

    // Insufficient funds is not reachable through targets, but the cap is: 200 items fill the sheet.
    expect(
      await rpcError(
        applyUpdate(owner, characterId, expected, {
          items: { add: Array.from({ length: 198 }, (_, n) => ({ name: `Filler ${n}` })) },
        }),
      ),
    ).toEqual({ code: 'P0001', message: 'item_limit_reached' })
    expect(frozen(characterId)).toBe(unchanged)

    // A bad label is checked before any work.
    expect(
      await rpcError(
        applyUpdate(owner, characterId, expected, { details: { level: 4 } }, 'x'.repeat(121)),
      ),
    ).toEqual({ code: '22023', message: 'import_source_invalid' })
    expect(frozen(characterId)).toBe(unchanged)
    expect(importRows(characterId)).toBe('new|~|5')
  } finally {
    await cleanup(players, ids)
  }
})

test('removing items frees room under the cap for adds in the same update', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 cap swap')
    ids.push(campaignId)
    const full = await importedCharacter(
      owner,
      campaignId,
      payload({ items: Array.from({ length: 200 }, (_, n) => ({ name: `Item ${n}` })), coins: {} }),
    )
    const state = await snapshot(owner, full)
    expect(state.items).toHaveLength(200)
    const expected = expectedFrom(state)

    expect(
      await rpcError(
        applyUpdate(owner, full, expected, { items: { add: [{ name: 'One too many' }] } }),
      ),
    ).toEqual({ code: 'P0001', message: 'item_limit_reached' })

    const [first, second] = state.items
    await applied(owner, full, expected, {
      items: { remove: [first.id, second.id], add: [{ name: 'New A' }, { name: 'New B' }] },
    })
    const after = await snapshot(owner, full)
    expect(after.items).toHaveLength(200)
    expect(after.items.some((item) => item.id === first.id)).toBe(false)
    expect(after.items.map((item) => item.name)).toContain('New B')
  } finally {
    await cleanup(players, ids)
  }
})

test('parallel applies from one review: exactly one wins and the other conflicts', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 parallel apply')
    ids.push(campaignId)
    const characterId = await importedCharacter(owner, campaignId)
    const expected = expectedFrom(await snapshot(owner, characterId))
    const logBefore = coinLogCount(characterId)

    const results = await Promise.all(
      [1, 2, 3, 4].map(() =>
        applyUpdate(owner, characterId, expected, { details: { level: 6 }, coins: { gp: 50 } }),
      ),
    )
    const failures = results.filter((result) => result.error)
    expect(results.filter((result) => !result.error)).toHaveLength(1)
    expect(failures).toHaveLength(3)
    for (const failure of failures) expect(failure.error!.message).toBe('import_conflict')
    expect(purse(characterId)).toBe('0,4,50')
    expect(coinLogCount(characterId)).toBe(logBefore + 1)
    expect(importRows(characterId)).toBe('new|~|5;update|~|2')
  } finally {
    await cleanup(players, ids)
  }
})

test('an update that races a departure is applied completely or not at all', async () => {
  test.setTimeout(120_000)
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 departure race')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const characterId = await importedCharacter(guest, campaignId)

    for (let round = 0; round < 3; round += 1) {
      const state = await snapshot(guest, characterId)
      const level = 10 + round
      const gold = 100 + round
      const [update, leave] = await Promise.all([
        applyUpdate(guest, characterId, expectedFrom(state), {
          details: { level },
          coins: { gp: gold },
        }),
        guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }),
      ])
      expect(leave.error?.message ?? null).toBeNull()
      const stored = localDatabaseQuery(
        `select c.level || ',' || s.gp from public.characters c join public.character_sheets s on s.character_id = c.id
         where c.id = '${characterId}';`,
        {},
      )
      if (update.error) {
        expect(update.error.message).toBe('character_unavailable')
        expect(stored).toBe('3,12')
        expect(importRows(characterId)).toBe('new|~|5')
      } else {
        expect(stored).toBe(`${level},${gold}`)
        expect(importRows(characterId)).toBe('new|~|5;update|~|2')
      }

      // Reset for the next round and rejoin.
      localDatabaseQuery(
        `update public.characters set level = 3 where id = '${characterId}';
         update public.character_sheets set gp = 12 where character_id = '${characterId}';
         delete from public.character_imports where character_id = '${characterId}' and kind = 'update';`,
        {},
      )
      if (round < 2) await invite(owner, campaignId, guest)
    }
  } finally {
    await cleanup(players, ids)
  }
})

test('import history follows the sheet and cannot be written by clients', async () => {
  test.setTimeout(120_000)
  const players = await newCast()
  const { owner, guest, other, outsider } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 history')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    await invite(owner, campaignId, other)
    const characterId = await importedCharacter(guest, campaignId)
    await applied(
      guest,
      characterId,
      expectedFrom(await snapshot(guest, characterId)),
      {
        details: { level: 5 },
      },
      'update.json',
    )
    const count = async (who: Player) => {
      const { data, error } = await who.client
        .from('character_imports')
        .select('id')
        .eq('character_id', characterId)
      expect(error).toBeNull()
      return data!.length
    }

    // Private: only the owner reads it. The campaign owner, members, and outsiders do not.
    expect(await count(guest)).toBe(2)
    expect([await count(owner), await count(other), await count(outsider)]).toEqual([0, 0, 0])

    // Shared: current members read it. A non-member still does not.
    await guest.client
      .from('characters')
      .update({ sheet_visibility: 'campaign' })
      .eq('id', characterId)
    expect([await count(owner), await count(other)]).toEqual([2, 2])
    expect(await count(outsider)).toBe(0)

    // The rows are exactly what happened.
    const read = await guest.client
      .from('character_imports')
      .select('kind, source_label, change_count, imported_by, imported_at')
      .eq('character_id', characterId)
      .order('imported_at')
    expect(read.data).toEqual([
      expect.objectContaining({
        kind: 'new',
        source_label: null,
        change_count: 5,
        imported_by: guest.id,
      }),
      expect.objectContaining({
        kind: 'update',
        source_label: 'update.json',
        change_count: 1,
        imported_by: guest.id,
      }),
    ])

    // Clients cannot write, edit, or delete history, whoever they are.
    const target = (
      await guest.client.from('character_imports').select('id').eq('character_id', characterId)
    ).data![0].id
    for (const who of [guest, owner, other, outsider]) {
      const inserted = await who.client.from('character_imports').insert({
        character_id: characterId,
        imported_by: who.id,
        kind: 'update',
        change_count: 1,
      })
      expect(inserted.error?.code, 'insert').toBe('42501')
      const updated = await who.client
        .from('character_imports')
        .update({ change_count: 99 })
        .eq('id', target)
      expect(updated.error?.code, 'update').toBe('42501')
      const deleted = await who.client.from('character_imports').delete().eq('id', target)
      expect(deleted.error?.code, 'delete').toBe('42501')
    }
    expect(importRows(characterId)).toBe('new|~|5;update|update.json|1')

    // The helper is not reachable through the API.
    const viaApi = await guest.client.rpc('record_character_import', {
      p_character_id: characterId,
      p_kind: 'update',
      p_source_label: null,
      p_change_count: 1,
    })
    expect(viaApi.error).not.toBeNull()
    expect(importRows(characterId)).toBe('new|~|5;update|update.json|1')

    // Leaving hides it from everyone, including the leaver; rejoining restores it.
    await rpcOk(guest.client.rpc('leave_campaign', { p_campaign_id: campaignId }))
    expect([await count(guest), await count(owner), await count(other)]).toEqual([0, 0, 0])
    await invite(owner, campaignId, guest)
    expect(await count(guest)).toBe(2)

    // Deleting the character removes its history.
    const deleted = await guest.client.from('characters').delete().eq('id', characterId)
    expect(deleted.error).toBeNull()
    expect(importRows(characterId)).toBe('')
  } finally {
    await cleanup(players, ids)
  }
})

test('deleting a campaign or an account removes import history', async () => {
  test.setTimeout(90_000)
  const players = await newCast()
  const { owner, guest } = players
  const ids: string[] = []
  try {
    const campaignId = await createCampaign(owner, 'M8 history cascade')
    ids.push(campaignId)
    await invite(owner, campaignId, guest)
    const guestCharacter = await importedCharacter(guest, campaignId)
    const ownerCharacter = await importedCharacter(owner, campaignId)
    expect(importRows(guestCharacter)).not.toBe('')

    localDatabaseQuery(`delete from auth.users where id = '${guest.id}';`, {})
    expect(importRows(guestCharacter)).toBe('')
    expect(importRows(ownerCharacter)).not.toBe('')

    const deleted = await owner.client.from('campaigns').delete().eq('id', campaignId)
    expect(deleted.error).toBeNull()
    expect(importRows(ownerCharacter)).toBe('')
  } finally {
    await cleanup(players, ids)
  }
})
