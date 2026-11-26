import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../lib/supabase'
import {
  craftingError,
  createLibrary,
  deleteLibrary,
  getLibraryContent,
  importPack,
  listCampaignLibraries,
  listImports,
  listLibraries,
  previewLibraryDelete,
  setCampaignLibrary,
  updateLibrary,
} from './craftingService'
import { wyvernPack } from './craftingTestData'

vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

type Result = { data: unknown; error: unknown }

/** A query builder whose every call is recorded; awaiting or ending it gives the next result. */
function builder(...results: Result[]) {
  const calls: [string, unknown[]][] = []
  let next = 0
  const take = () => results[Math.min(next++, results.length - 1)]
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'range']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args])
      return chain
    }
  }
  chain.single = () => Promise.resolve(take())
  chain.maybeSingle = () => Promise.resolve(take())
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(take()).then(resolve)
  return { calls, chain }
}

beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
  vi.mocked(supabase.rpc).mockReset()
})

describe('libraries', () => {
  it('lists the caller’s libraries oldest first', async () => {
    const { calls, chain } = builder({ data: [{ id: 'l1' }], error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as never)
    await expect(listLibraries()).resolves.toEqual([{ id: 'l1' }])
    expect(supabase.from).toHaveBeenCalledWith('crafting_libraries')
    expect(calls).toContainEqual(['order', ['created_at', { ascending: true }]])
  })

  it('creates with a trimmed name and an empty description as null', async () => {
    const { calls, chain } = builder({ data: { id: 'l1' }, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as never)
    await createLibrary('  Drakkenheim ', '   ')
    expect(calls).toContainEqual(['insert', [{ name: 'Drakkenheim', description: null }]])
  })

  it('renames, and reports a library that is gone', async () => {
    const found = builder({ data: { id: 'l1' }, error: null })
    vi.mocked(supabase.from).mockReturnValue(found.chain as never)
    await updateLibrary('l1', 'New', 'About')
    expect(found.calls).toContainEqual(['update', [{ name: 'New', description: 'About' }]])
    expect(found.calls).toContainEqual(['eq', ['id', 'l1']])

    const gone = builder({ data: null, error: null })
    vi.mocked(supabase.from).mockReturnValue(gone.chain as never)
    await expect(updateLibrary('l1', 'New', '')).rejects.toThrow('crafting_library_unavailable')
  })

  it('previews a delete without confirming, then deletes with confirmation', async () => {
    const preview = { campaigns: 2, saved: 0, linked_items: 0, deleted: false }
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: preview, error: null } as never)
    await expect(previewLibraryDelete('l1')).resolves.toEqual(preview)
    expect(supabase.rpc).toHaveBeenLastCalledWith('delete_crafting_library', {
      p_library_id: 'l1',
      p_confirm: false,
    })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: {}, error: null } as never)
    await deleteLibrary('l1')
    expect(supabase.rpc).toHaveBeenLastCalledWith('delete_crafting_library', {
      p_library_id: 'l1',
      p_confirm: true,
    })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'crafting_library_unavailable' },
    } as never)
    await expect(deleteLibrary('l1')).rejects.toMatchObject({
      message: 'crafting_library_unavailable',
    })
  })
})

describe('getLibraryContent', () => {
  it('reads items and recipes, and orders each recipe’s lines', async () => {
    const items = builder({
      data: [{ id: 'i1', slug: 'a', category: 'material', rarity: 'common', harvest: null }],
      error: null,
    })
    const recipes = builder({
      data: [
        {
          id: 'r1',
          slug: 'r',
          crafting_recipe_materials: [
            { role: 'other', item_id: 'i2', quantity: 2, position: 1 },
            { role: 'key', item_id: 'i1', quantity: 1, position: 0 },
          ],
        },
      ],
      error: null,
    })
    vi.mocked(supabase.from).mockImplementation(
      ((table: string) => (table === 'crafting_items' ? items : recipes).chain) as never,
    )
    const content = await getLibraryContent('l1')
    expect(content.items).toHaveLength(1)
    expect(content.recipes[0]).not.toHaveProperty('crafting_recipe_materials')
    expect(content.recipes[0].lines.map((line) => line.position)).toEqual([0, 1])
    expect(items.calls).toContainEqual(['eq', ['library_id', 'l1']])
    expect(items.calls).toContainEqual(['range', [0, 999]])
  })

  it('reads a long library in pages of 1,000', async () => {
    const page = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `i${index}`,
        category: 'material',
        rarity: 'common',
        harvest: null,
      }))
    const items = builder({ data: page(1000), error: null }, { data: page(250), error: null })
    const recipes = builder({ data: [], error: null })
    vi.mocked(supabase.from).mockImplementation(
      ((table: string) => (table === 'crafting_items' ? items : recipes).chain) as never,
    )
    const content = await getLibraryContent('l1')
    expect(content.items).toHaveLength(1250)
    expect(items.calls.filter(([method]) => method === 'range').map(([, args]) => args)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('fails when a read fails', async () => {
    const failing = builder({ data: null, error: { message: 'boom' } })
    vi.mocked(supabase.from).mockReturnValue(failing.chain as never)
    await expect(getLibraryContent('l1')).rejects.toMatchObject({ message: 'boom' })
  })
})

describe('imports and campaign links', () => {
  it('lists the newest imports first', async () => {
    const { calls, chain } = builder({ data: [{ id: 'h1' }], error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as never)
    await expect(listImports('l1')).resolves.toEqual([{ id: 'h1' }])
    expect(calls).toContainEqual(['order', ['imported_at', { ascending: false }]])
  })

  it('imports the pack and returns the counts, omitting an empty label', async () => {
    const result = { import_id: 'h1', items_added: 6, items_updated: 0 }
    vi.mocked(supabase.rpc).mockResolvedValue({ data: result, error: null } as never)
    await expect(importPack('l1', wyvernPack, null)).resolves.toEqual(result)
    expect(supabase.rpc).toHaveBeenLastCalledWith('import_crafting_pack', {
      p_library_id: 'l1',
      p_pack: wyvernPack,
    })
    await importPack('l1', wyvernPack, 'pack.json')
    expect(supabase.rpc).toHaveBeenLastCalledWith('import_crafting_pack', {
      p_library_id: 'l1',
      p_pack: wyvernPack,
      p_source_label: 'pack.json',
    })
  })

  it('throws the database error unchanged', async () => {
    const error = { message: 'crafting_pack_invalid', details: 'items[0].id' }
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error } as never)
    await expect(importPack('l1', wyvernPack, null)).rejects.toBe(error)
  })

  it('lists and sets the campaign’s libraries', async () => {
    const { calls, chain } = builder({ data: [{ library_id: 'l1' }], error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as never)
    await expect(listCampaignLibraries('c1')).resolves.toEqual([{ library_id: 'l1' }])
    expect(calls).toContainEqual(['eq', ['campaign_id', 'c1']])

    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    await setCampaignLibrary('c1', 'l1', true)
    expect(supabase.rpc).toHaveBeenLastCalledWith('set_campaign_crafting_library', {
      p_campaign_id: 'c1',
      p_library_id: 'l1',
      p_enabled: true,
    })
  })
})

describe('craftingError', () => {
  it('gives safe copy for each known code and the fallback for anything else', () => {
    expect(craftingError({ message: 'crafting_name_taken' }, 'x')).toContain('share a name')
    expect(craftingError({ message: 'crafting_campaign_library_limit' }, 'x')).toContain(
      '10 libraries',
    )
    expect(craftingError({ message: 'crafting_library_full' }, 'x')).toContain('2,000')
    expect(craftingError({ message: 'something raw from postgres' }, 'Try again.')).toBe(
      'Try again.',
    )
    expect(craftingError(null, 'Try again.')).toBe('Try again.')
  })

  it('adds where an invalid pack went wrong', () => {
    expect(
      craftingError({ message: 'crafting_pack_invalid', details: 'recipes[1].workdays' }, 'x'),
    ).toContain('Problem at recipes[1].workdays.')
    expect(craftingError({ message: 'crafting_name_taken', details: 'secret' }, 'x')).not.toContain(
      'secret',
    )
  })
})
