import { itemRarities, type ItemRarity } from '../characters/characterTypes'
import {
  checkEnvelope,
  craftingPackVersion,
  documentFormats,
  isRecord,
  readJsonDocument,
  regenerateCraftingMessage,
} from '../characters/importText'
import {
  craftingCategories,
  type CraftingCategory,
  type CraftingPack,
  type PackHarvest,
  type PackItem,
  type PackLine,
  type PackRecipe,
} from './craftingTypes'

/**
 * The crafting pack parser (M04 plan §2.7, client layer). It checks every field against the same
 * limits the database enforces, collects readable path-level problems, drops unknown keys (and
 * lists them), and returns a normalized pack ready for `import_crafting_pack`. Nothing here saves
 * anything. The server validates everything again.
 */

/** Every limit in the pack format. The pack prompt states these same numbers. */
export const craftingLimits = {
  packName: 120,
  packSource: 200,
  packDescription: 2000,
  slug: 80,
  itemName: 80,
  itemDescription: 2000,
  valueGpMax: 1_000_000,
  weightMax: 99_999.99,
  attunementNote: 120,
  tags: 10,
  tagLength: 40,
  source: 200,
  dmNotes: 2000,
  harvestFrom: 10,
  harvestFromLength: 80,
  harvestSkill: 40,
  harvestNotes: 500,
  dcMin: 1,
  dcMax: 40,
  quantityMin: 1,
  quantityMax: 999,
  keyMaterialsMin: 1,
  keyMaterialsMax: 5,
  lines: 20,
  craftingCostGpMax: 1_000_000,
  workdaysMax: 9999,
  tools: 10,
  toolLength: 80,
  requirements: 500,
  checkSkill: 40,
  notes: 2000,
  itemsPerLibrary: 2000,
  recipesPerLibrary: 2000,
  librariesPerOwner: 20,
  librariesPerCampaign: 10,
  libraryName: 120,
  libraryDescription: 2000,
  importLabel: 120,
} as const

/** The 2024 DMG crafting guideline per rarity, in gold (plan §2.5); a hint only. */
export const rarityGuidelines: Partial<Record<ItemRarity, { costGp: number; workdays: number }>> = {
  common: { costGp: 50, workdays: 5 },
  uncommon: { costGp: 200, workdays: 10 },
  rare: { costGp: 2000, workdays: 50 },
  very_rare: { costGp: 20_000, workdays: 125 },
  legendary: { costGp: 100_000, workdays: 250 },
}

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/
// eslint-disable-next-line no-control-regex
const singleLineControls = /[\u0000-\u001f\u007f-\u009f]/
// Newlines and tabs are allowed in descriptions and notes; other control characters are not.
// eslint-disable-next-line no-control-regex
const multilineControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

const n = (value: number) => value.toLocaleString('en-US')

/** Gold with at most two decimals as whole copper, exactly (1,234.56 gp is 123,456 cp). */
export function gpToCp(gp: number) {
  return Math.round(gp * 100)
}

export type PackIssue = { path: string; message: string }

/** What a library holds now, so a pack can be checked and counted against it. */
export type LibrarySnapshot = {
  /** Item slug to name. */
  items: ReadonlyMap<string, string>
  /** Recipe slug to every item slug it uses (the output and all lines). */
  recipes: ReadonlyMap<string, readonly string[]>
}

export const emptySnapshot: LibrarySnapshot = { items: new Map(), recipes: new Map() }

export type PackReview = {
  name: string
  source: string | null
  itemsAdded: number
  itemsUpdated: number
  recipesAdded: number
  recipesUpdated: number
  itemsRemoved: number
  recipesRemoved: number
}

export type PackParse =
  | { kind: 'rejected'; message: string }
  | {
      kind: 'parsed'
      /** The normalized pack, only when there are no issues. */
      pack: CraftingPack | null
      issues: PackIssue[]
      /** Keys the format does not have, listed under "Not imported". */
      ignored: string[]
      /** The counts the DM confirms, only when there are no issues. */
      review: PackReview | null
    }

type Rec = Record<string, unknown>

type TextOptions = { max: number; required?: boolean; multiline?: boolean }

/** The shared reading helpers; each returns the normalized value, or undefined after noting why. */
function createReader() {
  const issues: PackIssue[] = []
  const ignored: string[] = []

  const fail = (path: string, message: string) => {
    issues.push({ path, message })
  }

  const field = (path: string, key: string) => (path ? `${path}.${key}` : key)

  /** An object with only the allowed keys; any other key is dropped and listed. */
  function object(value: unknown, allowed: readonly string[], path: string): Rec | undefined {
    if (!isRecord(value)) {
      fail(path, 'This must be an object.')
      return undefined
    }
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) ignored.push(field(path, key))
    }
    return value
  }

  const missing = (value: unknown) => value === undefined || value === null

  function text(obj: Rec, key: string, path: string, options: TextOptions): string | undefined {
    const at = field(path, key)
    const value = obj[key]
    if (missing(value)) {
      if (options.required) fail(at, 'This is required.')
      return undefined
    }
    if (typeof value !== 'string') {
      fail(at, 'This must be text.')
      return undefined
    }
    const trimmed = value.trim()
    if (trimmed === '') {
      if (options.required) fail(at, 'This can’t be empty.')
      return undefined
    }
    if (trimmed.length > options.max) {
      fail(at, `Use at most ${n(options.max)} characters.`)
      return undefined
    }
    if ((options.multiline ? multilineControls : singleLineControls).test(trimmed)) {
      fail(at, 'This has characters that can’t be kept.')
      return undefined
    }
    return trimmed
  }

  function slug(obj: Rec, key: string, path: string, required = true): string | undefined {
    const at = field(path, key)
    const value = obj[key]
    if (missing(value)) {
      if (required) fail(at, 'This is required.')
      return undefined
    }
    if (
      typeof value !== 'string' ||
      value.length < 1 ||
      value.length > craftingLimits.slug ||
      !slugPattern.test(value)
    ) {
      fail(
        at,
        `Use lowercase letters, numbers, and single hyphens, up to ${craftingLimits.slug} characters (for example "wyvern-fang").`,
      )
      return undefined
    }
    return value
  }

  function integer(
    obj: Rec,
    key: string,
    path: string,
    min: number,
    max: number,
    required = false,
  ): number | undefined {
    const at = field(path, key)
    const value = obj[key]
    if (missing(value)) {
      if (required) fail(at, 'This is required.')
      return undefined
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      fail(at, `Use a whole number from ${n(min)} to ${n(max)}.`)
      return undefined
    }
    return value
  }

  /** A number from 0 to `max` with at most two decimals (gold values and weights). */
  function decimal(
    obj: Rec,
    key: string,
    path: string,
    max: number,
    required = false,
  ): number | undefined {
    const at = field(path, key)
    const value = obj[key]
    if (missing(value)) {
      if (required) fail(at, 'This is required.')
      return undefined
    }
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > max ||
      Math.abs(value * 100 - Math.round(value * 100)) > 1e-6
    ) {
      fail(at, `Use a number from 0 to ${n(max)} with at most two decimals.`)
      return undefined
    }
    return value
  }

  function boolean(obj: Rec, key: string, path: string): boolean | undefined {
    const value = obj[key]
    if (missing(value)) return undefined
    if (typeof value !== 'boolean') {
      fail(field(path, key), 'Use true or false.')
      return undefined
    }
    return value
  }

  function textList(
    obj: Rec,
    key: string,
    path: string,
    maxCount: number,
    maxLength: number,
  ): string[] | undefined {
    const at = field(path, key)
    const value = obj[key]
    if (missing(value)) return undefined
    if (!Array.isArray(value) || value.length > maxCount) {
      fail(at, `Use a list of at most ${maxCount} entries.`)
      return undefined
    }
    const list: string[] = []
    for (const [index, entry] of value.entries()) {
      const trimmed = typeof entry === 'string' ? entry.trim() : ''
      if (trimmed === '' || trimmed.length > maxLength || singleLineControls.test(trimmed)) {
        fail(`${at}[${index}]`, `Use one line of 1 to ${maxLength} characters.`)
        continue
      }
      list.push(trimmed)
    }
    return list
  }

  return { issues, ignored, fail, field, object, text, slug, integer, decimal, boolean, textList }
}

type Reader = ReturnType<typeof createReader>

function setIf<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined) {
  if (value !== undefined) target[key] = value
}

function readHarvest(reader: Reader, obj: Rec, path: string): PackHarvest | undefined {
  if (obj.harvest === undefined || obj.harvest === null) return undefined
  const at = reader.field(path, 'harvest')
  const record = reader.object(obj.harvest, ['from', 'skill', 'dc', 'notes'], at)
  if (!record) return undefined
  const harvest: PackHarvest = {}
  const from = reader.textList(
    record,
    'from',
    at,
    craftingLimits.harvestFrom,
    craftingLimits.harvestFromLength,
  )
  if (from && from.length > 0) harvest.from = from
  setIf(harvest, 'skill', reader.text(record, 'skill', at, { max: craftingLimits.harvestSkill }))
  setIf(harvest, 'dc', reader.integer(record, 'dc', at, craftingLimits.dcMin, craftingLimits.dcMax))
  setIf(
    harvest,
    'notes',
    reader.text(record, 'notes', at, { max: craftingLimits.harvestNotes, multiline: true }),
  )
  return Object.keys(harvest).length > 0 ? harvest : undefined
}

function readItem(reader: Reader, value: unknown, path: string): PackItem | undefined {
  const record = reader.object(
    value,
    [
      'id',
      'name',
      'category',
      'rarity',
      'value_gp',
      'weight',
      'consumable',
      'attunement',
      'description',
      'tags',
      'source',
      'harvest',
      'dm_notes',
    ],
    path,
  )
  if (!record) return undefined

  const before = reader.issues.length
  const id = reader.slug(record, 'id', path)
  const name = reader.text(record, 'name', path, { max: craftingLimits.itemName, required: true })
  const category = record.category
  if (!craftingCategories.includes(category as CraftingCategory)) {
    reader.fail(reader.field(path, 'category'), `Use one of: ${craftingCategories.join(', ')}.`)
  }
  const rarity = record.rarity
  if (!itemRarities.includes(rarity as ItemRarity)) {
    reader.fail(reader.field(path, 'rarity'), `Use one of: ${itemRarities.join(', ')}.`)
  }
  const valueGp = reader.decimal(record, 'value_gp', path, craftingLimits.valueGpMax, true)

  const item: Partial<PackItem> = {}
  setIf(item, 'weight', reader.decimal(record, 'weight', path, craftingLimits.weightMax))
  setIf(item, 'consumable', reader.boolean(record, 'consumable', path))
  if (record.attunement !== undefined && record.attunement !== null) {
    if (typeof record.attunement === 'boolean') item.attunement = record.attunement
    else {
      item.attunement = reader.text(record, 'attunement', path, {
        max: craftingLimits.attunementNote,
        required: true,
      })
    }
  }
  setIf(
    item,
    'description',
    reader.text(record, 'description', path, {
      max: craftingLimits.itemDescription,
      multiline: true,
    }),
  )
  const tags = reader.textList(record, 'tags', path, craftingLimits.tags, craftingLimits.tagLength)
  if (tags && tags.length > 0) item.tags = tags
  setIf(item, 'source', reader.text(record, 'source', path, { max: craftingLimits.source }))
  setIf(item, 'harvest', readHarvest(reader, record, path))
  setIf(
    item,
    'dm_notes',
    reader.text(record, 'dm_notes', path, { max: craftingLimits.dmNotes, multiline: true }),
  )

  if (reader.issues.length > before || id === undefined || name === undefined) return undefined
  return {
    id,
    name,
    category: category as CraftingCategory,
    rarity: rarity as ItemRarity,
    value_gp: valueGp as number,
    ...item,
  }
}

/** One material line: an item slug and a quantity. */
function readLine(reader: Reader, value: unknown, path: string): PackLine | undefined {
  const record = reader.object(value, ['item', 'quantity'], path)
  if (!record) return undefined
  const before = reader.issues.length
  const item = reader.slug(record, 'item', path)
  const quantity = reader.integer(
    record,
    'quantity',
    path,
    craftingLimits.quantityMin,
    craftingLimits.quantityMax,
    true,
  )
  if (reader.issues.length > before || item === undefined || quantity === undefined) {
    return undefined
  }
  return { item, quantity }
}

function readLines(
  reader: Reader,
  obj: Rec,
  key: 'key_materials' | 'materials',
  path: string,
  required: boolean,
): PackLine[] | undefined {
  const at = reader.field(path, key)
  const value = obj[key]
  if (value === undefined || value === null) {
    if (required) reader.fail(at, 'Every recipe needs at least one key material.')
    return required ? undefined : []
  }
  if (!Array.isArray(value)) {
    reader.fail(at, 'This must be a list.')
    return undefined
  }
  if (key === 'key_materials') {
    if (
      value.length < craftingLimits.keyMaterialsMin ||
      value.length > craftingLimits.keyMaterialsMax
    ) {
      reader.fail(
        at,
        `Use ${craftingLimits.keyMaterialsMin} to ${craftingLimits.keyMaterialsMax} key materials.`,
      )
      return undefined
    }
  }
  const lines: PackLine[] = []
  for (const [index, entry] of value.entries()) {
    const line = readLine(reader, entry, `${at}[${index}]`)
    if (line) lines.push(line)
  }
  return lines
}

function readRecipe(reader: Reader, value: unknown, path: string): PackRecipe | undefined {
  const record = reader.object(
    value,
    [
      'id',
      'output',
      'key_materials',
      'materials',
      'crafting_cost_gp',
      'workdays',
      'tools',
      'requirements',
      'check',
      'notes',
      'source',
      'dm_notes',
    ],
    path,
  )
  if (!record) return undefined

  const before = reader.issues.length
  const id = reader.slug(record, 'id', path)
  const output = readLine(reader, record.output, reader.field(path, 'output'))
  const keyMaterials = readLines(reader, record, 'key_materials', path, true)
  const materials = readLines(reader, record, 'materials', path, false)
  const cost = reader.decimal(
    record,
    'crafting_cost_gp',
    path,
    craftingLimits.craftingCostGpMax,
    true,
  )
  const workdays = reader.integer(record, 'workdays', path, 0, craftingLimits.workdaysMax, true)

  const recipe: Partial<PackRecipe> = {}
  const tools = reader.textList(
    record,
    'tools',
    path,
    craftingLimits.tools,
    craftingLimits.toolLength,
  )
  if (tools && tools.length > 0) recipe.tools = tools
  setIf(
    recipe,
    'requirements',
    reader.text(record, 'requirements', path, {
      max: craftingLimits.requirements,
      multiline: true,
    }),
  )
  if (record.check !== undefined && record.check !== null) {
    const at = reader.field(path, 'check')
    const check = reader.object(record.check, ['skill', 'dc'], at)
    if (check) {
      const skill = reader.text(check, 'skill', at, {
        max: craftingLimits.checkSkill,
        required: true,
      })
      const dc = reader.integer(check, 'dc', at, craftingLimits.dcMin, craftingLimits.dcMax, true)
      if (skill !== undefined && dc !== undefined) recipe.check = { skill, dc }
    }
  }
  setIf(
    recipe,
    'notes',
    reader.text(record, 'notes', path, { max: craftingLimits.notes, multiline: true }),
  )
  setIf(recipe, 'source', reader.text(record, 'source', path, { max: craftingLimits.source }))
  setIf(
    recipe,
    'dm_notes',
    reader.text(record, 'dm_notes', path, { max: craftingLimits.dmNotes, multiline: true }),
  )

  // The line rules: at most 20 together, each item once, and never the output itself.
  const lines = [...(keyMaterials ?? []), ...(materials ?? [])]
  if (lines.length > craftingLimits.lines) {
    reader.fail(
      reader.field(path, 'materials'),
      `A recipe can have at most ${craftingLimits.lines} lines, key materials included.`,
    )
  }
  const seen = new Set<string>(output ? [output.item] : [])
  for (const [role, group] of [
    ['key_materials', keyMaterials],
    ['materials', materials],
  ] as const) {
    for (const [index, line] of (group ?? []).entries()) {
      if (seen.has(line.item)) {
        reader.fail(
          `${reader.field(path, role)}[${index}].item`,
          line.item === output?.item
            ? 'A recipe can’t use its own output as a material.'
            : 'Each item can appear only once in a recipe.',
        )
      }
      seen.add(line.item)
    }
  }

  if (
    reader.issues.length > before ||
    id === undefined ||
    output === undefined ||
    keyMaterials === undefined ||
    cost === undefined ||
    workdays === undefined
  ) {
    return undefined
  }
  const result: PackRecipe = {
    id,
    output,
    key_materials: keyMaterials,
    crafting_cost_gp: cost,
    workdays,
    ...recipe,
  }
  if (materials && materials.length > 0) result.materials = materials
  return result
}

function readRemovals(reader: Reader, value: unknown, path: string) {
  const empty = { items: [] as string[], recipes: [] as string[] }
  if (value === undefined || value === null) return empty
  const record = reader.object(value, ['items', 'recipes'], path)
  if (!record) return empty
  const read = (key: 'items' | 'recipes') => {
    const at = reader.field(path, key)
    const list = record[key]
    if (list === undefined || list === null) return []
    if (!Array.isArray(list) || list.length > craftingLimits.itemsPerLibrary) {
      reader.fail(at, `Use a list of at most ${n(craftingLimits.itemsPerLibrary)} slugs.`)
      return []
    }
    const slugs: string[] = []
    for (const [index, entry] of list.entries()) {
      const wrapped = { slug: entry }
      const slug = reader.slug(wrapped, 'slug', '', true)
      if (slug === undefined) {
        // Report the real position instead of the wrapper's.
        const last = reader.issues.at(-1)
        if (last) last.path = `${at}[${index}]`
      } else slugs.push(slug)
    }
    return slugs
  }
  return { items: read('items'), recipes: read('recipes') }
}

/** Reads and checks a pack against what the library holds now. Nothing is saved. */
export function parseCraftingPack(
  text: string,
  library: LibrarySnapshot = emptySnapshot,
): PackParse {
  const read = readJsonDocument(text)
  if (!read.ok) return { kind: 'rejected', message: read.message }
  const envelope = checkEnvelope(
    read.value,
    { format: documentFormats.crafting, version: craftingPackVersion },
    regenerateCraftingMessage,
  )
  if (envelope) return { kind: 'rejected', message: envelope }

  const reader = createReader()
  const root = reader.object(
    read.value,
    ['format', 'version', 'pack', 'items', 'recipes', 'remove'],
    '',
  ) as Rec

  const meta = reader.object(root.pack, ['name', 'source', 'description'], 'pack')
  let name: string | undefined
  let source: string | undefined
  if (meta) {
    name = reader.text(meta, 'name', 'pack', { max: craftingLimits.packName, required: true })
    source = reader.text(meta, 'source', 'pack', { max: craftingLimits.packSource })
    // The description is read for its limits, then dropped: only the name is kept in the history.
    reader.text(meta, 'description', 'pack', {
      max: craftingLimits.packDescription,
      multiline: true,
    })
  }

  const items: PackItem[] = []
  const rawItems = root.items
  if (rawItems !== undefined && rawItems !== null) {
    if (!Array.isArray(rawItems)) reader.fail('items', 'This must be a list.')
    else {
      for (const [index, entry] of rawItems.entries()) {
        const item = readItem(reader, entry, `items[${index}]`)
        if (item) items.push(item)
      }
    }
  }

  const recipes: PackRecipe[] = []
  const rawRecipes = root.recipes
  if (rawRecipes !== undefined && rawRecipes !== null) {
    if (!Array.isArray(rawRecipes)) reader.fail('recipes', 'This must be a list.')
    else {
      for (const [index, entry] of rawRecipes.entries()) {
        const recipe = readRecipe(reader, entry, `recipes[${index}]`)
        if (recipe) recipes.push(recipe)
      }
    }
  }

  const remove = readRemovals(reader, root.remove, 'remove')

  checkAgainstLibrary(reader, { items, recipes, remove }, rawItems, rawRecipes, library)

  const rawItemCount = Array.isArray(rawItems) ? rawItems.length : 0
  const rawRecipeCount = Array.isArray(rawRecipes) ? rawRecipes.length : 0
  if (
    rawItemCount + rawRecipeCount + remove.items.length + remove.recipes.length === 0 &&
    reader.issues.length === 0
  ) {
    reader.fail('', 'The pack has no items, recipes, or removals.')
  }

  const { issues, ignored } = reader
  if (issues.length > 0 || name === undefined) {
    return { kind: 'parsed', pack: null, issues, ignored, review: null }
  }

  const pack: CraftingPack = {
    format: documentFormats.crafting,
    version: craftingPackVersion,
    pack: { name, ...(source ? { source } : {}) },
  }
  if (items.length > 0) pack.items = items
  if (recipes.length > 0) pack.recipes = recipes
  if (remove.items.length > 0 || remove.recipes.length > 0) {
    pack.remove = {
      ...(remove.items.length > 0 ? { items: remove.items } : {}),
      ...(remove.recipes.length > 0 ? { recipes: remove.recipes } : {}),
    }
  }

  const review: PackReview = {
    name,
    source: source ?? null,
    itemsAdded: items.filter((item) => !library.items.has(item.id)).length,
    itemsUpdated: items.filter((item) => library.items.has(item.id)).length,
    recipesAdded: recipes.filter((recipe) => !library.recipes.has(recipe.id)).length,
    recipesUpdated: recipes.filter((recipe) => library.recipes.has(recipe.id)).length,
    itemsRemoved: remove.items.filter((slug) => library.items.has(slug)).length,
    recipesRemoved: remove.recipes.filter((slug) => library.recipes.has(slug)).length,
  }
  return { kind: 'parsed', pack, issues, ignored, review }
}

const nameKey = (name: string) => name.trim().toLowerCase()

/**
 * The checks that need the whole pack and the library: duplicate slugs and names (the library's
 * names count, but a pack may swap two), references to items that exist, removals that would
 * strand a recipe, and the per-library caps.
 */
function checkAgainstLibrary(
  reader: Reader,
  pack: {
    items: PackItem[]
    recipes: PackRecipe[]
    remove: { items: string[]; recipes: string[] }
  },
  rawItems: unknown,
  rawRecipes: unknown,
  library: LibrarySnapshot,
) {
  // Where each valid entry sits in the file, for readable paths.
  const positions = (raw: unknown, kind: 'items' | 'recipes') => {
    const map = new Map<string, number>()
    if (!Array.isArray(raw)) return map
    for (const [index, entry] of raw.entries()) {
      const id = isRecord(entry) && typeof entry.id === 'string' ? entry.id : null
      if (id !== null) {
        if (map.has(id)) {
          reader.fail(`${kind}[${index}].id`, 'This id is used more than once in the pack.')
        } else map.set(id, index)
      }
    }
    return map
  }
  const itemAt = positions(rawItems, 'items')
  const recipeAt = positions(rawRecipes, 'recipes')

  const removedItems = new Set(pack.remove.items)
  const removedRecipes = new Set(pack.remove.recipes)

  // Names: the library's, minus removed and replaced items, then the pack's.
  const names = new Map<string, string>()
  for (const [slug, itemName] of library.items) {
    if (!removedItems.has(slug) && !itemAt.has(slug)) names.set(nameKey(itemName), slug)
  }
  for (const item of pack.items) {
    const key = nameKey(item.name)
    const owner = names.get(key)
    if (owner !== undefined && owner !== item.id) {
      reader.fail(
        `items[${itemAt.get(item.id)}].name`,
        library.items.has(owner)
          ? 'Another item in this library already has this name.'
          : 'Two items in the pack have this name.',
      )
    }
    names.set(key, item.id)
  }

  // References: every line must name an item that will exist after the import.
  const finalItems = new Set<string>()
  for (const slug of library.items.keys()) if (!removedItems.has(slug)) finalItems.add(slug)
  for (const item of pack.items) finalItems.add(item.id)
  const used = new Map<string, string>() // item slug -> a recipe that uses it
  for (const recipe of pack.recipes) {
    const at = recipeAt.get(recipe.id)
    const reference = (line: PackLine, path: string) => {
      if (!finalItems.has(line.item)) {
        reader.fail(
          path,
          `No item “${line.item}” is in this pack or the library. Add it to the pack, or fix the id.`,
        )
      }
      used.set(line.item, recipe.id)
    }
    reference(recipe.output, `recipes[${at}].output.item`)
    for (const [index, line] of recipe.key_materials.entries()) {
      reference(line, `recipes[${at}].key_materials[${index}].item`)
    }
    for (const [index, line] of (recipe.materials ?? []).entries()) {
      reference(line, `recipes[${at}].materials[${index}].item`)
    }
  }
  // Recipes already in the library that the pack neither replaces nor removes.
  for (const [recipeSlug, slugs] of library.recipes) {
    if (removedRecipes.has(recipeSlug) || recipeAt.has(recipeSlug)) continue
    for (const slug of slugs) used.set(slug, recipeSlug)
  }
  for (const [index, slug] of pack.remove.items.entries()) {
    const user = used.get(slug)
    if (user !== undefined && library.items.has(slug)) {
      reader.fail(
        `remove.items[${index}]`,
        `“${slug}” is still used by the recipe “${user}”. Remove or change that recipe too.`,
      )
    }
  }

  // Caps after the import.
  const itemTotal = finalItems.size
  const recipeTotal = new Set([
    ...[...library.recipes.keys()].filter((slug) => !removedRecipes.has(slug)),
    ...pack.recipes.map((recipe) => recipe.id),
  ]).size
  if (itemTotal > craftingLimits.itemsPerLibrary) {
    reader.fail('items', `A library holds at most ${n(craftingLimits.itemsPerLibrary)} items.`)
  }
  if (recipeTotal > craftingLimits.recipesPerLibrary) {
    reader.fail(
      'recipes',
      `A library holds at most ${n(craftingLimits.recipesPerLibrary)} recipes.`,
    )
  }
}
