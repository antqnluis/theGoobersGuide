import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../lib/supabase'
import {
  createNpc,
  deleteNpc,
  getNpc,
  isNpcConflict,
  isNpcUnavailable,
  listNpcs,
  npcError,
  removeNpcPortrait,
  saveNpc,
  setNpcVisibility,
  uploadNpcPortrait,
} from './npcService'
import { campaignId, npc } from './npcTestData'

vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}))

/** A storage bucket stub that records what was uploaded and removed. */
function bucket(upload: { error: unknown } = { error: null }) {
  const stub = {
    upload: vi.fn().mockResolvedValue(upload),
    remove: vi.fn().mockResolvedValue({ error: null }),
  }
  vi.mocked(supabase.storage.from).mockReturnValue(stub as never)
  return stub
}

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
  return { calls, chain }
}

function queue(...results: { data: unknown; error: unknown }[]) {
  const all = results.map(builder)
  for (const { chain } of all) vi.mocked(supabase.from).mockReturnValueOnce(chain as never)
  return all.map(({ calls }) => calls)
}

const row = npc()
const values = { name: 'Brenna', role: 'Innkeeper', location: 'Stag', body: 'text' }

beforeEach(() => vi.mocked(supabase.from).mockReset())

describe('npcService', () => {
  it('lists a campaign newest edit first, without bodies', async () => {
    const [calls] = queue({ data: [row], error: null })
    await expect(listNpcs(campaignId)).resolves.toEqual([row])
    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('npcs')
    expect(calls).toContainEqual(['eq', ['campaign_id', campaignId]])
    expect(calls).toContainEqual(['order', ['updated_at', { ascending: false }]])
    expect(String(calls[0][1][0])).not.toContain('body')
  })

  it('treats a missing row as unavailable', async () => {
    queue({ data: null, error: null })
    await expect(getNpc(row.id)).rejects.toThrow('npc_unavailable')
  })

  it('creates an NPC in the campaign', async () => {
    const [calls] = queue({ data: row, error: null })
    await expect(createNpc(campaignId, { ...values, visibility: 'campaign' })).resolves.toEqual(row)
    expect(calls[0]).toEqual([
      'insert',
      [{ campaign_id: campaignId, visibility: 'campaign', ...values }],
    ])
  })

  it('maps a row-level security refusal to a campaign-unavailable error', async () => {
    queue({ data: null, error: { code: '42501', message: 'denied' } })
    await expect(createNpc(campaignId, { ...values, visibility: 'private' })).rejects.toThrow(
      'npc_campaign_unavailable',
    )
  })

  it('saves only when the NPC has not changed since it was read', async () => {
    const [calls] = queue({ data: row, error: null })
    await saveNpc(row.id, values, row.updated_at)
    expect(calls).toContainEqual(['eq', ['updated_at', row.updated_at]])
  })

  it('reports a stale save as a conflict carrying the latest version', async () => {
    const latest = npc({ id: row.id, name: 'Changed' })
    queue({ data: null, error: null }, { data: latest, error: null })
    const failure = await saveNpc(row.id, values, row.updated_at).catch((error) => error)
    expect(isNpcConflict(failure)).toBe(true)
    expect(failure.latest).toEqual(latest)
  })

  it('reports an unreadable NPC as unavailable on a stale save', async () => {
    queue({ data: null, error: null }, { data: null, error: null })
    const failure = await setNpcVisibility(row.id, 'campaign', row.updated_at).catch((e) => e)
    expect(isNpcUnavailable(failure)).toBe(true)
  })

  it('deletes, and treats an already-gone NPC as unavailable', async () => {
    queue({ data: { id: row.id }, error: null })
    await expect(deleteNpc(row.id)).resolves.toBeUndefined()
    queue({ data: null, error: null })
    await expect(deleteNpc(row.id)).rejects.toThrow('npc_unavailable')
  })

  it('gives safe copy for known failures and the fallback for others', () => {
    expect(npcError(new Error('npc_limit_reached'), 'fallback')).toMatch(/500 NPCs/)
    expect(npcError(new Error('boom'), 'fallback')).toBe('fallback')
  })
})

describe('npc portraits', () => {
  const png = new File(['x'], 'face.png', { type: 'image/png' })

  it('uploads under the NPC id, points the row at it, then drops the old file', async () => {
    const files = bucket()
    const [calls] = queue({ data: { ...row, portrait_path: 'new' }, error: null })
    await uploadNpcPortrait(row.id, png, 'old/path.png')
    const [path] = files.upload.mock.calls[0]
    expect(path).toMatch(new RegExp(`^${row.id}/[0-9a-f-]+\\.png$`))
    expect(calls[0]).toEqual(['update', [{ portrait_path: path }]])
    expect(files.remove).toHaveBeenCalledWith(['old/path.png'])
  })

  it('rejects other file types before uploading', async () => {
    const files = bucket()
    const gif = new File(['x'], 'face.gif', { type: 'image/gif' })
    await expect(uploadNpcPortrait(row.id, gif, null)).rejects.toThrow('npc_portrait_type_invalid')
    expect(files.upload).not.toHaveBeenCalled()
  })

  it('discards the new file when the row cannot be updated, keeping the old picture', async () => {
    const files = bucket()
    queue({ data: null, error: { code: '42501', message: 'npc_portrait_author_only' } })
    await expect(uploadNpcPortrait(row.id, png, 'old/path.png')).rejects.toBeTruthy()
    const [path] = files.upload.mock.calls[0]
    expect(files.remove).toHaveBeenCalledTimes(1)
    expect(files.remove).toHaveBeenCalledWith([path])
  })

  it('clears the path and then drops the file', async () => {
    const files = bucket()
    const [calls] = queue({ data: row, error: null })
    await removeNpcPortrait(row.id, 'a/b.png')
    expect(calls[0]).toEqual(['update', [{ portrait_path: null }]])
    expect(files.remove).toHaveBeenCalledWith(['a/b.png'])
  })

  it('removes the picture file before deleting the NPC', async () => {
    const files = bucket()
    queue({ data: { id: row.id }, error: null })
    await deleteNpc(row.id, 'a/b.png')
    expect(files.remove).toHaveBeenCalledWith(['a/b.png'])
  })

  it('explains an author-only refusal', () => {
    expect(npcError(new Error('npc_portrait_author_only'), 'x')).toMatch(/Only the person/)
  })
})
