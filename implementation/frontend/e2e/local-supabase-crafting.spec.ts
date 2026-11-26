import { expect, test } from '@playwright/test'
import { localDatabaseQuery } from './support/localSupabase.ts'
import {
  cleanup,
  createCampaign,
  invite,
  newPlayers,
  rpcError,
  rpcOk,
  type Player,
} from './support/localPlayers.ts'

// M04 Phase 1: the crafting catalogue (libraries, items, recipes, the pack import, and the
// campaign links) against the real local stack. The plan is §2, §3, §5, and §8.1. The long rest,
// visions, and inventory links arrive in later phases and are tested then.

const ROLES = ['anon', 'authenticated', 'service_role', 'public']
const FORMAT = 'the-goobers-guide-crafting-pack'

function holders(sql: (role: string) => string) {
  return localDatabaseQuery(
    `select coalesce(string_agg(r, ',' order by r), '') from unnest(array['${ROLES.join("','")}']) r
     where ${sql('r')};`,
    {},
  )
}

function columnsWith(table: string, role: string, privilege: string) {
  return localDatabaseQuery(
    `select coalesce(string_agg(attname, ',' order by attname), '') from pg_attribute
     where attrelid = 'public.${table}'::regclass and attnum > 0 and not attisdropped
       and has_column_privilege('${role}', 'public.${table}', attname, '${privilege}');`,
    {},
  )
}

// --- Fixtures ---------------------------------------------------------------------------------

type Json = Record<string, unknown>

function pack(content: Json, name = 'Test pack'): Json {
  return { format: FORMAT, version: 1, pack: { name }, ...content }
}

function item(id: string, name: string, extra: Json = {}): Json {
  return { id, name, category: 'material', rarity: 'common', value_gp: 1, ...extra }
}

/** The plan's §2.6 example. */
const wyvern = (): Json =>
  pack(
    {
      items: [
        item('wyvern-poison-gland', 'Wyvern Poison Gland', {
          rarity: 'uncommon',
          value_gp: 50,
          weight: 1,
          tags: ['wyvern'],
          harvest: { from: ['Wyvern'], skill: 'Medicine', dc: 15 },
        }),
        item('wyvern-fang', 'Wyvern Fang', {
          rarity: 'uncommon',
          value_gp: 40,
          weight: 0.5,
          tags: ['wyvern'],
        }),
        item('alchemical-base', 'Alchemical Base', { value_gp: 5 }),
        item('venom-blade-oil', 'Venom Blade Oil', {
          category: 'potion',
          rarity: 'uncommon',
          value_gp: 150,
          consumable: true,
          description: 'Coat one weapon or three pieces of ammunition.',
        }),
        item('wyvern-fang-dagger', 'Wyvern Fang Dagger', {
          category: 'weapon',
          rarity: 'uncommon',
          value_gp: 400,
          weight: 1,
          description: 'A +1 dagger.',
          dm_notes: 'Keep it from the first tier.',
        }),
        item('wyrmfang-blade', 'Wyrmfang Blade', {
          category: 'weapon',
          rarity: 'rare',
          value_gp: 4000,
          weight: 1,
          attunement: 'by a spellcaster',
        }),
      ],
      recipes: [
        {
          id: 'venom-blade-oil',
          output: { item: 'venom-blade-oil', quantity: 1 },
          key_materials: [{ item: 'wyvern-poison-gland', quantity: 1 }],
          materials: [{ item: 'alchemical-base', quantity: 2 }],
          crafting_cost_gp: 40,
          workdays: 5,
          tools: ["Poisoner's Kit"],
        },
        {
          id: 'wyvern-fang-dagger',
          output: { item: 'wyvern-fang-dagger', quantity: 1 },
          key_materials: [{ item: 'wyvern-fang', quantity: 2 }],
          materials: [{ item: 'wyvern-poison-gland', quantity: 1 }],
          crafting_cost_gp: 70,
          workdays: 10,
          tools: ["Smith's Tools"],
          requirements: 'Proficiency in Arcana.',
          check: { skill: 'Arcana', dc: 15 },
          dm_notes: 'Hidden from players.',
        },
        {
          id: 'wyrmfang-blade',
          output: { item: 'wyrmfang-blade', quantity: 1 },
          key_materials: [{ item: 'wyvern-fang-dagger', quantity: 1 }],
          materials: [
            { item: 'wyvern-poison-gland', quantity: 3 },
            { item: 'wyvern-fang', quantity: 4 },
          ],
          crafting_cost_gp: 1290,
          workdays: 50,
        },
      ],
    },
    'Wyvern Components',
  )

/** The smallest valid pack: two materials, a product, and one recipe. */
const base = (): Json =>
  pack({
    items: [item('alpha', 'Alpha'), item('beta', 'Beta'), item('product', 'Product')],
    recipes: [
      {
        id: 'product',
        output: { item: 'product', quantity: 1 },
        key_materials: [{ item: 'alpha', quantity: 1 }],
        materials: [{ item: 'beta', quantity: 2 }],
        crafting_cost_gp: 10,
        workdays: 1,
      },
    ],
  })

async function newLibrary(owner: Player, name = 'Library') {
  const { data, error } = await owner.client
    .from('crafting_libraries')
    .insert({ name })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data!.id as string
}

function importCall(owner: Player, libraryId: string, content: Json, label: string | null = null) {
  return owner.client.rpc('import_crafting_pack', {
    p_library_id: libraryId,
    p_pack: content as never,
    p_source_label: label as never,
  })
}

async function importOk(owner: Player, libraryId: string, content: Json) {
  const { data, error } = await importCall(owner, libraryId, content)
  expect(error?.message ?? null).toBeNull()
  return data as unknown as Record<string, number | string>
}

async function importFails(owner: Player, libraryId: string, content: Json) {
  const { error } = await importCall(owner, libraryId, content)
  expect(error, 'expected the import to fail').not.toBeNull()
  return { code: error!.code, message: error!.message, detail: error!.details }
}

/** A fingerprint of everything an import may touch, to prove a failed import changed nothing. */
function snapshot(libraryId: string) {
  return localDatabaseQuery(
    `select
       (select coalesce(md5(string_agg(row_to_json(i)::text, ',' order by i.slug)), '')
          from public.crafting_items as i where i.library_id = '${libraryId}')
       || '|' ||
       (select coalesce(md5(string_agg(row_to_json(r)::text, ',' order by r.slug)), '')
          from public.crafting_recipes as r where r.library_id = '${libraryId}')
       || '|' ||
       (select coalesce(md5(string_agg(row_to_json(m)::text, ',' order by m.recipe_id, m.item_id)), '')
          from public.crafting_recipe_materials as m where m.library_id = '${libraryId}')
       || '|' ||
       (select count(*) from public.crafting_pack_imports where library_id = '${libraryId}');`,
    {},
  )
}

function counts(libraryId: string) {
  return localDatabaseQuery(
    `select (select count(*) from public.crafting_items where library_id = '${libraryId}')
       || ',' || (select count(*) from public.crafting_recipes where library_id = '${libraryId}')
       || ',' || (select count(*) from public.crafting_recipe_materials where library_id = '${libraryId}');`,
    {},
  )
}

async function itemRows(owner: Player, libraryId: string) {
  const { data, error } = await owner.client
    .from('crafting_items')
    .select('*')
    .eq('library_id', libraryId)
    .order('slug')
  expect(error).toBeNull()
  return data!
}

async function enable(owner: Player, campaignId: string, libraryId: string, enabled = true) {
  return owner.client.rpc('set_campaign_crafting_library', {
    p_campaign_id: campaignId,
    p_library_id: libraryId,
    p_enabled: enabled,
  })
}

// --- Catalog and privileges -------------------------------------------------------------------

test.describe('catalog and privileges', () => {
  test('RLS, grants, policies, triggers, and function privileges are exactly the planned set', () => {
    const tables = [
      'crafting_libraries',
      'crafting_items',
      'crafting_recipes',
      'crafting_recipe_materials',
      'crafting_pack_imports',
      'campaign_crafting_libraries',
    ]
    for (const table of tables) {
      expect(
        localDatabaseQuery(
          `select relrowsecurity from pg_class where oid = 'public.${table}'::regclass;`,
          {},
        ),
        `${table} RLS`,
      ).toBe('t')
      for (const privilege of ['insert', 'update', 'delete', 'truncate', 'references', 'trigger']) {
        expect(
          holders((r) => `has_table_privilege(${r}, 'public.${table}', '${privilege}')`),
          `${table} ${privilege}`,
        ).toBe('')
      }
      expect(
        holders((r) => `has_table_privilege(${r}, 'public.${table}', 'select')`),
        `${table} select`,
      ).toBe('authenticated')
    }

    // Only libraries take direct writes, and only through their two columns (C1).
    expect(columnsWith('crafting_libraries', 'authenticated', 'insert')).toBe('description,name')
    expect(columnsWith('crafting_libraries', 'authenticated', 'update')).toBe('description,name')
    for (const table of tables.slice(1)) {
      expect(columnsWith(table, 'authenticated', 'insert'), `${table} insert`).toBe('')
      expect(columnsWith(table, 'authenticated', 'update'), `${table} update`).toBe('')
    }
    expect(columnsWith('crafting_libraries', 'anon', 'select')).toBe('')

    const executable = (signature: string) =>
      holders((r) => `has_function_privilege(${r}, '${signature}', 'execute')`)
    for (const signature of [
      'public.import_crafting_pack(uuid, jsonb, text)',
      'public.delete_crafting_library(uuid, boolean)',
      'public.set_campaign_crafting_library(uuid, uuid, boolean)',
    ]) {
      expect(executable(signature), signature).toBe('authenticated')
      expect(
        localDatabaseQuery(
          `select p.prosecdef::text || ':' || coalesce(array_to_string(p.proconfig, ','), '')
           from pg_proc as p where p.oid = '${signature}'::regprocedure;`,
          {},
        ),
        signature,
      ).toBe('true:search_path=""')
    }
    for (const signature of [
      'private.craft_fail(text)',
      'private.craft_text(jsonb, text, text, integer, boolean, boolean)',
      'private.craft_slug(jsonb, text, text, boolean)',
      'private.craft_enum(jsonb, text, text, text[])',
      'private.craft_int(jsonb, text, text, integer, integer, boolean)',
      'private.craft_decimal(jsonb, text, text, numeric, boolean)',
      'private.craft_bool(jsonb, text, text)',
      'private.craft_text_list(jsonb, text, text, integer, integer)',
      'private.craft_harvest(jsonb, text)',
      'private.crafting_text_array_ok(text[], integer, integer)',
      'private.guard_crafting_library_write()',
      'private.guard_crafting_catalogue_write()',
      'private.crafting_library_delete_recipes()',
    ]) {
      expect(executable(signature), signature).toBe('')
    }

    const policies = (table: string) =>
      localDatabaseQuery(
        `select string_agg(policyname || ':' || cmd, ' | ' order by policyname) from pg_policies
         where schemaname = 'public' and tablename = '${table}';`,
        {},
      )
    expect(policies('crafting_libraries')).toBe(
      'Owners create libraries:INSERT | Owners read their libraries:SELECT | Owners rename their libraries:UPDATE',
    )
    expect(policies('crafting_items')).toBe('Library owners read items:SELECT')
    expect(policies('crafting_recipes')).toBe('Library owners read recipes:SELECT')
    expect(policies('crafting_recipe_materials')).toBe(
      'Library owners read recipe materials:SELECT',
    )
    expect(policies('crafting_pack_imports')).toBe(
      'Library owners read their import history:SELECT',
    )
    expect(policies('campaign_crafting_libraries')).toBe(
      'Campaign owners read enabled libraries:SELECT',
    )

    const triggers = (table: string) =>
      localDatabaseQuery(
        `select coalesce(string_agg(tgname, ',' order by tgname), '') from pg_trigger
         where tgrelid = 'public.${table}'::regclass and not tgisinternal;`,
        {},
      )
    expect(triggers('crafting_libraries')).toBe(
      'crafting_libraries_delete_recipes,crafting_libraries_guard_write,crafting_libraries_set_updated_at',
    )
    expect(triggers('crafting_items')).toBe(
      'crafting_items_guard_write,crafting_items_set_updated_at',
    )
    expect(triggers('crafting_recipes')).toBe(
      'crafting_recipes_guard_write,crafting_recipes_set_updated_at',
    )

    // Deleting a library takes its whole catalogue with it; an item still used by a recipe can't go.
    expect(
      localDatabaseQuery(
        `select string_agg(conrelid::regclass::text || ':' || confdeltype::text, ',' order by conrelid::regclass::text || conname)
         from pg_constraint
         where confrelid in ('public.crafting_libraries'::regclass) and contype = 'f';`,
        {},
      ),
    ).toBe(
      'campaign_crafting_libraries:c,crafting_items:c,crafting_pack_imports:c,crafting_recipes:c',
    )
    expect(
      localDatabaseQuery(
        `select string_agg(conname || ':' || confdeltype::text, ',' order by conname)
         from pg_constraint
         where confrelid = 'public.crafting_items'::regclass and contype = 'f';`,
        {},
      ),
    ).toBe('crafting_recipe_materials_item_fkey:a,crafting_recipes_output_fkey:a')
  })

  test('every function rejects a signed-out call', async () => {
    const { players } = await newPlayers(['a'])
    const anon = (await import('./support/localSupabase.ts')).localClient()
    const { error } = await anon.rpc('import_crafting_pack', {
      p_library_id: '00000000-0000-4000-8000-000000000001',
      p_pack: {},
    })
    expect(error).not.toBeNull()
    expect(players.a.id).toBeTruthy()
  })
})

// --- Libraries --------------------------------------------------------------------------------

test.describe('libraries', () => {
  test('an owner creates, renames, and reads libraries; nobody else can see or change them', async () => {
    const { players } = await newPlayers(['dm', 'other'])
    const { dm, other } = players

    const id = await newLibrary(dm, 'Drakkenheim')
    const { data: rows } = await dm.client.from('crafting_libraries').select('*')
    expect(rows).toHaveLength(1)
    expect(rows![0]).toMatchObject({ id, owner_id: dm.id, name: 'Drakkenheim', description: null })

    // An empty description is stored as null.
    await dm.client.from('crafting_libraries').update({ description: '   ' }).eq('id', id)
    expect((await dm.client.from('crafting_libraries').select('description')).data![0]).toEqual({
      description: null,
    })
    expect(
      (await dm.client.from('crafting_libraries').update({ name: 'Renamed' }).eq('id', id).select())
        .data,
    ).toHaveLength(1)

    // Another DM sees nothing and changes nothing.
    expect((await other.client.from('crafting_libraries').select('id')).data).toEqual([])
    expect(
      (await other.client.from('crafting_libraries').update({ name: 'Mine' }).eq('id', id).select())
        .data,
    ).toEqual([])
    expect(
      localDatabaseQuery(`select name from public.crafting_libraries where id = '${id}';`, {}),
    ).toBe('Renamed')

    // Identity can't be changed, ownership can't be forged, and a library can't be deleted directly.
    const forged = await other.client
      .from('crafting_libraries')
      .insert({ name: 'Forged', owner_id: dm.id } as never)
    expect(forged.error).not.toBeNull()
    expect(
      (
        await dm.client
          .from('crafting_libraries')
          .update({ owner_id: other.id } as never)
          .eq('id', id)
      ).error,
    ).not.toBeNull()
    expect((await dm.client.from('crafting_libraries').delete().eq('id', id)).error).not.toBeNull()

    // Names are trimmed, 1 to 120 characters, with no control characters.
    for (const name of ['', ' padded ', 'x'.repeat(121), 'tab\there']) {
      expect(
        (await dm.client.from('crafting_libraries').insert({ name })).error,
        JSON.stringify(name),
      ).not.toBeNull()
    }
  })

  test('an owner may hold at most 20 libraries', async () => {
    const { players } = await newPlayers(['dm', 'other'])
    const { dm, other } = players
    for (let index = 0; index < 20; index += 1) await newLibrary(dm, `Library ${index}`)
    const { error } = await dm.client.from('crafting_libraries').insert({ name: 'One too many' })
    expect(error?.message).toBe('crafting_library_limit_reached')
    // The cap is per owner.
    await newLibrary(other, 'Fine')
  })
})

// --- Importing packs --------------------------------------------------------------------------

test.describe('import_crafting_pack', () => {
  test('imports the §2.6 example, then re-imports a corrected copy by slug', async () => {
    const { players } = await newPlayers(['dm'])
    const { dm } = players
    const libraryId = await newLibrary(dm, 'Wyvern Components')

    const first = await importOk(dm, libraryId, wyvern())
    expect(first).toMatchObject({
      items_added: 6,
      items_updated: 0,
      recipes_added: 3,
      recipes_updated: 0,
      items_removed: 0,
      recipes_removed: 0,
    })
    expect(counts(libraryId)).toBe('6,3,7')

    const items = await itemRows(dm, libraryId)
    const bySlug = Object.fromEntries(items.map((row) => [row.slug, row]))
    // Gold converts to whole copper.
    expect(bySlug['wyvern-poison-gland']).toMatchObject({
      name: 'Wyvern Poison Gland',
      name_key: 'wyvern poison gland',
      category: 'material',
      rarity: 'uncommon',
      value_cp: 5000,
      weight: 1,
      consumable: false,
      attunement: false,
      attunement_note: null,
      tags: ['wyvern'],
      harvest: { from: ['Wyvern'], skill: 'Medicine', dc: 15 },
    })
    expect(bySlug['wyvern-fang']).toMatchObject({ value_cp: 4000, weight: 0.5 })
    expect(bySlug['venom-blade-oil']).toMatchObject({ value_cp: 15000, consumable: true })
    expect(bySlug['wyrmfang-blade']).toMatchObject({
      attunement: true,
      attunement_note: 'by a spellcaster',
    })
    expect(bySlug['wyvern-fang-dagger']).toMatchObject({ dm_notes: 'Keep it from the first tier.' })

    const { data: recipes } = await dm.client
      .from('crafting_recipes')
      .select('*, crafting_recipe_materials(role, quantity, position, item_id)')
      .eq('library_id', libraryId)
      .order('slug')
    const dagger = recipes!.find((row) => row.slug === 'wyvern-fang-dagger')!
    expect(dagger).toMatchObject({
      output_quantity: 1,
      output_item_id: bySlug['wyvern-fang-dagger'].id,
      crafting_cost_cp: 7000,
      workdays: 10,
      tools: ["Smith's Tools"],
      requirements: 'Proficiency in Arcana.',
      check_skill: 'Arcana',
      check_dc: 15,
      dm_notes: 'Hidden from players.',
    })
    expect([...dagger.crafting_recipe_materials].sort((a, b) => a.position - b.position)).toEqual([
      { role: 'key', quantity: 2, position: 0, item_id: bySlug['wyvern-fang'].id },
      { role: 'other', quantity: 1, position: 1, item_id: bySlug['wyvern-poison-gland'].id },
    ])
    expect(recipes!.find((row) => row.slug === 'wyrmfang-blade')!.crafting_cost_cp).toBe(129000)

    // Re-import a corrected copy: a new value and cost, and different lines for the dagger.
    const corrected = wyvern() as { items: Json[]; recipes: Json[] }
    corrected.items[1].value_gp = 45
    corrected.items[1].name = 'Wyvern Fang (whole)'
    corrected.recipes[1].crafting_cost_gp = 65
    corrected.recipes[1].materials = [{ item: 'wyvern-poison-gland', quantity: 2 }]
    const second = await importOk(dm, libraryId, corrected as unknown as Json)
    expect(second).toMatchObject({
      items_added: 0,
      items_updated: 6,
      recipes_added: 0,
      recipes_updated: 3,
    })
    // Same rows (matched by slug), no duplicates, lines replaced.
    expect(counts(libraryId)).toBe('6,3,7')
    const after = await itemRows(dm, libraryId)
    expect(after.find((row) => row.slug === 'wyvern-fang')).toMatchObject({
      id: bySlug['wyvern-fang'].id,
      name: 'Wyvern Fang (whole)',
      value_cp: 4500,
    })
    const { data: again } = await dm.client
      .from('crafting_recipes')
      .select('id, crafting_cost_cp, crafting_recipe_materials(quantity)')
      .eq('id', dagger.id)
      .single()
    expect(again!.crafting_cost_cp).toBe(6500)
    expect(again!.crafting_recipe_materials.map((line) => line.quantity).sort()).toEqual([2, 2])

    // Every import is in the history.
    const { data: history } = await dm.client
      .from('crafting_pack_imports')
      .select('pack_name, source_label, items_added, items_updated, recipes_added, recipes_updated')
      .eq('library_id', libraryId)
      .order('imported_at')
    expect(history).toEqual([
      {
        pack_name: 'Wyvern Components',
        source_label: null,
        items_added: 6,
        items_updated: 0,
        recipes_added: 3,
        recipes_updated: 0,
      },
      {
        pack_name: 'Wyvern Components',
        source_label: null,
        items_added: 0,
        items_updated: 6,
        recipes_added: 0,
        recipes_updated: 3,
      },
    ])
  })

  test('a recipe-only pack may use items from an earlier import; the label is recorded', async () => {
    const { players } = await newPlayers(['dm'])
    const { dm } = players
    const libraryId = await newLibrary(dm)
    await importOk(dm, libraryId, pack({ items: base().items as Json[] }))
    const { error } = await importCall(
      dm,
      libraryId,
      pack({ recipes: base().recipes as Json[] }, 'Recipes only'),
      'recipes.json',
    )
    expect(error).toBeNull()
    expect(counts(libraryId)).toBe('3,1,2')
    const { data } = await dm.client
      .from('crafting_pack_imports')
      .select('source_label')
      .eq('pack_name', 'Recipes only')
    expect(data).toEqual([{ source_label: 'recipes.json' }])
  })

  test('numbers convert exactly and out-of-range or over-precise values are refused', async () => {
    const { players } = await newPlayers(['dm'])
    const { dm } = players
    const libraryId = await newLibrary(dm)
    await importOk(
      dm,
      libraryId,
      pack({
        items: [
          item('cheap', 'Cheap', { value_gp: 0.01 }),
          item('free', 'Free', { value_gp: 0 }),
          item('priceless', 'Priceless', { value_gp: 1_000_000, weight: 99999.99 }),
          item('odd', 'Odd', { value_gp: 1234.56, weight: 0.05 }),
        ],
      }),
    )
    const values = Object.fromEntries(
      (await itemRows(dm, libraryId)).map((row) => [row.slug, [row.value_cp, row.weight]]),
    )
    expect(values).toEqual({
      cheap: [1, null],
      free: [0, null],
      priceless: [100_000_000, 99999.99],
      odd: [123_456, 0.05],
    })

    const before = snapshot(libraryId)
    for (const [extra, path] of [
      [{ value_gp: 0.001 }, 'items[0].value_gp'],
      [{ value_gp: 1_000_000.01 }, 'items[0].value_gp'],
      [{ value_gp: -1 }, 'items[0].value_gp'],
      [{ value_gp: '5' }, 'items[0].value_gp'],
      [{ weight: 100000 }, 'items[0].weight'],
      [{ weight: 1.005 }, 'items[0].weight'],
    ] as Array<[Json, string]>) {
      const failure = await importFails(dm, libraryId, pack({ items: [item('x', 'X', extra)] }))
      expect(failure, JSON.stringify(extra)).toMatchObject({
        message: 'crafting_pack_invalid',
        detail: path,
      })
    }
    expect(snapshot(libraryId)).toBe(before)
  })

  test('an invalid pack is refused with the failing path and changes nothing', async () => {
    const { players } = await newPlayers(['dm'])
    const { dm } = players
    const libraryId = await newLibrary(dm)
    await importOk(dm, libraryId, base())
    const before = snapshot(libraryId)

    const manyItems = (count: number) =>
      Array.from({ length: count }, (_, index) => item(`m${index}`, `Material ${index}`))
    const lines = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ item: `m${index}`, quantity: 1 }))
    const recipe = (extra: Json): Json => ({
      id: 'r',
      output: { item: 'product', quantity: 1 },
      key_materials: [{ item: 'alpha', quantity: 1 }],
      crafting_cost_gp: 1,
      workdays: 1,
      ...extra,
    })
    const withBase = (recipes: Json[]) => pack({ items: base().items as Json[], recipes })

    const cases: Array<[string, Json, string, string]> = [
      ['wrong format', { ...base(), format: 'nope' }, 'crafting_pack_invalid', 'format'],
      ['wrong version', { ...base(), version: 2 }, 'crafting_pack_invalid', 'version'],
      ['unknown top-level key', { ...base(), extra: 1 }, 'crafting_pack_invalid', '$'],
      ['no pack name', { ...base(), pack: {} }, 'crafting_pack_invalid', 'pack.name'],
      ['nothing to import', pack({}), 'crafting_pack_invalid', '$'],
      ['empty lists', pack({ items: [], recipes: [] }), 'crafting_pack_invalid', '$'],
      ['items not a list', pack({ items: {} }), 'crafting_pack_invalid', 'items'],
      [
        'bad slug',
        pack({ items: [item('Bad Slug', 'Bad')] }),
        'crafting_pack_invalid',
        'items[0].id',
      ],
      [
        'duplicate slug',
        pack({ items: [item('a', 'A'), item('a', 'B')] }),
        'crafting_pack_invalid',
        'items[1].id',
      ],
      [
        'duplicate name',
        pack({ items: [item('a', 'Same'), item('b', ' SAME ')] }),
        'crafting_name_taken',
        'items[1].name',
      ],
      [
        'unknown item key',
        pack({ items: [item('a', 'A', { surprise: true })] }),
        'crafting_pack_invalid',
        'items[0]',
      ],
      [
        'bad category',
        pack({ items: [item('a', 'A', { category: 'gadget' })] }),
        'crafting_pack_invalid',
        'items[0].category',
      ],
      [
        'bad rarity',
        pack({ items: [item('a', 'A', { rarity: 'mythic' })] }),
        'crafting_pack_invalid',
        'items[0].rarity',
      ],
      [
        'control character in a name',
        pack({ items: [item('a', 'A\u0007')] }),
        'crafting_pack_invalid',
        'items[0].name',
      ],
      [
        'name too long',
        pack({ items: [item('a', 'x'.repeat(81))] }),
        'crafting_pack_invalid',
        'items[0].name',
      ],
      [
        'attunement of the wrong type',
        pack({ items: [item('a', 'A', { attunement: 3 })] }),
        'crafting_pack_invalid',
        'items[0].attunement',
      ],
      [
        'too many tags',
        pack({ items: [item('a', 'A', { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })] }),
        'crafting_pack_invalid',
        'items[0].tags',
      ],
      [
        'harvest dc out of range',
        pack({ items: [item('a', 'A', { harvest: { dc: 41 } })] }),
        'crafting_pack_invalid',
        'items[0].harvest.dc',
      ],
      [
        'unknown harvest key',
        pack({ items: [item('a', 'A', { harvest: { where: 'cave' } })] }),
        'crafting_pack_invalid',
        'items[0].harvest',
      ],
      [
        'recipe without key materials',
        withBase([recipe({ key_materials: [] })]),
        'crafting_pack_invalid',
        'recipes[0].key_materials',
      ],
      [
        'recipe missing key materials',
        withBase([{ ...recipe({}), key_materials: undefined }]),
        'crafting_pack_invalid',
        'recipes[0].key_materials',
      ],
      [
        'six key materials',
        pack({
          items: [...manyItems(6), item('product', 'Product')],
          recipes: [recipe({ key_materials: lines(6) })],
        }),
        'crafting_pack_invalid',
        'recipes[0].key_materials',
      ],
      [
        'twenty-one lines',
        pack({
          items: [...manyItems(21), item('product', 'Product')],
          recipes: [
            recipe({
              key_materials: lines(1),
              materials: lines(21).slice(1),
            }),
          ],
        }),
        'crafting_pack_invalid',
        'recipes[0].materials',
      ],
      [
        'the output as a material',
        withBase([recipe({ materials: [{ item: 'product', quantity: 1 }] })]),
        'crafting_pack_invalid',
        'recipes[0].materials[0].item',
      ],
      [
        'the same item twice',
        withBase([
          recipe({
            materials: [
              { item: 'beta', quantity: 1 },
              { item: 'alpha', quantity: 1 },
            ],
          }),
        ]),
        'crafting_pack_invalid',
        'recipes[0].materials[1].item',
      ],
      [
        'a quantity of zero',
        withBase([recipe({ key_materials: [{ item: 'alpha', quantity: 0 }] })]),
        'crafting_pack_invalid',
        'recipes[0].key_materials[0].quantity',
      ],
      [
        'a quantity of 1,000',
        withBase([recipe({ materials: [{ item: 'beta', quantity: 1000 }] })]),
        'crafting_pack_invalid',
        'recipes[0].materials[0].quantity',
      ],
      [
        'an unknown material',
        withBase([recipe({ materials: [{ item: 'ghost', quantity: 1 }] })]),
        'crafting_pack_reference_missing',
        'recipes[0].materials[0].item',
      ],
      [
        'an unknown output',
        withBase([recipe({ output: { item: 'ghost', quantity: 1 } })]),
        'crafting_pack_reference_missing',
        'recipes[0].output.item',
      ],
      [
        'a missing output',
        withBase([{ ...recipe({}), output: undefined }]),
        'crafting_pack_invalid',
        'recipes[0].output',
      ],
      [
        'a duplicate recipe slug',
        withBase([recipe({}), recipe({})]),
        'crafting_pack_invalid',
        'recipes[1].id',
      ],
      [
        'a check without a dc',
        withBase([recipe({ check: { skill: 'Arcana' } })]),
        'crafting_pack_invalid',
        'recipes[0].check.dc',
      ],
      [
        'negative workdays',
        withBase([recipe({ workdays: -1 })]),
        'crafting_pack_invalid',
        'recipes[0].workdays',
      ],
      [
        'too many tools',
        withBase([recipe({ tools: Array.from({ length: 11 }, (_, i) => `Tool ${i}`) })]),
        'crafting_pack_invalid',
        'recipes[0].tools',
      ],
      [
        'a bad removal slug',
        pack({ remove: { items: ['Not A Slug'] } }),
        'crafting_pack_invalid',
        'remove.items[0].s',
      ],
      [
        'an unknown removal key',
        pack({ remove: { things: ['a'] } }),
        'crafting_pack_invalid',
        'remove',
      ],
    ]

    for (const [label, content, message, detail] of cases) {
      const failure = await importFails(dm, libraryId, content)
      expect({ label, message: failure.message, detail: failure.detail }).toEqual({
        label,
        message,
        detail,
      })
    }
    expect(snapshot(libraryId)).toBe(before)

    // A pack that is valid except for its last recipe leaves the earlier items and recipes out.
    const failure = await importFails(
      dm,
      libraryId,
      pack({
        items: [item('fresh', 'Fresh'), ...(base().items as Json[])],
        recipes: [
          recipe({ id: 'good', key_materials: [{ item: 'fresh', quantity: 1 }] }),
          recipe({ id: 'bad', materials: [{ item: 'ghost', quantity: 1 }] }),
        ],
      }),
    )
    expect(failure.message).toBe('crafting_pack_reference_missing')
    expect(snapshot(libraryId)).toBe(before)
  })

  test('names are unique per library ignoring case, but a pack may swap two names', async () => {
    const { players } = await newPlayers(['dm'])
    const { dm } = players
    const libraryId = await newLibrary(dm)
    await importOk(dm, libraryId, pack({ items: [item('a', 'Alpha'), item('b', 'Beta')] }))
    const before = snapshot(libraryId)

    // A new slug taking an existing name, in any case or spacing.
    for (const name of ['alpha', ' ALPHA ', 'Beta']) {
      const failure = await importFails(dm, libraryId, pack({ items: [item('c', name)] }))
      expect(failure.message, name).toBe('crafting_name_taken')
      expect(failure.detail, name).toContain('(library_id, name_key)')
    }
    // An existing slug taking another item's name.
    expect((await importFails(dm, libraryId, pack({ items: [item('a', 'beta')] }))).message).toBe(
      'crafting_name_taken',
    )
    expect(snapshot(libraryId)).toBe(before)

    // Swapping two names in one import is fine.
    await importOk(dm, libraryId, pack({ items: [item('a', 'Beta'), item('b', 'Alpha')] }))
    expect((await itemRows(dm, libraryId)).map((row) => `${row.slug}=${row.name}`)).toEqual([
      'a=Beta',
      'b=Alpha',
    ])
    // Renaming one to a different case of its own name is fine too.
    await importOk(dm, libraryId, pack({ items: [item('a', 'BETA')] }))
  })

  test('removals delete what they list, and an item still in use can not be removed', async () => {
    const { players } = await newPlayers(['dm'])
    const { dm } = players
    const libraryId = await newLibrary(dm)
    await importOk(dm, libraryId, wyvern())
    expect(counts(libraryId)).toBe('6,3,7')
    const before = snapshot(libraryId)

    // Used as a material, as a key material, and as an output.
    for (const slug of [
      'wyvern-fang',
      'alchemical-base',
      'wyvern-fang-dagger',
      'venom-blade-oil',
    ]) {
      const failure = await importFails(dm, libraryId, pack({ remove: { items: [slug] } }))
      expect(failure, slug).toMatchObject({
        message: 'crafting_pack_reference_missing',
        detail: 'remove.items',
      })
    }
    // A pack's own recipe may not use an item it removes either.
    expect(
      (
        await importFails(
          dm,
          libraryId,
          pack({
            recipes: [{ ...(wyvern().recipes as Json[])[0] }],
            remove: { items: ['alchemical-base'] },
          }),
        )
      ).message,
    ).toBe('crafting_pack_reference_missing')
    expect(snapshot(libraryId)).toBe(before)

    // A recipe and the item only it used leave together; unknown slugs are ignored.
    const result = await importOk(
      dm,
      libraryId,
      pack({
        remove: {
          recipes: ['venom-blade-oil', 'never-existed'],
          items: ['venom-blade-oil', 'alchemical-base', 'never-existed'],
        },
      }),
    )
    expect(result).toMatchObject({ items_removed: 2, recipes_removed: 1 })
    expect(counts(libraryId)).toBe('4,2,5')
    expect((await itemRows(dm, libraryId)).map((row) => row.slug)).not.toContain('alchemical-base')
  })

  test('only the owner can import, and a library holds at most 2,000 items', async () => {
    const { players } = await newPlayers(['dm', 'other'])
    const { dm, other } = players
    const libraryId = await newLibrary(dm)

    // Another DM, a signed-in stranger, and a missing library all get the same error.
    for (const [client, id] of [
      [other, libraryId],
      [dm, '00000000-0000-4000-8000-00000000dead'],
    ] as Array<[Player, string]>) {
      expect(await rpcError(importCall(client, id, base()))).toEqual({
        code: 'P0001',
        message: 'crafting_library_unavailable',
      })
    }
    expect(counts(libraryId)).toBe('0,0,0')

    // Null arguments.
    expect(
      await rpcError(
        dm.client.rpc('import_crafting_pack', {
          p_library_id: null as never,
          p_pack: base() as never,
        }),
      ),
    ).toMatchObject({ code: '22023' })
    expect(
      await rpcError(
        dm.client.rpc('import_crafting_pack', { p_library_id: libraryId, p_pack: null as never }),
      ),
    ).toMatchObject({ code: '22023' })

    // 2,000 items fit in one import; one more does not.
    test.setTimeout(120_000)
    const items = (from: number, to: number) =>
      Array.from({ length: to - from }, (_, index) =>
        item(`bulk-${from + index}`, `Bulk ${from + index}`),
      )
    await importOk(dm, libraryId, pack({ items: items(0, 2000) }))
    expect(counts(libraryId)).toBe('2000,0,0')
    const before = snapshot(libraryId)
    expect(await importFails(dm, libraryId, pack({ items: items(2000, 2001) }))).toMatchObject({
      message: 'crafting_library_full',
      detail: 'items',
    })
    expect(await importFails(dm, libraryId, pack({ items: items(0, 2001) }))).toMatchObject({
      message: 'crafting_library_full',
    })
    expect(snapshot(libraryId)).toBe(before)
  })
})

// --- Hidden catalogue -------------------------------------------------------------------------

test.describe('hidden catalogue', () => {
  test('players and other DMs read no catalogue row, however they ask', async () => {
    const { players } = await newPlayers(['dm', 'player', 'other'])
    const { dm, player, other } = players
    const campaignId = await createCampaign(dm, 'Hidden')
    await invite(dm, campaignId, player)
    const libraryId = await newLibrary(dm, 'Secret')
    await importOk(dm, libraryId, wyvern())
    await rpcOk(enable(dm, campaignId, libraryId))

    const tables = [
      'crafting_libraries',
      'crafting_items',
      'crafting_recipes',
      'crafting_recipe_materials',
      'crafting_pack_imports',
      'campaign_crafting_libraries',
    ] as const
    for (const table of tables) {
      const mine = await dm.client.from(table).select('*')
      if (table === 'campaign_crafting_libraries') {
        expect(mine.data, table).toHaveLength(1)
      } else {
        expect(mine.data!.length, table).toBeGreaterThan(0)
      }
      for (const stranger of [player, other]) {
        const read = await stranger.client.from(table).select('*')
        expect(read.error, table).toBeNull()
        expect(read.data, `${stranger.username} ${table}`).toEqual([])
        // By id, by library, and with a join.
        const filtered = await stranger.client
          .from(table)
          .select('*')
          .eq('library_id' as never, libraryId)
        expect(filtered.data ?? [], table).toEqual([])
      }
    }
    // Embedding the catalogue through a table they can read returns nothing either.
    const embedded = await player.client.from('crafting_recipes').select('*, crafting_items(*)')
    expect(embedded.data).toEqual([])

    // No direct writes, for the owner or anyone else.
    const itemId = (await itemRows(dm, libraryId))[0].id
    for (const client of [dm, player, other]) {
      expect(
        (
          await client.client.from('crafting_items').insert({
            library_id: libraryId,
            slug: 'sneaky',
            name: 'Sneaky',
            category: 'other',
            rarity: 'common',
            value_cp: 0,
          } as never)
        ).error?.code,
      ).toBe('42501')
      expect(
        (await client.client.from('crafting_items').update({ name: 'Changed' }).eq('id', itemId))
          .error?.code,
      ).toBe('42501')
      expect(
        (await client.client.from('crafting_items').delete().eq('id', itemId)).error?.code,
      ).toBe('42501')
      expect(
        (await client.client.from('crafting_recipes').delete().eq('library_id', libraryId)).error
          ?.code,
      ).toBe('42501')
      expect(
        (
          await client.client
            .from('campaign_crafting_libraries')
            .delete()
            .eq('campaign_id', campaignId)
        ).error?.code,
      ).toBe('42501')
    }
    expect(counts(libraryId)).toBe('6,3,7')
  })
})

// --- delete_crafting_library ------------------------------------------------------------------

test.describe('delete_crafting_library', () => {
  test('reports its effect first, then deletes the whole catalogue', async () => {
    const { players } = await newPlayers(['dm', 'other'])
    const { dm, other } = players
    const first = await createCampaign(dm, 'One')
    const second = await createCampaign(dm, 'Two')
    const libraryId = await newLibrary(dm)
    await importOk(dm, libraryId, wyvern())
    await rpcOk(enable(dm, first, libraryId))
    await rpcOk(enable(dm, second, libraryId))

    // A stranger gets the same error as for a missing library.
    expect(
      await rpcError(
        other.client.rpc('delete_crafting_library', { p_library_id: libraryId, p_confirm: true }),
      ),
    ).toEqual({ code: 'P0001', message: 'crafting_library_unavailable' })
    expect(
      await rpcError(
        dm.client.rpc('delete_crafting_library', {
          p_library_id: libraryId,
          p_confirm: null as never,
        }),
      ),
    ).toMatchObject({ code: '22023' })

    // Without confirmation it only reports.
    const preview = await dm.client.rpc('delete_crafting_library', {
      p_library_id: libraryId,
      p_confirm: false,
    })
    expect(preview.error).toBeNull()
    expect(preview.data).toEqual({ campaigns: 2, saved: 0, linked_items: 0, deleted: false })
    expect(counts(libraryId)).toBe('6,3,7')

    const deleted = await dm.client.rpc('delete_crafting_library', {
      p_library_id: libraryId,
      p_confirm: true,
    })
    expect(deleted.data).toEqual({ campaigns: 2, saved: 0, linked_items: 0, deleted: true })
    expect(counts(libraryId)).toBe('0,0,0')
    expect(
      localDatabaseQuery(
        `select count(*) from public.campaign_crafting_libraries where library_id = '${libraryId}'
           or campaign_id in ('${first}', '${second}');
         `,
        {},
      ),
    ).toBe('0')
    expect(
      localDatabaseQuery(
        `select count(*) from public.crafting_pack_imports where library_id = '${libraryId}';`,
        {},
      ),
    ).toBe('0')
    expect((await dm.client.from('crafting_libraries').select('id')).data).toEqual([])
    await cleanup(players, [first, second])
  })
})

// --- set_campaign_crafting_library ------------------------------------------------------------

test.describe('set_campaign_crafting_library', () => {
  test('the campaign owner enables and disables their own libraries', async () => {
    const { players } = await newPlayers(['dm', 'player', 'other', 'stranger'])
    const { dm, player, other, stranger } = players
    const campaignId = await createCampaign(dm, 'Enable')
    await invite(dm, campaignId, player)
    const mine = await newLibrary(dm, 'Mine')
    const theirs = await newLibrary(other, 'Theirs')

    await rpcOk(enable(dm, campaignId, mine))
    // Enabling twice is harmless.
    await rpcOk(enable(dm, campaignId, mine))
    expect(
      (await dm.client.from('campaign_crafting_libraries').select('library_id, enabled_by')).data,
    ).toEqual([{ library_id: mine, enabled_by: dm.id }])

    // A member who isn't the owner, a stranger, and a missing campaign.
    expect(await rpcError(enable(player, campaignId, mine))).toEqual({
      code: '42501',
      message: 'crafting_campaign_owner_required',
    })
    expect(await rpcError(enable(player, campaignId, mine, false))).toEqual({
      code: '42501',
      message: 'crafting_campaign_owner_required',
    })
    for (const [client, id] of [
      [stranger, campaignId],
      [dm, '00000000-0000-4000-8000-00000000dead'],
    ] as Array<[Player, string]>) {
      expect(await rpcError(enable(client, id, mine))).toEqual({
        code: 'P0001',
        message: 'campaign_unavailable',
      })
    }
    // A library the owner doesn't own, or doesn't exist.
    for (const library of [theirs, '00000000-0000-4000-8000-00000000dead']) {
      expect(await rpcError(enable(dm, campaignId, library))).toEqual({
        code: 'P0001',
        message: 'crafting_library_unavailable',
      })
    }
    // Null arguments.
    expect(
      await rpcError(
        dm.client.rpc('set_campaign_crafting_library', {
          p_campaign_id: campaignId,
          p_library_id: mine,
          p_enabled: null as never,
        }),
      ),
    ).toMatchObject({ code: '22023' })

    // The owner lists them; a player can't tell which exist.
    expect(
      (await dm.client.from('campaign_crafting_libraries').select('library_id')).data,
    ).toHaveLength(1)
    expect(
      (await player.client.from('campaign_crafting_libraries').select('library_id')).data,
    ).toEqual([])

    // Disabling removes the link and nothing else, and repeats safely.
    await importOk(dm, mine, base())
    await rpcOk(enable(dm, campaignId, mine, false))
    await rpcOk(enable(dm, campaignId, mine, false))
    expect((await dm.client.from('campaign_crafting_libraries').select('library_id')).data).toEqual(
      [],
    )
    expect(counts(mine)).toBe('3,1,2')
    await cleanup(players, [campaignId])
  })

  test('a campaign enables at most 10 libraries', async () => {
    const { players } = await newPlayers(['dm'])
    const { dm } = players
    const campaignId = await createCampaign(dm, 'Limit')
    const libraries: string[] = []
    for (let index = 0; index < 11; index += 1) libraries.push(await newLibrary(dm, `L${index}`))
    for (const id of libraries.slice(0, 10)) await rpcOk(enable(dm, campaignId, id))
    expect(await rpcError(enable(dm, campaignId, libraries[10]))).toEqual({
      code: 'P0001',
      message: 'crafting_campaign_library_limit',
    })
    // Re-enabling one that is already enabled isn't a new link, and a free slot opens on disable.
    await rpcOk(enable(dm, campaignId, libraries[0]))
    await rpcOk(enable(dm, campaignId, libraries[0], false))
    await rpcOk(enable(dm, campaignId, libraries[10]))
    await cleanup(players, [campaignId])
  })

  test('a transfer leaves libraries enabled; the new owner can disable but not enable them', async () => {
    const { players } = await newPlayers(['dm', 'next'])
    const { dm, next } = players
    const campaignId = await createCampaign(dm, 'Transfer')
    await invite(dm, campaignId, next)
    const libraryId = await newLibrary(dm, 'Previous DM')
    await rpcOk(enable(dm, campaignId, libraryId))
    await rpcOk(
      dm.client.rpc('transfer_campaign_ownership', {
        p_campaign_id: campaignId,
        p_profile_id: next.id,
      }),
    )

    // Still enabled, and now listed for the new owner only.
    expect(
      (await next.client.from('campaign_crafting_libraries').select('library_id')).data,
    ).toEqual([{ library_id: libraryId }])
    expect((await dm.client.from('campaign_crafting_libraries').select('library_id')).data).toEqual(
      [],
    )
    // The previous DM keeps the library but no say over the campaign; the new owner can't use it.
    expect(await rpcError(enable(dm, campaignId, libraryId, false))).toEqual({
      code: '42501',
      message: 'crafting_campaign_owner_required',
    })
    await rpcOk(enable(next, campaignId, libraryId, false))
    expect(await rpcError(enable(next, campaignId, libraryId))).toEqual({
      code: 'P0001',
      message: 'crafting_library_unavailable',
    })
    expect(counts(libraryId)).toBe('0,0,0')
    await cleanup(players, [campaignId])
  })
})
