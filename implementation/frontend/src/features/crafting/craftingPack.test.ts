import { describe, expect, it } from 'vitest'
import {
  craftingLimits,
  emptySnapshot,
  gpToCp,
  parseCraftingPack,
  type LibrarySnapshot,
} from './craftingPack'
import { editablePack, wyvernPack, wyvernText } from './craftingTestData'

function parse(pack: unknown, library?: LibrarySnapshot) {
  const result = parseCraftingPack(JSON.stringify(pack), library)
  if (result.kind !== 'parsed') throw new Error(result.message)
  return result
}

const issuePaths = (pack: unknown, library?: LibrarySnapshot) =>
  parse(pack, library).issues.map((issue) => issue.path)

const item = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  category: 'material',
  rarity: 'common',
  value_gp: 1,
  ...extra,
})

const wrap = (content: Record<string, unknown>) => ({
  format: 'the-goobers-guide-crafting-pack',
  version: 1,
  pack: { name: 'Test' },
  ...content,
})

describe('gpToCp', () => {
  it.each([
    [0, 0],
    [0.01, 1],
    [0.1, 10],
    [1, 100],
    [1234.56, 123_456],
    [1_000_000, 100_000_000],
    [19.99, 1999],
    [0.29, 29],
  ])('%s gp is %s cp', (gp, cp) => {
    expect(gpToCp(gp)).toBe(cp)
  })
})

describe('parseCraftingPack envelope', () => {
  it('reads the §2.6 example into the same pack with no issues', () => {
    const result = parse(wyvernPack)
    expect(result.issues).toEqual([])
    expect(result.ignored).toEqual([])
    expect(result.pack).toEqual(wyvernPack)
    expect(result.review).toEqual({
      name: 'Wyvern Components',
      source: 'Hamund’s Harvesting Handbook',
      itemsAdded: 6,
      itemsUpdated: 0,
      recipesAdded: 3,
      recipesUpdated: 0,
      itemsRemoved: 0,
      recipesRemoved: 0,
    })
  })

  it('removes a single Markdown fence', () => {
    const result = parseCraftingPack('```json\n' + wyvernText() + '\n```')
    expect(result).toMatchObject({ kind: 'parsed', issues: [] })
  })

  it.each([
    ['', 'Paste a document first.'],
    ['not json', 'That isn’t valid JSON'],
    ['[]', 'That isn’t a Goobers Guide document.'],
    ['{"format":"other","version":1}', 'That isn’t a Goobers Guide document.'],
  ])('rejects %j', (text, message) => {
    const result = parseCraftingPack(text)
    expect(result.kind).toBe('rejected')
    if (result.kind === 'rejected') expect(result.message).toContain(message)
  })

  it('names the right place for other Goober’s Guide documents', () => {
    const result = parseCraftingPack(
      JSON.stringify({ format: 'the-goobers-guide-character', version: 3 }),
    )
    expect(result).toEqual({
      kind: 'rejected',
      message:
        'This is a character document. Use Import character from the tent to create a new character.',
    })
  })

  it('asks for a new pack when the version differs', () => {
    const result = parseCraftingPack(JSON.stringify({ ...wyvernPack, version: 2 }))
    expect(result).toEqual({
      kind: 'rejected',
      message: expect.stringContaining('different format version'),
    })
  })

  it('refuses a pack with nothing in it, and a bad or missing name', () => {
    expect(parse(wrap({})).issues).toEqual([
      { path: '', message: 'The pack has no items, recipes, or removals.' },
    ])
    expect(issuePaths({ ...wrap({ items: [item('a', 'A')] }), pack: {} })).toEqual(['pack.name'])
    expect(
      issuePaths({ ...wrap({ items: [item('a', 'A')] }), pack: { name: 'x'.repeat(121) } }),
    ).toEqual(['pack.name'])
  })

  it('lists unknown keys and leaves them out of the pack', () => {
    const result = parse(
      wrap({
        surprise: 1,
        items: [item('a', 'A', { price: 5, harvest: { where: 'cave', dc: 10 } })],
      }),
    )
    expect(result.issues).toEqual([])
    expect(result.ignored).toEqual(['surprise', 'items[0].price', 'items[0].harvest.where'])
    expect(JSON.stringify(result.pack)).not.toContain('price')
    expect(result.pack?.items?.[0].harvest).toEqual({ dc: 10 })
  })
})

describe('items', () => {
  const only = (extra: Record<string, unknown>) => wrap({ items: [item('a', 'A', extra)] })

  it('accepts the largest allowed values', () => {
    const result = parse(
      wrap({
        items: [
          item('x'.repeat(80), 'n'.repeat(80), {
            value_gp: 1_000_000,
            weight: 99_999.99,
            description: 'd'.repeat(2000),
            tags: Array.from({ length: 10 }, (_, index) => 't'.repeat(39) + index),
            source: 's'.repeat(200),
            dm_notes: 'n'.repeat(2000),
            attunement: 'a'.repeat(120),
            harvest: {
              from: Array.from({ length: 10 }, () => 'f'.repeat(80)),
              skill: 's'.repeat(40),
              dc: 40,
              notes: 'n'.repeat(500),
            },
          }),
        ],
      }),
    )
    expect(result.issues).toEqual([])
  })

  it.each([
    ['a missing id', { id: undefined }, 'items[0].id'],
    ['an uppercase id', { id: 'Wyvern' }, 'items[0].id'],
    ['a double hyphen', { id: 'a--b' }, 'items[0].id'],
    ['an id with spaces', { id: 'a b' }, 'items[0].id'],
    ['an id of 81 characters', { id: 'x'.repeat(81) }, 'items[0].id'],
    ['a missing name', { name: undefined }, 'items[0].name'],
    ['an empty name', { name: '  ' }, 'items[0].name'],
    ['a name of 81 characters', { name: 'x'.repeat(81) }, 'items[0].name'],
    ['a line break in a name', { name: 'A\nB' }, 'items[0].name'],
    ['a name that is a number', { name: 5 }, 'items[0].name'],
    ['an unknown category', { category: 'gadget' }, 'items[0].category'],
    ['an unknown rarity', { rarity: 'mythic' }, 'items[0].rarity'],
    ['a missing value', { value_gp: undefined }, 'items[0].value_gp'],
    ['a value as text', { value_gp: '5' }, 'items[0].value_gp'],
    ['a negative value', { value_gp: -1 }, 'items[0].value_gp'],
    ['a value of three decimals', { value_gp: 0.001 }, 'items[0].value_gp'],
    ['a value above a million', { value_gp: 1_000_000.01 }, 'items[0].value_gp'],
    ['a weight above the limit', { weight: 100_000 }, 'items[0].weight'],
    ['a weight of three decimals', { weight: 1.005 }, 'items[0].weight'],
    ['consumable as text', { consumable: 'yes' }, 'items[0].consumable'],
    ['attunement as a number', { attunement: 3 }, 'items[0].attunement'],
    [
      'an attunement note of 121 characters',
      { attunement: 'x'.repeat(121) },
      'items[0].attunement',
    ],
    [
      'a description of 2,001 characters',
      { description: 'x'.repeat(2001) },
      'items[0].description',
    ],
    ['eleven tags', { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, 'items[0].tags'],
    ['a tag of 41 characters', { tags: ['x'.repeat(41)] }, 'items[0].tags[0]'],
    ['an empty tag', { tags: [''] }, 'items[0].tags[0]'],
    ['a source of 201 characters', { source: 'x'.repeat(201) }, 'items[0].source'],
    ['a harvest dc of 41', { harvest: { dc: 41 } }, 'items[0].harvest.dc'],
    ['a harvest dc of 0', { harvest: { dc: 0 } }, 'items[0].harvest.dc'],
    ['harvest as text', { harvest: 'cave' }, 'items[0].harvest'],
    [
      'eleven harvest sources',
      { harvest: { from: Array.from({ length: 11 }, () => 'x') } },
      'items[0].harvest.from',
    ],
    ['dm notes of 2,001 characters', { dm_notes: 'x'.repeat(2001) }, 'items[0].dm_notes'],
  ])('refuses %s', (_label, extra, path) => {
    const merged = { ...item('a', 'A'), ...extra }
    const result = parse(wrap({ items: [JSON.parse(JSON.stringify(merged))] }))
    expect(result.issues.map((issue) => issue.path)).toEqual([path])
    expect(result.pack).toBeNull()
    expect(result.review).toBeNull()
  })

  it('allows line breaks in a description but not other control characters', () => {
    expect(parse(only({ description: 'one\ntwo\tthree' })).issues).toEqual([])
    expect(issuePaths(only({ description: 'one\u0007two' }))).toEqual(['items[0].description'])
  })

  it('reads a string as an attunement requirement and a boolean as plain attunement', () => {
    expect(parse(only({ attunement: 'by a spellcaster' })).pack?.items?.[0].attunement).toBe(
      'by a spellcaster',
    )
    expect(parse(only({ attunement: false })).pack?.items?.[0].attunement).toBe(false)
  })

  it('trims text and treats empty optional text as missing', () => {
    const result = parse(only({ name: '  Spaced  ', description: '   ', source: '' }))
    expect(result.pack?.items?.[0]).toEqual({
      id: 'a',
      name: 'Spaced',
      category: 'material',
      rarity: 'common',
      value_gp: 1,
    })
  })

  it('reports every problem in a pack, with its path', () => {
    const result = parse(
      wrap({
        items: [item('a', 'A', { value_gp: -1 }), item('b', 'B', { rarity: 'mythic', weight: -2 })],
      }),
    )
    expect(result.issues.map((issue) => issue.path)).toEqual([
      'items[0].value_gp',
      'items[1].rarity',
      'items[1].weight',
    ])
    expect(result.issues[0].message).toContain('0 to 1,000,000')
  })

  it('refuses duplicate ids and duplicate names in one pack', () => {
    expect(issuePaths(wrap({ items: [item('a', 'A'), item('a', 'B')] }))).toEqual(['items[1].id'])
    expect(issuePaths(wrap({ items: [item('a', 'Same'), item('b', ' SAME ')] }))).toEqual([
      'items[1].name',
    ])
  })
})

describe('recipes', () => {
  const items = [item('alpha', 'Alpha'), item('beta', 'Beta'), item('product', 'Product')]
  const recipe = (extra: Record<string, unknown> = {}) => ({
    id: 'r',
    output: { item: 'product', quantity: 1 },
    key_materials: [{ item: 'alpha', quantity: 1 }],
    materials: [{ item: 'beta', quantity: 2 }],
    crafting_cost_gp: 10,
    workdays: 1,
    ...extra,
  })
  const withRecipe = (extra: Record<string, unknown> = {}) =>
    wrap({ items, recipes: [recipe(extra)] })

  it('accepts a recipe at the largest allowed values', () => {
    const many = Array.from({ length: 20 }, (_, index) => item(`m${index}`, `Material ${index}`))
    const result = parse(
      wrap({
        items: [...many, item('product', 'Product')],
        recipes: [
          recipe({
            id: 'r'.repeat(80),
            output: { item: 'product', quantity: 999 },
            key_materials: many.slice(0, 5).map((entry) => ({ item: entry.id, quantity: 999 })),
            materials: many.slice(5).map((entry) => ({ item: entry.id, quantity: 1 })),
            crafting_cost_gp: 1_000_000,
            workdays: 9999,
            tools: Array.from({ length: 10 }, () => 't'.repeat(80)),
            requirements: 'r'.repeat(500),
            check: { skill: 's'.repeat(40), dc: 40 },
            notes: 'n'.repeat(2000),
            source: 's'.repeat(200),
            dm_notes: 'd'.repeat(2000),
          }),
        ],
      }),
    )
    expect(result.issues).toEqual([])
  })

  it.each([
    ['no key materials', { key_materials: [] }, 'recipes[0].key_materials'],
    ['a missing key materials list', { key_materials: undefined }, 'recipes[0].key_materials'],
    ['a missing output', { output: undefined }, 'recipes[0].output'],
    [
      'an output quantity of zero',
      { output: { item: 'product', quantity: 0 } },
      'recipes[0].output.quantity',
    ],
    [
      'a quantity of 1,000',
      { materials: [{ item: 'beta', quantity: 1000 }] },
      'recipes[0].materials[0].quantity',
    ],
    [
      'a fractional quantity',
      { materials: [{ item: 'beta', quantity: 1.5 }] },
      'recipes[0].materials[0].quantity',
    ],
    ['a missing cost', { crafting_cost_gp: undefined }, 'recipes[0].crafting_cost_gp'],
    ['a cost of three decimals', { crafting_cost_gp: 1.234 }, 'recipes[0].crafting_cost_gp'],
    ['a missing workdays', { workdays: undefined }, 'recipes[0].workdays'],
    ['negative workdays', { workdays: -1 }, 'recipes[0].workdays'],
    ['10,000 workdays', { workdays: 10_000 }, 'recipes[0].workdays'],
    ['eleven tools', { tools: Array.from({ length: 11 }, (_, i) => `T${i}`) }, 'recipes[0].tools'],
    [
      'requirements of 501 characters',
      { requirements: 'x'.repeat(501) },
      'recipes[0].requirements',
    ],
    ['a check without a dc', { check: { skill: 'Arcana' } }, 'recipes[0].check.dc'],
    ['a check without a skill', { check: { dc: 10 } }, 'recipes[0].check.skill'],
    ['a check dc of 41', { check: { skill: 'Arcana', dc: 41 } }, 'recipes[0].check.dc'],
    ['notes of 2,001 characters', { notes: 'x'.repeat(2001) }, 'recipes[0].notes'],
    [
      'the output as a material',
      { materials: [{ item: 'product', quantity: 1 }] },
      'recipes[0].materials[0].item',
    ],
    [
      'the same item twice',
      {
        materials: [
          { item: 'beta', quantity: 1 },
          { item: 'alpha', quantity: 1 },
        ],
      },
      'recipes[0].materials[1].item',
    ],
    [
      'a bad item slug',
      { materials: [{ item: 'Bad Slug', quantity: 1 }] },
      'recipes[0].materials[0].item',
    ],
  ])('refuses %s', (_label, extra, path) => {
    const result = parse(JSON.parse(JSON.stringify(withRecipe(extra))))
    expect(result.issues.map((issue) => issue.path)).toEqual([path])
  })

  it('refuses six key materials and more than twenty lines', () => {
    const many = Array.from({ length: 22 }, (_, index) => item(`m${index}`, `Material ${index}`))
    const lines = (from: number, to: number) =>
      many.slice(from, to).map((entry) => ({ item: entry.id, quantity: 1 }))
    const base = { items: [...many, item('product', 'Product')] }
    expect(
      issuePaths(
        wrap({ ...base, recipes: [recipe({ key_materials: lines(0, 6), materials: [] })] }),
      ),
    ).toEqual(['recipes[0].key_materials'])
    expect(
      issuePaths(
        wrap({
          ...base,
          recipes: [recipe({ key_materials: lines(0, 1), materials: lines(1, 22) })],
        }),
      ),
    ).toEqual(['recipes[0].materials'])
  })

  it('refuses a repeated recipe id and a material that nothing provides', () => {
    expect(issuePaths(wrap({ items, recipes: [recipe(), recipe()] }))).toEqual(['recipes[1].id'])
    const unknown = parse(withRecipe({ materials: [{ item: 'ghost', quantity: 1 }] }))
    expect(unknown.issues).toEqual([
      {
        path: 'recipes[0].materials[0].item',
        message: expect.stringContaining('No item “ghost”'),
      },
    ])
  })

  it('lets a recipe-only pack use items already in the library', () => {
    const library: LibrarySnapshot = {
      items: new Map([
        ['alpha', 'Alpha'],
        ['beta', 'Beta'],
        ['product', 'Product'],
      ]),
      recipes: new Map(),
    }
    const result = parse(wrap({ recipes: [recipe()] }), library)
    expect(result.issues).toEqual([])
    expect(result.review).toMatchObject({ itemsAdded: 0, recipesAdded: 1 })
    expect(issuePaths(wrap({ recipes: [recipe()] }), emptySnapshot)).toEqual([
      'recipes[0].output.item',
      'recipes[0].key_materials[0].item',
      'recipes[0].materials[0].item',
    ])
  })

  it('drops empty optional lists from the normalized recipe', () => {
    const result = parse(withRecipe({ materials: [], tools: [] }))
    expect(result.pack?.recipes?.[0]).not.toHaveProperty('materials')
    expect(result.pack?.recipes?.[0]).not.toHaveProperty('tools')
  })
})

describe('against what the library holds', () => {
  const library: LibrarySnapshot = {
    items: new Map([
      ['a', 'Alpha'],
      ['b', 'Beta'],
      ['c', 'Gamma'],
    ]),
    recipes: new Map([['old', ['c', 'a']]]),
  }

  it('counts added, updated, and removed things by slug', () => {
    const result = parse(
      wrap({
        items: [item('a', 'Alpha'), item('new', 'New')],
        remove: { items: ['b', 'never-there'], recipes: ['old'] },
      }),
      library,
    )
    expect(result.issues).toEqual([])
    expect(result.review).toMatchObject({
      itemsAdded: 1,
      itemsUpdated: 1,
      itemsRemoved: 1,
      recipesRemoved: 1,
    })
  })

  it('refuses a new item that takes another item’s name, in any case', () => {
    expect(issuePaths(wrap({ items: [item('new', ' beta ')] }), library)).toEqual(['items[0].name'])
  })

  it('allows keeping a name, renaming an item, and swapping two names', () => {
    expect(parse(wrap({ items: [item('a', 'ALPHA')] }), library).issues).toEqual([])
    expect(parse(wrap({ items: [item('a', 'Renamed')] }), library).issues).toEqual([])
    expect(parse(wrap({ items: [item('a', 'Beta'), item('b', 'Alpha')] }), library).issues).toEqual(
      [],
    )
    // A removed item frees its name.
    expect(
      parse(wrap({ items: [item('new', 'Beta')], remove: { items: ['b'] } }), library).issues,
    ).toEqual([])
  })

  it('refuses removing an item a remaining recipe still uses', () => {
    expect(issuePaths(wrap({ remove: { items: ['a'] } }), library)).toEqual(['remove.items[0]'])
    // Removing the recipe at the same time is fine.
    expect(parse(wrap({ remove: { items: ['a'], recipes: ['old'] } }), library).issues).toEqual([])
  })

  it('refuses removing an item a recipe in the pack uses', () => {
    const pack = wrap({
      recipes: [
        {
          id: 'fresh',
          output: { item: 'b', quantity: 1 },
          key_materials: [{ item: 'a', quantity: 1 }],
          crafting_cost_gp: 1,
          workdays: 1,
        },
      ],
      remove: { items: ['b'] },
    })
    expect(issuePaths(pack, library)).toEqual(['recipes[0].output.item', 'remove.items[0]'])
  })

  it('refuses a pack that would take a library past its caps', () => {
    const itemsAtCap: LibrarySnapshot = {
      items: new Map(
        Array.from({ length: craftingLimits.itemsPerLibrary }, (_, index) => [
          `i${index}`,
          `Item ${index}`,
        ]),
      ),
      recipes: new Map(),
    }
    expect(parse(wrap({ items: [item('i0', 'Item 0')] }), itemsAtCap).issues).toEqual([])
    expect(issuePaths(wrap({ items: [item('extra', 'Extra')] }), itemsAtCap)).toEqual(['items'])
  })

  it('refuses a bad removal slug at its position', () => {
    expect(issuePaths(wrap({ remove: { items: ['ok', 'Not A Slug'] } }), library)).toEqual([
      'remove.items[1]',
    ])
  })
})

describe('editing the §2.6 example', () => {
  it('turns a corrected copy into updates against the first import', () => {
    const library: LibrarySnapshot = {
      items: new Map(wyvernPack.items!.map((entry) => [entry.id, entry.name])),
      recipes: new Map(
        wyvernPack.recipes!.map((entry) => [
          entry.id,
          [
            entry.output.item,
            ...entry.key_materials.map((line) => line.item),
            ...(entry.materials ?? []).map((line) => line.item),
          ],
        ]),
      ),
    }
    const pack = editablePack()
    pack.items[1].value_gp = 45
    const result = parse(pack, library)
    expect(result.issues).toEqual([])
    expect(result.review).toMatchObject({
      itemsAdded: 0,
      itemsUpdated: 6,
      recipesAdded: 0,
      recipesUpdated: 3,
    })
  })
})
