import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../lib/supabase'
import { diceFailure, listRolls, logPageSize, rollInCampaign } from './diceService'

vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

const campaignId = '00000000-0000-4000-8000-000000000011'

const row = {
  id: 'r1',
  campaign_id: campaignId,
  roller_id: 'p1',
  character_id: null,
  visibility: 'campaign',
  source: 'tray',
  label: null,
  expression: '1d20 + 5',
  terms: [{ kind: 'dice', sign: 1, count: 1, sides: 20 }],
  dice: [[{ value: 12, kept: true }], []],
  total: 17,
  created_at: '2026-11-22T14:30:10.000Z',
}

function builder(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = []
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'limit', 'lt']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args])
      return chain
    }
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return { calls, chain }
}

beforeEach(() => {
  vi.mocked(supabase.rpc).mockReset()
  vi.mocked(supabase.from).mockReset()
})

describe('rollInCampaign', () => {
  it('sends the spec and returns the stored roll', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: row, error: null } as never)
    const spec = {
      terms: [
        { kind: 'dice', sign: 1, count: 1, sides: 20 },
        { kind: 'constant', sign: 1, value: 5 },
      ],
    } as const
    const roll = await rollInCampaign({
      campaignId,
      spec: { terms: [...spec.terms] },
      visibility: 'self',
      source: 'skill',
      label: 'Stealth check',
      characterId: 'ch1',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('roll_dice', {
      p_campaign_id: campaignId,
      p_terms: spec.terms,
      p_visibility: 'self',
      p_source: 'skill',
      p_label: 'Stealth check',
      p_character_id: 'ch1',
    })
    expect(roll.id).toBe('r1')
    expect(roll.total).toBe(17)
  })

  it('throws the database error', async () => {
    const error = { code: '42501', message: 'not_a_member' }
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error } as never)
    await expect(
      rollInCampaign({
        campaignId,
        spec: { terms: [] },
        visibility: 'campaign',
        source: 'tray',
        label: null,
        characterId: null,
      }),
    ).rejects.toBe(error)
  })
})

describe('listRolls', () => {
  it('reads the newest page of the campaign', async () => {
    const { calls, chain } = builder({ data: [row], error: null })
    vi.mocked(supabase.from).mockReturnValueOnce(chain as never)
    const rolls = await listRolls(campaignId, null)
    expect(supabase.from).toHaveBeenCalledWith('dice_rolls')
    expect(rolls.map((roll) => roll.id)).toEqual(['r1'])
    expect(calls).toContainEqual(['eq', ['campaign_id', campaignId]])
    expect(calls).toContainEqual(['order', ['created_at', { ascending: false }]])
    expect(calls).toContainEqual(['limit', [logPageSize]])
    expect(calls.some(([method]) => method === 'lt')).toBe(false)
  })

  it('continues before the oldest loaded roll', async () => {
    const { calls, chain } = builder({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValueOnce(chain as never)
    await listRolls(campaignId, '2026-11-22T14:00:00.000Z')
    expect(calls).toContainEqual(['lt', ['created_at', '2026-11-22T14:00:00.000Z']])
  })

  it('throws a failed read', async () => {
    const error = { code: 'PGRST', message: 'nope' }
    const { chain } = builder({ data: null, error })
    vi.mocked(supabase.from).mockReturnValueOnce(chain as never)
    await expect(listRolls(campaignId, null)).rejects.toBe(error)
  })
})

describe('diceFailure', () => {
  it.each([
    [{ code: '42501', message: 'not_a_member' }, 'member', "You're no longer in this campaign."],
    [
      { code: '42501', message: 'character_unavailable' },
      'character',
      "That character isn't yours in this campaign.",
    ],
    [
      { code: '22023', message: 'dice_terms_invalid' },
      'invalid',
      'That roll is too big. Up to 100 dice and 20 parts.',
    ],
    [
      { code: 'P0001', message: 'dice_rate_limited' },
      'rate',
      'Slow down — too many rolls at once.',
    ],
    [{ code: '', message: 'TypeError: Failed to fetch' }, 'network', "Can't reach the table."],
    [new TypeError('Load failed'), 'network', "Can't reach the table."],
    [{ code: 'XX000', message: 'boom' }, 'other', "Couldn't roll. Try again."],
    [null, 'other', "Couldn't roll. Try again."],
  ])('maps %j', (error, kind, message) => {
    expect(diceFailure(error)).toEqual({ kind, message })
  })
})
