import type { CraftingLibrary, CraftingPack, LibraryContent } from './craftingTypes'

/** The plan's §2.6 example pack: the one fixture the crafting tests share. */
export const wyvernPack: CraftingPack = {
  format: 'the-goobers-guide-crafting-pack',
  version: 1,
  pack: { name: 'Wyvern Components', source: 'Hamund’s Harvesting Handbook' },
  items: [
    {
      id: 'wyvern-poison-gland',
      name: 'Wyvern Poison Gland',
      category: 'material',
      rarity: 'uncommon',
      value_gp: 50,
      weight: 1,
      tags: ['wyvern'],
      harvest: { from: ['Wyvern'], skill: 'Medicine', dc: 15 },
    },
    {
      id: 'wyvern-fang',
      name: 'Wyvern Fang',
      category: 'material',
      rarity: 'uncommon',
      value_gp: 40,
      weight: 0.5,
      tags: ['wyvern'],
    },
    {
      id: 'alchemical-base',
      name: 'Alchemical Base',
      category: 'material',
      rarity: 'common',
      value_gp: 5,
    },
    {
      id: 'venom-blade-oil',
      name: 'Venom Blade Oil',
      category: 'potion',
      rarity: 'uncommon',
      value_gp: 150,
      consumable: true,
      description:
        'Coat one weapon or three pieces of ammunition. For 1 minute, a hit deals an extra 2d6 poison damage.',
    },
    {
      id: 'wyvern-fang-dagger',
      name: 'Wyvern Fang Dagger',
      category: 'weapon',
      rarity: 'uncommon',
      value_gp: 400,
      weight: 1,
      description: 'A +1 dagger. On a critical hit, the target takes an extra 3d6 poison damage.',
    },
    {
      id: 'wyrmfang-blade',
      name: 'Wyrmfang Blade',
      category: 'weapon',
      rarity: 'rare',
      value_gp: 4000,
      weight: 1,
      attunement: true,
      description: 'A +2 dagger that deals an extra 1d6 poison damage on a hit.',
    },
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
      tools: ["Smith's Tools"],
      requirements: 'Proficiency in Arcana.',
    },
  ],
}

export const wyvernText = () => JSON.stringify(wyvernPack, null, 2)

/** A deep copy to edit in a test. */
export function editablePack() {
  return structuredClone(wyvernPack) as Required<CraftingPack>
}

/** The §2.6 pack as a library holds it: ids, copper, and each recipe's lines in order. */
export function contentFromPack(pack: CraftingPack = wyvernPack): LibraryContent {
  const idOf = (slug: string) => `item-${slug}`
  return {
    items: (pack.items ?? []).map((item) => ({
      id: idOf(item.id),
      slug: item.id,
      name: item.name,
      category: item.category,
      rarity: item.rarity,
      value_cp: Math.round(item.value_gp * 100),
      weight: item.weight ?? null,
      consumable: item.consumable ?? false,
      attunement: Boolean(item.attunement),
      attunement_note: typeof item.attunement === 'string' ? item.attunement : null,
      description: item.description ?? null,
      tags: item.tags ?? [],
      source: item.source ?? null,
      harvest: item.harvest ?? null,
      dm_notes: item.dm_notes ?? null,
    })),
    recipes: (pack.recipes ?? []).map((recipe) => ({
      id: `recipe-${recipe.id}`,
      slug: recipe.id,
      output_item_id: idOf(recipe.output.item),
      output_quantity: recipe.output.quantity,
      crafting_cost_cp: Math.round(recipe.crafting_cost_gp * 100),
      workdays: recipe.workdays,
      tools: recipe.tools ?? [],
      requirements: recipe.requirements ?? null,
      check_skill: recipe.check?.skill ?? null,
      check_dc: recipe.check?.dc ?? null,
      notes: recipe.notes ?? null,
      source: recipe.source ?? null,
      dm_notes: recipe.dm_notes ?? null,
      lines: [
        ...recipe.key_materials.map((line) => ({ role: 'key' as const, line })),
        ...(recipe.materials ?? []).map((line) => ({ role: 'other' as const, line })),
      ].map(({ role, line }, position) => ({
        role,
        item_id: idOf(line.item),
        quantity: line.quantity,
        position,
      })),
    })),
  }
}

export const library = (overrides: Partial<CraftingLibrary> = {}): CraftingLibrary => ({
  id: 'lib-1',
  name: 'Wyvern Components',
  description: null,
  created_at: '2026-11-27T10:00:00Z',
  updated_at: '2026-11-27T10:00:00Z',
  ...overrides,
})
