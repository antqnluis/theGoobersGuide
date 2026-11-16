import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../lib/supabase'
import {
  addAdventureUpdate,
  addObjective,
  adventureError,
  AdventureConflictError,
  createAdventure,
  deleteAdventureUpdate,
  deleteObjective,
  getAdventure,
  isAdventureConflict,
  isAdventureUnavailable,
  listAdventures,
  renameObjective,
  saveAdventureDetails,
  setAdventureArchived,
  setAdventureStatus,
  setObjectiveDone,
} from './adventureService'
import { adventure, campaignId, characterId } from './adventureTestData'
import type { AdventureValues } from './adventureTypes'

vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

const adventureId = '00000000-0000-4000-8000-000000000051'
const detail = adventure({ id: adventureId })
const values: AdventureValues = {
  title: 'New title',
  type: 'side',
  description: 'Text',
  next_step: 'Go',
  reference: '',
}

type Result = { data: unknown; error: unknown }

/** A chainable query builder that records calls and resolves to `result`. */
function builder(result: Result) {
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
  return { calls, chain }
}

/** Queues one builder per `from(...)` call, in order. */
function queue(...results: Result[]) {
  const all = results.map(builder)
  for (const { chain } of all) vi.mocked(supabase.from).mockReturnValueOnce(chain as never)
  return all.map(({ calls }) => calls)
}

const selected = (calls: [string, unknown[]][]) =>
  (calls.find(([method]) => method === 'select')![1][0] as string).split(/,(?![^()]*\))/)

beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
  vi.mocked(supabase.rpc).mockReset()
})

describe('listAdventures', () => {
  it('reads the campaign’s adventures newest edit first, with child counts and no description', async () => {
    const [calls] = queue({ data: [{ id: adventureId }], error: null })
    await expect(listAdventures(campaignId)).resolves.toHaveLength(1)
    expect(supabase.from).toHaveBeenCalledWith('adventures')
    expect(calls).toContainEqual(['eq', ['campaign_id', campaignId]])
    expect(calls).toContainEqual(['order', ['updated_at', { ascending: false }]])
    const fields = selected(calls)
    expect(fields).not.toContain('description')
    expect(fields).toContain('participants:adventure_participants(character_id)')
    expect(fields).toContain('objectives:adventure_objectives(done)')
  })

  it('returns an empty list for no rows and throws on an error', async () => {
    queue({ data: null, error: null })
    await expect(listAdventures(campaignId)).resolves.toEqual([])
    queue({ data: null, error: { message: 'boom' } })
    await expect(listAdventures(campaignId)).rejects.toEqual({ message: 'boom' })
  })
})

describe('getAdventure', () => {
  it('reads one adventure with its children in order', async () => {
    const [calls] = queue({ data: detail, error: null })
    await expect(getAdventure(adventureId)).resolves.toEqual(detail)
    expect(calls).toContainEqual(['eq', ['id', adventureId]])
    expect(calls).toContainEqual([
      'order',
      ['created_at', { referencedTable: 'adventure_objectives', ascending: true }],
    ])
    expect(calls).toContainEqual([
      'order',
      ['created_at', { referencedTable: 'adventure_updates', ascending: false }],
    ])
    const fields = selected(calls).join(',')
    expect(fields).toContain('description')
    expect(fields).toContain('adventure_updates(')
  })

  it('reports no row as unavailable and passes other errors through', async () => {
    queue({ data: null, error: null })
    await expect(getAdventure(adventureId)).rejects.toThrow('adventure_unavailable')
    queue({ data: null, error: { message: 'boom' } })
    await expect(getAdventure(adventureId)).rejects.toEqual({ message: 'boom' })
  })
})

describe('createAdventure', () => {
  it('calls the RPC with the character and next step, then opens the new adventure', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: adventureId, error: null } as never)
    queue({ data: detail, error: null })
    const created = await createAdventure(campaignId, {
      type: 'personal',
      title: 'Find the heir',
      character_id: characterId,
      next_step: 'Ask',
    })
    expect(created).toEqual(detail)
    expect(supabase.rpc).toHaveBeenCalledWith('create_adventure', {
      p_campaign_id: campaignId,
      p_type: 'personal',
      p_title: 'Find the heir',
      p_character_id: characterId,
      p_next_step: 'Ask',
    })
  })

  it('omits an absent character and next step so the function’s defaults apply', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: adventureId, error: null } as never)
    queue({ data: detail, error: null })
    await createAdventure(campaignId, {
      type: 'main',
      title: 'Story',
      character_id: null,
      next_step: '',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('create_adventure', {
      p_campaign_id: campaignId,
      p_type: 'main',
      p_title: 'Story',
    })
  })

  it('reports an authorization refusal as the campaign being unavailable', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    } as never)
    await expect(
      createAdventure(campaignId, {
        type: 'main',
        title: 'Story',
        character_id: null,
        next_step: '',
      }),
    ).rejects.toThrow('adventure_campaign_unavailable')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('passes the RPC’s own error codes through', async () => {
    const error = { code: 'P0001', message: 'adventure_limit_reached' }
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error } as never)
    await expect(
      createAdventure(campaignId, {
        type: 'main',
        title: 'Story',
        character_id: null,
        next_step: '',
      }),
    ).rejects.toEqual(error)
  })
})

describe('saveAdventureDetails', () => {
  const { description: _d, participants: _p, objectives: _o, updates: _u, ...row } = detail
  void [_d, _p, _o, _u]

  it('saves only against the previous stamp', async () => {
    const [calls] = queue({ data: { ...row, title: 'New title' }, error: null })
    const saved = await saveAdventureDetails(adventureId, values, 'old-stamp')
    expect(saved.title).toBe('New title')
    expect(calls).toContainEqual(['update', [values]])
    expect(calls).toContainEqual(['eq', ['id', adventureId]])
    expect(calls).toContainEqual(['eq', ['updated_at', 'old-stamp']])
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('re-reads on zero rows: an adventure that is still readable is a conflict carrying the latest', async () => {
    const latest = adventure({
      id: adventureId,
      title: 'Someone else',
      updated_at: '2026-11-16T11:00:00+00:00',
    })
    queue({ data: null, error: null }, { data: latest, error: null })
    const failure = await saveAdventureDetails(adventureId, values, 'old-stamp').catch(
      (error: unknown) => error,
    )
    expect(isAdventureConflict(failure)).toBe(true)
    expect((failure as AdventureConflictError).latest).toEqual(latest)
    expect((failure as Error).message).toBe('adventure_conflict')
  })

  it('re-reads on zero rows: an adventure that is gone is unavailable', async () => {
    queue({ data: null, error: null }, { data: null, error: null })
    await expect(saveAdventureDetails(adventureId, values, 'old-stamp')).rejects.toThrow(
      'adventure_unavailable',
    )
  })

  it('passes write errors through without re-reading', async () => {
    const error = { code: 'P0001', message: 'adventure_archived' }
    queue({ data: null, error })
    await expect(saveAdventureDetails(adventureId, values, 'old-stamp')).rejects.toEqual(error)
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })
})

describe('status and archive', () => {
  it('changes the status alone, with no stamp filter, and reports a missed row as unavailable', async () => {
    const [calls] = queue({ data: { id: adventureId }, error: null })
    await setAdventureStatus(adventureId, 'completed')
    expect(calls).toContainEqual(['update', [{ status: 'completed' }]])
    expect(calls).not.toContainEqual(['eq', ['updated_at', expect.anything()]])

    queue({ data: null, error: null })
    await expect(setAdventureStatus(adventureId, 'on_hold')).rejects.toThrow(
      'adventure_unavailable',
    )
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })

  it('archives with a timestamp and restores with null', async () => {
    const [archive, restore] = queue(
      { data: { id: adventureId }, error: null },
      { data: { id: adventureId }, error: null },
    )
    await setAdventureArchived(adventureId, true)
    await setAdventureArchived(adventureId, false)
    const [, [patch]] = archive.find(([method]) => method === 'update')!
    expect(typeof (patch as { archived_at: unknown }).archived_at).toBe('string')
    expect(restore).toContainEqual(['update', [{ archived_at: null }]])
  })

  it('passes the guard’s refusals through', async () => {
    const error = { code: '42501', message: 'adventure_archive_creator_only' }
    queue({ data: null, error })
    await expect(setAdventureArchived(adventureId, true)).rejects.toEqual(error)
  })
})

describe('objectives', () => {
  it('inserts exactly the writable columns', async () => {
    const [calls] = queue({ data: { id: 'o1' }, error: null })
    await expect(addObjective(adventureId, 'Search')).resolves.toEqual({ id: 'o1' })
    expect(supabase.from).toHaveBeenCalledWith('adventure_objectives')
    expect(calls).toContainEqual(['insert', [{ adventure_id: adventureId, title: 'Search' }]])
  })

  it('treats a row-level-security refusal as the adventure being unavailable and passes the cap through', async () => {
    queue({ data: null, error: { code: '42501', message: 'row-level security' } })
    await expect(addObjective(adventureId, 'Search')).rejects.toThrow('adventure_unavailable')
    const capped = { code: 'P0001', message: 'adventure_objective_limit_reached' }
    queue({ data: null, error: capped })
    await expect(addObjective(adventureId, 'Search')).rejects.toEqual(capped)
  })

  it('renames and ticks by id, writing only the one column', async () => {
    const [rename, tick] = queue(
      { data: { id: 'o1' }, error: null },
      { data: { id: 'o1' }, error: null },
    )
    await renameObjective('o1', 'Better')
    await setObjectiveDone('o1', true)
    expect(rename).toContainEqual(['update', [{ title: 'Better' }]])
    expect(rename).toContainEqual(['eq', ['id', 'o1']])
    expect(tick).toContainEqual(['update', [{ done: true }]])
  })

  it('reports a missed row as unavailable on rename, tick, and delete', async () => {
    queue({ data: null, error: null })
    await expect(renameObjective('o1', 'x')).rejects.toThrow('adventure_unavailable')
    queue({ data: null, error: null })
    await expect(setObjectiveDone('o1', false)).rejects.toThrow('adventure_unavailable')
    queue({ data: null, error: null })
    await expect(deleteObjective('o1')).rejects.toThrow('adventure_unavailable')
    queue({ data: { id: 'o1' }, error: null })
    await expect(deleteObjective('o1')).resolves.toBeUndefined()
  })
})

describe('updates', () => {
  it('inserts the body for an adventure and deletes by id', async () => {
    const [post] = queue({ data: { id: 'u1' }, error: null })
    await expect(addAdventureUpdate(adventureId, 'Found a key')).resolves.toEqual({ id: 'u1' })
    expect(supabase.from).toHaveBeenCalledWith('adventure_updates')
    expect(post).toContainEqual(['insert', [{ adventure_id: adventureId, body: 'Found a key' }]])

    const [remove] = queue({ data: { id: 'u1' }, error: null })
    await expect(deleteAdventureUpdate('u1')).resolves.toBeUndefined()
    expect(remove).toContainEqual(['delete', []])
    expect(remove).toContainEqual(['eq', ['id', 'u1']])
  })

  it('reports a refusal or a missed row as unavailable', async () => {
    queue({ data: null, error: { code: '42501', message: 'row-level security' } })
    await expect(addAdventureUpdate(adventureId, 'x')).rejects.toThrow('adventure_unavailable')
    queue({ data: null, error: null })
    await expect(deleteAdventureUpdate('u1')).rejects.toThrow('adventure_unavailable')
    const capped = { code: 'P0001', message: 'adventure_update_limit_reached' }
    queue({ data: null, error: capped })
    await expect(addAdventureUpdate(adventureId, 'x')).rejects.toEqual(capped)
  })
})

describe('error copy', () => {
  const fallback = 'Fallback copy.'

  it('maps each adventure code to its copy', () => {
    const copy: Record<string, string> = {
      adventure_conflict: 'This adventure changed while you were editing. Your text is still here.',
      adventure_unavailable: 'This adventure is no longer available. It may have been archived.',
      adventure_archived: 'This adventure is archived. Restore it to make changes.',
      adventure_limit_reached:
        'You can keep up to 200 adventures in a campaign, archived ones included.',
      adventure_objective_limit_reached: 'An adventure can have up to 50 objectives.',
      adventure_update_limit_reached: 'This adventure has reached 500 updates.',
      adventure_character_unavailable: 'Choose one of your characters in this campaign.',
      adventure_character_required: 'Choose one of your characters in this campaign.',
      adventure_campaign_unavailable: 'You can no longer add adventures to this campaign.',
    }
    for (const [code, text] of Object.entries(copy)) {
      expect(adventureError({ message: code }, fallback)).toBe(text)
    }
    expect(adventureError(new Error('adventure_unavailable'), fallback)).toBe(
      copy.adventure_unavailable,
    )
  })

  it('uses the fallback for programming errors, checks, and anything unknown', () => {
    for (const error of [
      { message: 'adventure_type_change_forbidden' },
      { message: 'adventure_reassignment_forbidden' },
      { message: 'adventure_archive_creator_only' },
      { message: 'adventure_main_has_no_participants' },
      { message: 'adventure_title_invalid' },
      { message: 'adventure_details_invalid' },
      { code: '23514', message: 'new row violates check constraint "adventures_title_check"' },
      new Error('network down'),
      null,
      'text',
    ]) {
      expect(adventureError(error, fallback)).toBe(fallback)
    }
  })

  it('does not treat inherited object keys as codes', () => {
    expect(adventureError({ message: 'toString' }, fallback)).toBe(fallback)
    expect(adventureError({ message: 'constructor' }, fallback)).toBe(fallback)
  })

  it('classifies conflicts and unavailable adventures', () => {
    expect(isAdventureConflict(new AdventureConflictError(detail))).toBe(true)
    expect(isAdventureConflict(new Error('adventure_conflict'))).toBe(false)
    expect(isAdventureUnavailable(new Error('adventure_unavailable'))).toBe(true)
    expect(isAdventureUnavailable({ message: 'adventure_campaign_unavailable' })).toBe(true)
    expect(isAdventureUnavailable({ message: 'adventure_archived' })).toBe(false)
    expect(isAdventureUnavailable({ message: 'adventure_conflict' })).toBe(false)
  })
})
