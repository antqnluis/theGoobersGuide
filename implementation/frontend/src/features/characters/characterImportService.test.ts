import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyCharacterUpdate,
  importCharacter,
  importError,
  isImportConflict,
  listCharacterImports,
} from './characterImportService'

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc, from } }))

beforeEach(() => vi.resetAllMocks())

const payload = {
  details: {
    name: 'A',
    species: null,
    class_name: null,
    subclass: null,
    background: null,
    level: 1,
  },
  vitals: { max_hp: null, current_hp: null, temp_hp: 0, armor_class: null, speed: null },
  sheet: { version: 1 },
  items: [],
  coins: { cp: 0, sp: 0, gp: 0 },
} as unknown as Parameters<typeof importCharacter>[1]

describe('importCharacter', () => {
  it('calls the RPC with the payload and label and returns the new id', async () => {
    rpc.mockResolvedValue({ data: 'new-id', error: null })
    await expect(importCharacter('campaign-1', payload, 'file.json')).resolves.toBe('new-id')
    expect(rpc).toHaveBeenCalledWith('import_character', {
      p_campaign_id: 'campaign-1',
      p_character: payload,
      p_source_label: 'file.json',
    })
  })

  it('omits the label when there is none', async () => {
    rpc.mockResolvedValue({ data: 'new-id', error: null })
    await importCharacter('campaign-1', payload, null)
    expect(rpc.mock.calls[0][1].p_source_label).toBeUndefined()
  })

  it('throws the database error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'character_active_exists' } })
    await expect(importCharacter('c', payload, null)).rejects.toEqual({
      message: 'character_active_exists',
    })
  })
})

describe('applyCharacterUpdate', () => {
  it('calls the RPC and returns the new sheet stamp', async () => {
    rpc.mockResolvedValue({ data: '2026-11-15T10:00:00+00:00', error: null })
    const expected = { character_updated_at: 'a', sheet_updated_at: 'b', items: {} }
    const changes = { change_count: 1, coins: { gp: 3 } }
    await expect(applyCharacterUpdate('char-1', expected, changes, 'x')).resolves.toBe(
      '2026-11-15T10:00:00+00:00',
    )
    expect(rpc).toHaveBeenCalledWith('apply_character_update', {
      p_character_id: 'char-1',
      p_expected: expected,
      p_changes: changes,
      p_source_label: 'x',
    })
  })

  it('throws the database error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'import_conflict' } })
    await expect(
      applyCharacterUpdate(
        'char-1',
        { character_updated_at: '', sheet_updated_at: '', items: {} },
        { change_count: 1 },
        null,
      ),
    ).rejects.toEqual({ message: 'import_conflict' })
  })
})

describe('listCharacterImports', () => {
  it('reads the history newest first', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    from.mockReturnValue({ select })
    await expect(listCharacterImports('char-1')).resolves.toEqual([{ id: '1' }])
    expect(from).toHaveBeenCalledWith('character_imports')
    expect(select).toHaveBeenCalledWith('id,kind,source_label,change_count,imported_at')
    expect(eq).toHaveBeenCalledWith('character_id', 'char-1')
    expect(order).toHaveBeenCalledWith('imported_at', { ascending: false })
  })

  it('returns an empty list for no data and throws errors', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: null })
    from.mockReturnValue({ select: () => ({ eq: () => ({ order }) }) })
    await expect(listCharacterImports('c')).resolves.toEqual([])
    order.mockResolvedValue({ data: null, error: new Error('nope') })
    await expect(listCharacterImports('c')).rejects.toThrow('nope')
  })
})

describe('importError', () => {
  it.each([
    ['import_invalid', "This import couldn't be read."],
    ['import_values_invalid', "Some values in this import aren't allowed."],
    ['import_source_invalid', 'Use a source label of up to 120 characters.'],
    ['import_conflict', 'This character changed while you were reviewing.'],
    ['character_active_exists', 'You already have an active character here.'],
    ['character_unavailable', 'This character is no longer available.'],
    ['item_limit_reached', 'A character can carry up to 200 items.'],
  ])('maps %s to safe copy', (code, copy) => {
    expect(importError({ message: code }, 'fallback')).toContain(copy)
  })

  it('never shows raw database text', () => {
    expect(importError({ message: 'duplicate key value violates constraint x' }, 'fallback')).toBe(
      'fallback',
    )
    expect(importError(new Error('boom'), 'fallback')).toBe('fallback')
    expect(importError(null, 'fallback')).toBe('fallback')
  })

  it('recognizes a conflict', () => {
    expect(isImportConflict({ message: 'import_conflict' })).toBe(true)
    expect(isImportConflict({ message: 'sheet_conflict' })).toBe(false)
  })
})
