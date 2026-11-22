import { describe, expect, it } from 'vitest'
import {
  buildAttachRequest,
  buildNewRequest,
  completionSuggestions,
  defaultSelection,
  selectedChanges,
} from './handoffChanges'
import { blankTarget, parseHandoff, type HandoffChange } from './handoffDocument'
import { handoffJson, OBJ_DONE, OBJ_OPEN, OBJ_OTHER, target } from './handoffTestData'

function changesFor(proposal: Record<string, unknown>, current = target()): HandoffChange[] {
  const result = parseHandoff(handoffJson(proposal), current)
  if (result.kind !== 'parsed') throw new Error(result.message)
  return result.changes
}

const versions = {
  adventureUpdatedAt: '2026-11-22T10:00:00.123456+00:00',
  objectiveUpdatedAt: {
    [OBJ_OPEN]: '2026-11-22T09:00:00.000001+00:00',
    [OBJ_DONE]: '2026-11-22T09:00:00.000002+00:00',
    [OBJ_OTHER]: '2026-11-22T09:00:00.000003+00:00',
  },
}

const proposal = {
  title: 'The Drowned Bell, part two',
  status: 'completed',
  next_step: 'Talk to Maren',
  description: 'A bell went missing.',
  objectives: [
    { op: 'add', title: 'Recover the clapper' },
    { op: 'add', title: 'Ask Maren' },
    { op: 'complete', id: OBJ_OPEN },
    { op: 'reopen', id: OBJ_DONE },
    { op: 'rename', id: OBJ_OTHER, title: 'Ask the harbourmaster' },
  ],
  update: 'We reached Saltmere.',
}

describe('defaultSelection', () => {
  const changes = changesFor(proposal)

  it('selects nothing when attaching (H6)', () => {
    expect(defaultSelection(changes, 'attach').size).toBe(0)
  })

  it('selects every valid proposal for a new adventure, except status and suggested completions (H6, H7)', () => {
    const selected = defaultSelection(changes, 'new')
    expect(selected.has('detail:status')).toBe(false)
    expect(selected.has(`objective:complete:${OBJ_OPEN}`)).toBe(false)
    expect(selected.has('detail:title')).toBe(true)
    expect(selected.has('objective:add:0')).toBe(true)
    expect(selected.has('update')).toBe(true)
  })

  it('never selects unchanged or invalid changes', () => {
    const mixed = changesFor({
      title: 'The Drowned Bell',
      next_step: 'x'.repeat(281),
      update: 'Fine',
    })
    expect([...defaultSelection(mixed, 'new')]).toEqual(['update'])
  })
})

describe('buildAttachRequest', () => {
  const changes = changesFor(proposal)

  it('is a source-only attach when nothing is selected', () => {
    expect(buildAttachRequest(changes, new Set(), versions)).toEqual({
      ok: true,
      changes: {},
      expected: {},
      count: 0,
    })
  })

  it('builds the database-shaped changes and the expected versions from the selection only', () => {
    const selected = new Set([
      'detail:title',
      'detail:next_step',
      'objective:add:1',
      `objective:complete:${OBJ_OPEN}`,
      `objective:reopen:${OBJ_DONE}`,
      `objective:rename:${OBJ_OTHER}`,
      'update',
    ])
    expect(buildAttachRequest(changes, selected, versions)).toEqual({
      ok: true,
      changes: {
        details: { title: 'The Drowned Bell, part two', next_step: 'Talk to Maren' },
        objectives: {
          add: ['Ask Maren'],
          update: [
            { id: OBJ_OPEN, done: true },
            { id: OBJ_DONE, done: false },
            { id: OBJ_OTHER, title: 'Ask the harbourmaster' },
          ],
        },
        update: 'We reached Saltmere.',
      },
      expected: {
        adventure_updated_at: '2026-11-22T10:00:00.123456+00:00',
        objectives: {
          [OBJ_OPEN]: '2026-11-22T09:00:00.000001+00:00',
          [OBJ_DONE]: '2026-11-22T09:00:00.000002+00:00',
          [OBJ_OTHER]: '2026-11-22T09:00:00.000003+00:00',
        },
      },
      count: 7,
    })
  })

  it('lists only the targeted objectives in the expected versions', () => {
    const request = buildAttachRequest(
      changes,
      new Set(['detail:status', 'objective:add:0']),
      versions,
    )
    expect(request).toMatchObject({
      ok: true,
      changes: { details: { status: 'completed' }, objectives: { add: ['Recover the clapper'] } },
      expected: { objectives: {} },
      count: 2,
    })
  })

  it('ignores selected keys that are unknown, invalid, or unchanged', () => {
    const mixed = changesFor({
      title: 'The Drowned Bell',
      next_step: 'x'.repeat(281),
      update: 'Fine',
    })
    const request = buildAttachRequest(
      mixed,
      new Set(['detail:title', 'detail:next_step', 'nonsense', 'update']),
      versions,
    )
    expect(request).toMatchObject({ ok: true, changes: { update: 'Fine' }, count: 1 })
    expect(selectedChanges(mixed, new Set(['detail:title'])).length).toBe(0)
  })

  it('refuses when a targeted objective has no known version', () => {
    const request = buildAttachRequest(changes, new Set([`objective:complete:${OBJ_OPEN}`]), {
      ...versions,
      objectiveUpdatedAt: {},
    })
    expect(request.ok).toBe(false)
  })

  it('keeps the version strings exactly as given', () => {
    const request = buildAttachRequest(changes, new Set(['detail:title']), versions)
    expect(request.ok && request.expected).toMatchObject({
      adventure_updated_at: '2026-11-22T10:00:00.123456+00:00',
    })
  })
})

describe('buildNewRequest', () => {
  // A new adventure has no objectives to target, so only adds can appear.
  const changes = changesFor(
    {
      ...proposal,
      objectives: proposal.objectives.filter((operation) => operation.op === 'add'),
    },
    blankTarget('side'),
  )

  it('builds the changes from the selection, with Pending unless the player picks a status', () => {
    const selected = defaultSelection(changes, 'new')
    expect(buildNewRequest(changes, selected)).toEqual({
      ok: true,
      changes: {
        details: {
          title: 'The Drowned Bell, part two',
          next_step: 'Talk to Maren',
          description: 'A bell went missing.',
        },
        objectives: { add: ['Recover the clapper', 'Ask Maren'] },
        update: 'We reached Saltmere.',
      },
      expected: {},
      count: 6,
    })
  })

  it("applies the player's own status, and a selected status change when none is given", () => {
    const selected = defaultSelection(changes, 'new')
    expect(buildNewRequest(changes, selected, 'on_hold')).toMatchObject({
      changes: { details: { status: 'on_hold' } },
      count: 7,
    })
    expect(buildNewRequest(changes, selected, 'pending')).toMatchObject({ count: 6 })
    const withProposed = new Set([...selected, 'detail:status'])
    expect(buildNewRequest(changes, withProposed)).toMatchObject({
      changes: { details: { status: 'completed' } },
      count: 7,
    })
  })

  it('needs a selected title', () => {
    const selected = new Set(defaultSelection(changes, 'new'))
    selected.delete('detail:title')
    expect(buildNewRequest(changes, selected)).toEqual({
      ok: false,
      reason: 'A new adventure needs a title.',
    })
    expect(buildNewRequest(changes, new Set()).ok).toBe(false)
  })
})

describe('completionSuggestions', () => {
  it('lists the selectable changes that suggest finishing something', () => {
    const suggestions = completionSuggestions(changesFor(proposal)).map((change) => change.key)
    expect(suggestions).toEqual(['detail:status', `objective:complete:${OBJ_OPEN}`])
  })
})
