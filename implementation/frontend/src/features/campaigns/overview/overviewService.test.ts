import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabase'
import { getOverview, saveOverview } from './overviewService'
import type { OverviewValues } from './overviewTypes'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const campaignId = '00000000-0000-4000-8000-000000000011'
const values: OverviewValues = {
  announcement: '',
  location: 'The Sunken Library',
  in_world_date: '',
  chapter: '',
  situation: '',
  objective: '',
  last_session: '',
  next_session_at: null,
  next_session_note: '',
  ruleset: '',
  house_rules: '',
  table_notes: '',
}
const row = { campaign_id: campaignId, ...values, updated_at: '2026-11-23T10:00:00+00:00' }

function builder(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = []
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'insert', 'update']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args])
      return chain
    }
  }
  chain.maybeSingle = () => Promise.resolve(result)
  chain.single = () => Promise.resolve(result)
  return { calls, chain }
}

function queue(...results: { data: unknown; error: unknown }[]) {
  const all = results.map(builder)
  for (const { chain } of all) vi.mocked(supabase.from).mockReturnValueOnce(chain as never)
  return all.map(({ calls }) => calls)
}

beforeEach(() => vi.resetAllMocks())

describe('overview service', () => {
  it('reads the campaign overview, or null when none is written', async () => {
    const [calls] = queue({ data: row, error: null })
    expect(await getOverview(campaignId)).toEqual(row)
    expect(supabase.from).toHaveBeenCalledWith('campaign_overviews')
    expect(calls).toContainEqual(['eq', ['campaign_id', campaignId]])

    queue({ data: null, error: null })
    expect(await getOverview(campaignId)).toBeNull()
  })

  it('throws a failed read', async () => {
    queue({ data: null, error: new Error('down') })
    await expect(getOverview(campaignId)).rejects.toThrow('down')
  })

  it('updates an existing overview without inserting', async () => {
    const [update] = queue({ data: row, error: null })
    expect(await saveOverview(campaignId, values)).toEqual(row)
    expect(update).toContainEqual(['update', [values]])
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('creates the overview on the first save', async () => {
    const [, insert] = queue({ data: null, error: null }, { data: row, error: null })
    expect(await saveOverview(campaignId, values)).toEqual(row)
    expect(insert).toContainEqual(['insert', [{ campaign_id: campaignId, ...values }]])
  })

  it('updates when a racing first save created the row', async () => {
    queue(
      { data: null, error: null },
      { data: null, error: { code: '23505', message: 'duplicate' } },
      { data: row, error: null },
    )
    expect(await saveOverview(campaignId, values)).toEqual(row)
  })

  it('throws when the insert is refused, as for a member who is not the owner', async () => {
    queue({ data: null, error: null }, { data: null, error: { code: '42501', message: 'rls' } })
    await expect(saveOverview(campaignId, values)).rejects.toMatchObject({ code: '42501' })
  })
})
