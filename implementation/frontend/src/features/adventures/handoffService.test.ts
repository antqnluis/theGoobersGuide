import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../lib/supabase'
import { adventure } from './adventureTestData'
import { getAdventure } from './adventureService'
import {
  attachHandoff,
  createAdventureFromHandoff,
  deleteHandoff,
  handoffError,
  isHandoffConflict,
  isHandoffTargetUnavailable,
  listHandoffs,
} from './handoffService'

vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))
vi.mock('./adventureService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./adventureService')>()),
  getAdventure: vi.fn(),
}))

type Result = { data: unknown; error: unknown }

function builder(result: Result) {
  const calls: [string, unknown[]][] = []
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'delete']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args])
      return chain
    }
  }
  chain.maybeSingle = () => Promise.resolve(result)
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return { calls, chain }
}

beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
  vi.mocked(supabase.rpc).mockReset()
  vi.mocked(getAdventure).mockReset()
})

describe('createAdventureFromHandoff', () => {
  it('creates in one call, then opens the new adventure', async () => {
    const created = adventure({ id: 'new1' })
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'new1', error: null } as never)
    vi.mocked(getAdventure).mockResolvedValue(created)
    await expect(
      createAdventureFromHandoff(
        'c1',
        'side',
        'char1',
        { details: { title: 'T' } },
        'Source',
        'a.md',
      ),
    ).resolves.toBe(created)
    expect(supabase.rpc).toHaveBeenCalledWith('create_adventure_from_handoff', {
      p_campaign_id: 'c1',
      p_type: 'side',
      p_character_id: 'char1',
      p_changes: { details: { title: 'T' } },
      p_source_text: 'Source',
      p_source_label: 'a.md',
    })
    expect(getAdventure).toHaveBeenCalledWith('new1')
  })

  it('sends no character for a main adventure, whatever was chosen, and omits an empty label', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'new1', error: null } as never)
    vi.mocked(getAdventure).mockResolvedValue(adventure({ id: 'new1' }))
    await createAdventureFromHandoff('c1', 'main', 'char1', { details: { title: 'T' } }, 'S', null)
    const args = vi.mocked(supabase.rpc).mock.calls[0][1] as Record<string, unknown>
    expect(args.p_character_id).toBeNull()
    expect(args).not.toHaveProperty('p_source_label')
  })

  it('reports a refusal as a non-member, and throws the database error otherwise', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'denied' },
    } as never)
    await expect(
      createAdventureFromHandoff('c1', 'main', null, { details: { title: 'T' } }, 'S', null),
    ).rejects.toThrow('adventure_campaign_unavailable')
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { code: '22023', message: 'handoff_invalid' },
    } as never)
    await expect(createAdventureFromHandoff('c1', 'main', null, {}, 'S', null)).rejects.toEqual({
      code: '22023',
      message: 'handoff_invalid',
    })
    expect(getAdventure).not.toHaveBeenCalled()
  })
})

describe('attachHandoff', () => {
  it('sends the expected versions, the changes, the source, and the label', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'h1', error: null } as never)
    const expected = { adventure_updated_at: '2026-11-22T10:00:00.123456+00:00', objectives: {} }
    await expect(
      attachHandoff('a1', expected, { update: 'x' }, 'Source text', 'session-4.md'),
    ).resolves.toBe('h1')
    expect(supabase.rpc).toHaveBeenCalledWith('attach_adventure_handoff', {
      p_adventure_id: 'a1',
      p_expected: expected,
      p_changes: { update: 'x' },
      p_source_text: 'Source text',
      p_source_label: 'session-4.md',
    })
  })

  it('omits an empty label, so the database default applies', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'h1', error: null } as never)
    await attachHandoff('a1', {}, {}, 'Source', null)
    expect(vi.mocked(supabase.rpc).mock.calls[0][1]).not.toHaveProperty('p_source_label')
  })

  it('throws what the database returned', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'handoff_conflict' },
    } as never)
    await expect(attachHandoff('a1', {}, {}, 'x', null)).rejects.toEqual({
      message: 'handoff_conflict',
    })
  })
})

describe('listHandoffs', () => {
  it('reads the adventure’s sources oldest first', async () => {
    const { calls, chain } = builder({ data: [{ id: 'h1' }], error: null })
    vi.mocked(supabase.from).mockReturnValueOnce(chain as never)
    await expect(listHandoffs('a1')).resolves.toEqual([{ id: 'h1' }])
    expect(supabase.from).toHaveBeenCalledWith('adventure_handoffs')
    expect(calls).toContainEqual(['eq', ['adventure_id', 'a1']])
    expect(calls).toContainEqual(['order', ['imported_at', { ascending: true }]])
    expect(calls[0][1][0]).toContain('source_text')
  })

  it('returns an empty list for no rows and throws on an error', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(
      builder({ data: null, error: null }).chain as never,
    )
    await expect(listHandoffs('a1')).resolves.toEqual([])
    vi.mocked(supabase.from).mockReturnValueOnce(
      builder({ data: null, error: { message: 'boom' } }).chain as never,
    )
    await expect(listHandoffs('a1')).rejects.toEqual({ message: 'boom' })
  })
})

describe('deleteHandoff', () => {
  it('deletes by id, and treats a row that did not match as unavailable', async () => {
    const ok = builder({ data: { id: 'h1' }, error: null })
    vi.mocked(supabase.from).mockReturnValueOnce(ok.chain as never)
    await expect(deleteHandoff('h1')).resolves.toBeUndefined()
    expect(ok.calls).toContainEqual(['eq', ['id', 'h1']])

    vi.mocked(supabase.from).mockReturnValueOnce(
      builder({ data: null, error: null }).chain as never,
    )
    await expect(deleteHandoff('h1')).rejects.toThrow('handoff_unavailable')
  })
})

describe('handoff errors', () => {
  it.each([
    ['handoff_invalid', 'This handoff couldn’t be read'.replace('’', "'")],
    ['handoff_values_invalid', "Some proposed values aren't allowed"],
    ['handoff_source_invalid', 'under 64 KB'],
    ['handoff_conflict', 'changed while you were reviewing'],
    ['handoff_limit_reached', 'already has 50 sources'],
    ['handoff_unavailable', 'no longer available'],
  ])('has copy for %s', (code, text) => {
    expect(handoffError(new Error(code), 'fallback')).toContain(text)
  })

  it('falls back to the adventure copy, then to the caller’s fallback', () => {
    expect(handoffError(new Error('adventure_archived'), 'fallback')).toContain('archived')
    expect(handoffError(new Error('adventure_objective_limit_reached'), 'fallback')).toContain('50')
    expect(handoffError(new Error('network down'), 'fallback')).toBe('fallback')
    expect(handoffError({ message: '<script>' }, 'fallback')).toBe('fallback')
  })

  it('tells conflicts and lost access apart', () => {
    expect(isHandoffConflict(new Error('handoff_conflict'))).toBe(true)
    expect(isHandoffConflict(new Error('adventure_unavailable'))).toBe(false)
    expect(isHandoffTargetUnavailable(new Error('adventure_unavailable'))).toBe(true)
    expect(isHandoffTargetUnavailable({ message: 'adventure_archived' })).toBe(true)
    expect(isHandoffTargetUnavailable(new Error('handoff_conflict'))).toBe(false)
  })
})
