// Plain data for the Maker's Visions mocks. It stays free of imports from `src` so the browser
// tests don't depend on app code (the node config resolves relative imports strictly).

export type MockVision = Record<string, unknown> & { recipe_id: string }

export type MockVisions = {
  last_rest_at: string | null
  library_count: number
  visions: MockVision[]
  fragments: { id: string; new: boolean; held: string[]; missing: number }[]
  saved: MockVision[]
}

export const daggerVision: MockVision = {
  recipe_id: 'recipe-wyvern-fang-dagger',
  new: true,
  saved: false,
  output: {
    name: 'Wyvern Fang Dagger',
    category: 'weapon',
    rarity: 'uncommon',
    value_cp: 40000,
    weight: 1,
    consumable: false,
    attunement: null,
    description: 'A +1 dagger. On a critical hit, the target takes an extra 3d6 poison damage.',
    quantity: 1,
  },
  lines: [
    {
      role: 'key',
      item_id: 'item-wyvern-fang',
      name: 'Wyvern Fang',
      rarity: 'uncommon',
      value_cp: 4000,
      need: 2,
      have: 1,
    },
    {
      role: 'other',
      item_id: 'item-wyvern-poison-gland',
      name: 'Wyvern Poison Gland',
      rarity: 'uncommon',
      value_cp: 5000,
      need: 1,
      have: 1,
    },
  ],
  crafting_cost_cp: 7000,
  workdays: 10,
  tools: ["Smith's Tools"],
  requirements: 'Proficiency in Arcana.',
  check: null,
  notes: null,
}

export const oilVision: MockVision = {
  recipe_id: 'recipe-venom-blade-oil',
  new: false,
  saved: false,
  output: {
    name: 'Venom Blade Oil',
    category: 'potion',
    rarity: 'uncommon',
    value_cp: 15000,
    weight: null,
    consumable: true,
    attunement: null,
    description: null,
    quantity: 1,
  },
  lines: [
    {
      role: 'key',
      item_id: 'item-wyvern-poison-gland',
      name: 'Wyvern Poison Gland',
      rarity: 'uncommon',
      value_cp: 5000,
      need: 1,
      have: 1,
    },
    {
      role: 'other',
      item_id: 'item-alchemical-base',
      name: 'Alchemical Base',
      rarity: 'common',
      value_cp: 500,
      need: 2,
      have: 0,
    },
  ],
  crafting_cost_cp: 4000,
  workdays: 5,
  tools: ["Poisoner's Kit"],
  requirements: null,
  check: null,
  notes: null,
}

export const visionsDocument = (overrides: Partial<MockVisions> = {}): MockVisions => ({
  last_rest_at: '2026-11-27T21:04:00Z',
  library_count: 1,
  visions: [daggerVision, oilVision],
  fragments: [{ id: 'fragment-1', new: true, held: ['Wyvern Fang'], missing: 1 }],
  saved: [],
  ...overrides,
})

/** A small valid pack, as the DM would paste it. */
export const packText = JSON.stringify(
  {
    format: 'the-goobers-guide-crafting-pack',
    version: 1,
    pack: { name: 'Wyvern Components' },
    items: [
      {
        id: 'wyvern-fang',
        name: 'Wyvern Fang',
        category: 'material',
        rarity: 'uncommon',
        value_gp: 40,
      },
      {
        id: 'wyvern-fang-dagger',
        name: 'Wyvern Fang Dagger',
        category: 'weapon',
        rarity: 'uncommon',
        value_gp: 400,
      },
    ],
    recipes: [
      {
        id: 'wyvern-fang-dagger',
        output: { item: 'wyvern-fang-dagger', quantity: 1 },
        key_materials: [{ item: 'wyvern-fang', quantity: 2 }],
        crafting_cost_gp: 70,
        workdays: 10,
      },
    ],
  },
  null,
  2,
)
