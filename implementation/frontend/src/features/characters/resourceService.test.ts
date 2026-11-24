import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../lib/supabase'
import type { ResourceValues } from './characterTypes'
import {
  addCharacterResource,
  adjustCharacterResource,
  applyCharacterHp,
  deleteCharacterResource,
  isResourceStale,
  listCharacterResources,
  recordDeathSave,
  resourceError,
  takeCharacterRest,
  updateCharacterResource,
} from './resourceService'

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}))

const characterId = '00000000-0000-4000-8000-000000000021'
const resourceId = '00000000-0000-4000-8000-000000000041'

/** A chainable query builder that records calls and resolves to `result`. */
function builder(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = []
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'insert', 'update', 'delete']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args])
      return chain
    }
  }
  chain.maybeSingle = () => Promise.resolve(result)
  chain.single = () => Promise.resolve(result)
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  vi.mocked(supabase.from).mockReturnValue(chain as never)
  return calls
}

const rpc = (result: { data: unknown; error: unknown }) =>
  vi.mocked(supabase.rpc).mockResolvedValue(result as never)

const row = {
  id: resourceId,
  character_id: characterId,
  kind: 'tracker',
  name: 'Ki',
  slot_level: null,
  die: null,
  maximum: 4,
  current: 4,
  reset: 'short',
  position: 0,
  created_at: '2026-11-24T10:00:00+00:00',
  updated_at: '2026-11-24T10:00:00+00:00',
}
const values: ResourceValues = {
  kind: 'tracker',
  name: 'Ki',
  slot_level: null,
  die: null,
  maximum: 4,
  current: 4,
  reset: 'short',
  position: 0,
}

beforeEach(() => {
  vi.mocked(supabase.rpc).mockReset()
  vi.mocked(supabase.from).mockReset()
})

describe('table access', () => {
  it('lists the trackers in display order', async () => {
    const calls = builder({ data: [row], error: null })
    expect(await listCharacterResources(characterId)).toEqual([row])
    expect(supabase.from).toHaveBeenCalledWith('character_resources')
    expect(calls).toContainEqual(['eq', ['character_id', characterId]])
    expect(calls).toContainEqual(['order', ['position', { ascending: true }]])
    expect(calls).toContainEqual(['order', ['created_at', { ascending: true }]])
  })

  it('reads nothing as an empty list and surfaces a database error', async () => {
    builder({ data: null, error: null })
    expect(await listCharacterResources(characterId)).toEqual([])
    const failure = { message: 'boom' }
    builder({ data: null, error: failure })
    await expect(listCharacterResources(characterId)).rejects.toBe(failure)
  })

  it('adds a tracker for the character and reports a refused insert', async () => {
    const calls = builder({ data: row, error: null })
    expect(await addCharacterResource(characterId, values)).toEqual(row)
    expect(calls).toContainEqual(['insert', [{ character_id: characterId, ...values }]])

    builder({ data: null, error: { code: '42501', message: 'rls' } })
    await expect(addCharacterResource(characterId, values)).rejects.toThrow(
      'character_update_denied',
    )
    const limit = { code: 'P0001', message: 'resource_limit' }
    builder({ data: null, error: limit })
    await expect(addCharacterResource(characterId, values)).rejects.toBe(limit)
  })

  it('patches a tracker by id and treats a missing row as unavailable', async () => {
    const calls = builder({ data: { ...row, maximum: 2, current: 2 }, error: null })
    const saved = await updateCharacterResource(resourceId, { maximum: 2 })
    expect(saved.current).toBe(2)
    expect(calls).toContainEqual(['update', [{ maximum: 2 }]])
    expect(calls).toContainEqual(['eq', ['id', resourceId]])

    builder({ data: null, error: null })
    await expect(updateCharacterResource(resourceId, { maximum: 2 })).rejects.toThrow(
      'resource_unavailable',
    )
  })

  it('deletes by id and treats a missing row as unavailable', async () => {
    const calls = builder({ data: { id: resourceId }, error: null })
    await deleteCharacterResource(resourceId)
    expect(calls).toContainEqual(['delete', []])
    expect(calls).toContainEqual(['eq', ['id', resourceId]])

    builder({ data: null, error: null })
    await expect(deleteCharacterResource(resourceId)).rejects.toThrow('resource_unavailable')
  })
})

describe('RPCs', () => {
  it('applies HP and returns what the screen needs, with a null concentration', async () => {
    rpc({
      data: [
        {
          current_hp: 8,
          temp_hp: 0,
          death_save_successes: 0,
          death_save_failures: 0,
          damage_taken: 4,
          concentration: null,
          updated_at: 'stamp',
        },
      ],
      error: null,
    })
    const change = await applyCharacterHp(characterId, 'damage', 6)
    expect(supabase.rpc).toHaveBeenCalledWith('apply_character_hp', {
      p_character_id: characterId,
      p_kind: 'damage',
      p_amount: 6,
    })
    expect(change).toMatchObject({ current_hp: 8, damage_taken: 4, concentration: null })

    rpc({ data: [], error: null })
    await expect(applyCharacterHp(characterId, 'heal', 1)).rejects.toThrow('character_unavailable')
    const failure = { message: 'hp_not_set' }
    rpc({ data: null, error: failure })
    await expect(applyCharacterHp(characterId, 'heal', 1)).rejects.toBe(failure)
  })

  it('spends or restores a tracker', async () => {
    rpc({ data: [{ current: 2, updated_at: 'stamp' }], error: null })
    expect(await adjustCharacterResource(resourceId, -1)).toEqual({
      current: 2,
      updated_at: 'stamp',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('adjust_character_resource', {
      p_resource_id: resourceId,
      p_delta: -1,
    })
    rpc({ data: [], error: null })
    await expect(adjustCharacterResource(resourceId, 1)).rejects.toThrow('resource_unavailable')
  })

  it('sends the rest plan and checks the shape of the answer', async () => {
    const result = {
      sheet: {
        current_hp: 30,
        temp_hp: 0,
        exhaustion: 0,
        death_save_successes: 0,
        death_save_failures: 0,
        updated_at: 'stamp',
      },
      resources: [{ id: resourceId, current: 4, updated_at: 'stamp' }],
    }
    rpc({ data: result, error: null })
    const plan = { hp: 'max' as const, resources: [{ id: resourceId, current: 4 }] }
    expect(await takeCharacterRest(characterId, 'long', plan)).toEqual(result)
    expect(supabase.rpc).toHaveBeenCalledWith('take_character_rest', {
      p_character_id: characterId,
      p_kind: 'long',
      p_plan: plan,
    })
    for (const bad of [null, [], { sheet: {} }, { resources: [] }]) {
      rpc({ data: bad, error: null })
      await expect(takeCharacterRest(characterId, 'short', {})).rejects.toThrow(
        'rest_result_invalid',
      )
    }
  })

  it('records a death save', async () => {
    rpc({
      data: [
        { current_hp: 1, death_save_successes: 0, death_save_failures: 0, updated_at: 'stamp' },
      ],
      error: null,
    })
    expect(await recordDeathSave(characterId, 'critical_success')).toMatchObject({ current_hp: 1 })
    expect(supabase.rpc).toHaveBeenCalledWith('record_death_save', {
      p_character_id: characterId,
      p_result: 'critical_success',
    })
    rpc({ data: [], error: null })
    await expect(recordDeathSave(characterId, 'success')).rejects.toThrow('character_unavailable')
  })
})

describe('resourceError', () => {
  it('has copy for each rule and falls back to the character copy and then the fallback', () => {
    expect(resourceError(new Error('hp_not_set'), 'x')).toBe(
      'Set max and current HP on the sheet first.',
    )
    expect(resourceError(new Error('resource_empty'), 'x')).toBe(
      'None left. Take a rest or restore one by hand.',
    )
    expect(resourceError(new Error('not_dying'), 'x')).toBe('Death saves are only rolled at 0 HP.')
    expect(resourceError(new Error('resource_limit'), 'x')).toBe(
      'A character can have up to 40 trackers.',
    )
    expect(resourceError(new Error('character_unavailable'), 'x')).toBe(
      'This character is no longer available.',
    )
    expect(resourceError(new Error('something else'), 'fallback')).toBe('fallback')
  })

  it('knows when a tracker went stale', () => {
    expect(isResourceStale(new Error('resource_unavailable'))).toBe(true)
    expect(isResourceStale(new Error('resource_empty'))).toBe(false)
  })
})
