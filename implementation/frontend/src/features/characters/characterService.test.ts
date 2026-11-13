import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../lib/supabase'
import {
  characterError,
  createCharacter,
  deleteCharacter,
  getCharacterSheet,
  isCharacterUnavailable,
  isSheetConflict,
  listCampaignCharacters,
  setCharacterInParty,
  setCharacterStatus,
  setSheetVisibility,
  updateCharacterDetails,
  updateCharacterSheetBody,
  updateCharacterVitals,
} from './characterService'
import { defaultSheetBody } from './characterValidation'

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }))

const campaignId = '00000000-0000-4000-8000-000000000011'
const characterId = '00000000-0000-4000-8000-000000000021'

/** A chainable query builder that records calls and resolves to `result`. */
function builder(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = []
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'update', 'delete']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args])
      return chain
    }
  }
  chain.maybeSingle = () => Promise.resolve(result)
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  vi.mocked(supabase.from).mockReturnValue(chain as never)
  return calls
}

beforeEach(() => {
  vi.mocked(supabase.rpc).mockReset()
  vi.mocked(supabase.from).mockReset()
})

const details = {
  name: 'Brand',
  species: 'Elf',
  class_name: null,
  subclass: null,
  background: null,
  level: 3,
}

describe('RPC wrappers', () => {
  it('create_character sends every argument and returns the new id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: characterId, error: null } as never)
    await expect(createCharacter(campaignId, details, true)).resolves.toBe(characterId)
    expect(supabase.rpc).toHaveBeenCalledWith('create_character', {
      p_campaign_id: campaignId,
      p_name: 'Brand',
      p_species: 'Elf',
      p_class_name: undefined,
      p_subclass: undefined,
      p_background: undefined,
      p_level: 3,
      p_in_party: true,
    })
  })

  it('set_character_status and set_character_in_party send the character and value', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    await setCharacterStatus(characterId, 'retired')
    expect(supabase.rpc).toHaveBeenCalledWith('set_character_status', {
      p_character_id: characterId,
      p_status: 'retired',
    })
    await setCharacterInParty(characterId, false)
    expect(supabase.rpc).toHaveBeenCalledWith('set_character_in_party', {
      p_character_id: characterId,
      p_in_party: false,
    })
  })

  it.each([
    ['create', () => createCharacter(campaignId, details, false)],
    ['status', () => setCharacterStatus(characterId, 'active')],
    ['party', () => setCharacterInParty(characterId, true)],
  ])('throws the database error when %s fails', async (_name, call) => {
    const failure = { message: 'character_active_exists', code: 'P0001' }
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: failure } as never)
    await expect(call()).rejects.toBe(failure)
  })
})

describe('queries and writes', () => {
  it('lists a campaign’s characters oldest first', async () => {
    const calls = builder({ data: [{ id: characterId }], error: null })
    await expect(listCampaignCharacters(campaignId)).resolves.toEqual([{ id: characterId }])
    expect(supabase.from).toHaveBeenCalledWith('characters')
    expect(calls).toContainEqual(['eq', ['campaign_id', campaignId]])
    expect(calls).toContainEqual(['order', ['created_at', { ascending: true }]])
  })

  it('returns nothing and throws on a list error', async () => {
    builder({ data: null, error: { message: 'boom' } })
    await expect(listCampaignCharacters(campaignId)).rejects.toEqual({ message: 'boom' })
  })

  it('reads a sheet with its body normalized, or null when hidden', async () => {
    builder({
      data: { character_id: characterId, max_hp: 10, sheet: { version: 1, features: 'Rage' } },
      error: null,
    })
    const sheet = await getCharacterSheet(characterId)
    expect(sheet?.sheet).toEqual({ ...defaultSheetBody(), features: 'Rage' })
    expect(sheet?.max_hp).toBe(10)

    builder({ data: null, error: null })
    await expect(getCharacterSheet(characterId)).resolves.toBeNull()
  })

  it('updates details by id and reports a hidden row as denied', async () => {
    const calls = builder({ data: { id: characterId }, error: null })
    await updateCharacterDetails(characterId, details)
    expect(calls).toContainEqual(['update', [details]])
    expect(calls).toContainEqual(['eq', ['id', characterId]])

    builder({ data: null, error: null })
    await expect(updateCharacterDetails(characterId, details)).rejects.toThrow(
      'character_update_denied',
    )
  })

  it('sets visibility and reports a hidden row as denied', async () => {
    const calls = builder({ data: { id: characterId }, error: null })
    await setSheetVisibility(characterId, 'campaign')
    expect(calls).toContainEqual(['update', [{ sheet_visibility: 'campaign' }]])

    builder({ data: null, error: null })
    await expect(setSheetVisibility(characterId, 'private')).rejects.toThrow(
      'character_update_denied',
    )
  })

  it('patches only the given vitals', async () => {
    const calls = builder({
      data: { character_id: characterId, current_hp: 5, sheet: {} },
      error: null,
    })
    const sheet = await updateCharacterVitals(characterId, { current_hp: 5 })
    expect(calls).toContainEqual(['update', [{ current_hp: 5 }]])
    expect(calls).toContainEqual(['eq', ['character_id', characterId]])
    expect(sheet.current_hp).toBe(5)

    builder({ data: null, error: null })
    await expect(updateCharacterVitals(characterId, { current_hp: 5 })).rejects.toThrow(
      'sheet_unavailable',
    )
  })

  it('saves the body only against the previous updated_at', async () => {
    const stamp = '2026-11-13T13:02:01.36002+00:00'
    const body = { ...defaultSheetBody(), features: 'Rage' }
    const calls = builder({
      data: { character_id: characterId, updated_at: 'new', sheet: body },
      error: null,
    })
    const sheet = await updateCharacterSheetBody(characterId, body, stamp)
    expect(calls).toContainEqual(['update', [{ sheet: body }]])
    expect(calls).toContainEqual(['eq', ['character_id', characterId]])
    expect(calls).toContainEqual(['eq', ['updated_at', stamp]])
    expect(sheet.sheet.features).toBe('Rage')

    builder({ data: null, error: null })
    await expect(updateCharacterSheetBody(characterId, body, stamp)).rejects.toThrow(
      'sheet_conflict',
    )
  })

  it('deletes by id and reports a hidden row as denied', async () => {
    const calls = builder({ data: { id: characterId }, error: null })
    await deleteCharacter(characterId)
    expect(calls).toContainEqual(['delete', []])
    expect(calls).toContainEqual(['eq', ['id', characterId]])

    builder({ data: null, error: null })
    await expect(deleteCharacter(characterId)).rejects.toThrow('character_delete_denied')
  })

  it('throws database errors from writes unchanged', async () => {
    const failure = { message: 'permission denied', code: '42501' }
    builder({ data: null, error: failure })
    await expect(deleteCharacter(characterId)).rejects.toBe(failure)
    await expect(updateCharacterDetails(characterId, details)).rejects.toBe(failure)
  })
})

describe('error copy', () => {
  it.each([
    ['character_campaign_unavailable', "You're no longer a member of this campaign."],
    [
      'character_active_exists',
      'You already have an active character here. Retire them or mark them deceased first.',
    ],
    ['character_unavailable', 'This character is no longer available.'],
    ['character_not_active', 'Only an active character can join the party.'],
    ['character_name_invalid', 'Enter a name of up to 80 characters.'],
    [
      'character_details_invalid',
      'Species, class, subclass, and background can be up to 60 characters.',
    ],
    ['character_level_invalid', 'Level must be between 1 and 20.'],
    ['character_update_denied', 'This character could not be updated by this account.'],
    ['character_delete_denied', 'This character could not be deleted by this account.'],
    [
      'sheet_conflict',
      'This sheet changed on another device. Reload it to see the latest version.',
    ],
  ])('maps %s to its copy', (message, copy) => {
    expect(characterError({ message }, 'fallback')).toBe(copy)
  })

  it.each([
    [{ message: 'character_status_invalid' }],
    [{ message: 'character_required' }],
    [{ message: 'character_campaign_required' }],
    [{ message: 'something else' }],
    [new Error('network')],
    [null],
    ['text'],
  ])('falls back for %j', (error) => {
    expect(characterError(error, 'fallback')).toBe('fallback')
  })

  it('never looks up prototype keys', () => {
    expect(characterError({ message: 'constructor' }, 'fallback')).toBe('fallback')
  })

  it('recognizes unavailable and conflict errors', () => {
    expect(isCharacterUnavailable({ message: 'character_unavailable' })).toBe(true)
    expect(isCharacterUnavailable({ message: 'character_campaign_unavailable' })).toBe(true)
    expect(isCharacterUnavailable({ message: 'character_not_active' })).toBe(false)
    expect(isSheetConflict({ message: 'sheet_conflict' })).toBe(true)
    expect(isSheetConflict({ message: 'other' })).toBe(false)
  })
})
