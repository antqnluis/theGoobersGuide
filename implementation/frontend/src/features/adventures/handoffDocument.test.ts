import { describe, expect, it } from 'vitest'
import { blankTarget, handoffTargetFrom, parseHandoff, type HandoffChange } from './handoffDocument'
import { handoffJson, OBJ_DONE, OBJ_OPEN, OBJ_OTHER, target } from './handoffTestData'
import { adventure } from './adventureTestData'

function parsed(proposal: Record<string, unknown>, current = target(), extra = {}) {
  const result = parseHandoff(handoffJson(proposal, extra), current)
  if (result.kind !== 'parsed') throw new Error(`rejected: ${result.message}`)
  return result
}

const byKey = (changes: HandoffChange[], key: string) =>
  changes.find((change) => change.key === key)

describe('parseHandoff envelope', () => {
  it('reads a valid document, with or without a code fence', () => {
    const json = handoffJson({ title: 'The Drowned Bell, part two' })
    expect(parseHandoff(json, target()).kind).toBe('parsed')
    expect(parseHandoff('```json\n' + json + '\n```', target()).kind).toBe('parsed')
  })

  it.each([
    ['empty text', '', 'Paste a document first.'],
    ['invalid JSON', '{nope', 'valid JSON'],
    ['an array', '[]', 'isn’t a Goobers Guide document'],
    [
      'another format',
      '{"format":"x","version":1,"proposal":{}}',
      'isn’t a Goobers Guide document',
    ],
    [
      'the wrong version',
      '{"format":"the-goobers-guide-adventure-handoff","version":2,"proposal":{}}',
      'different format version',
    ],
    [
      'a character document',
      '{"format":"the-goobers-guide-character","version":3}',
      'Import character',
    ],
    [
      'a character update',
      '{"format":"the-goobers-guide-character-update","version":2}',
      'Import updates',
    ],
    [
      'no proposal',
      '{"format":"the-goobers-guide-adventure-handoff","version":1}',
      'no proposal section',
    ],
    [
      'a proposal that is a list',
      '{"format":"the-goobers-guide-adventure-handoff","version":1,"proposal":[]}',
      'no proposal section',
    ],
  ])('rejects %s', (_label, text, message) => {
    const result = parseHandoff(text, target())
    expect(result.kind).toBe('rejected')
    expect(result.kind === 'rejected' && result.message).toContain(message)
  })

  it('accepts an empty proposal with no changes', () => {
    expect(parsed({}).changes).toEqual([])
  })

  it('lists unknown keys under ignored, including keys that would change access', () => {
    const result = parsed(
      {
        title: 'New title',
        visibility: 'party',
        type: 'main',
        participants: [],
        objectives: [{ op: 'add', title: 'Goal', extra: 1 }],
      },
      target(),
      { source: 'x', archived_at: 'now' },
    )
    expect(result.ignored.sort()).toEqual(
      [
        'archived_at',
        'proposal.objectives[0].extra',
        'proposal.participants',
        'proposal.type',
        'proposal.visibility',
        'source',
      ].sort(),
    )
    expect(result.changes.map((change) => change.key)).toEqual(['detail:title', 'objective:add:0'])
  })

  it('shows issues as notes and never blocks on them', () => {
    const result = parsed({ title: 'T2' }, target(), {
      issues: ['  Two harbourmasters. ', '', 'Another'],
    })
    expect(result.notes).toEqual(['Two harbourmasters.', 'Another'])
    const bad = parsed({ title: 'T2' }, target(), { issues: 'oops' })
    expect(bad.notes).toEqual([])
    expect(bad.ignored).toEqual(['issues'])
    const many = parsed({}, target(), {
      issues: Array.from({ length: 30 }, (_, n) => `Issue ${n}`),
    })
    expect(many.notes).toHaveLength(20)
  })
})

describe('details', () => {
  it('compares each field with the current value', () => {
    const { changes } = parsed({
      title: '  The Drowned Bell, part two ',
      status: 'in_progress',
      next_step: 'Talk to Maren',
      reference: '',
      description: 'A bell went missing.\r\nThen it was found.',
    })
    expect(changes.map((change) => [change.key, change.state, change.proposed])).toEqual([
      ['detail:title', 'ok', 'The Drowned Bell, part two'],
      ['detail:status', 'ok', 'in_progress'],
      ['detail:next_step', 'ok', 'Talk to Maren'],
      ['detail:reference', 'ok', ''],
      ['detail:description', 'ok', 'A bell went missing.\nThen it was found.'],
    ])
    expect(byKey(changes, 'detail:next_step')).toMatchObject({
      label: 'Next step',
      current: 'Go to Saltmere',
    })
  })

  it('marks a value equal to the current one as no change', () => {
    const { changes } = parsed({
      title: 'The Drowned Bell',
      status: 'pending',
      next_step: ' Go to Saltmere ',
      reference: 'Maren Vos',
      description: 'A bell went missing.',
    })
    expect(changes.map((change) => change.state)).toEqual(Array(5).fill('unchanged'))
  })

  it('disables only the invalid values, each with its own message', () => {
    const { changes } = parsed({
      title: '',
      status: 'Completed',
      next_step: 'a\nb',
      reference: 'x'.repeat(281),
      description: 'x'.repeat(4001),
    })
    expect(changes.every((change) => change.state === 'invalid' && change.problem)).toBe(true)

    const mixed = parsed({ title: 'x'.repeat(121), next_step: 'Fine' }).changes
    expect(mixed.map((change) => change.state)).toEqual(['invalid', 'ok'])
  })

  it('treats values of the wrong type as invalid changes, not as a blocked document', () => {
    const { changes } = parsed({ title: 7, status: null, description: ['x'], next_step: true })
    expect(changes.map((change) => change.state)).toEqual(Array(4).fill('invalid'))
    expect(byKey(changes, 'detail:status')?.problem).toContain('empty text')
  })

  it('accepts the limits exactly', () => {
    const { changes } = parsed({
      title: 'x'.repeat(120),
      next_step: 'x'.repeat(280),
      reference: 'x'.repeat(280),
      description: 'x'.repeat(4000),
    })
    expect(changes.map((change) => change.state)).toEqual(Array(4).fill('ok'))
  })

  it('flags a proposed Completed status as a suggestion (H7), unless it is already completed', () => {
    const open = parsed({ status: 'completed' }).changes[0]
    expect(open).toMatchObject({ state: 'ok', suggestsCompletion: true })
    const done = parsed({ status: 'completed' }, target({ status: 'completed' })).changes[0]
    expect(done).toMatchObject({ state: 'unchanged', suggestsCompletion: false })
    expect(parsed({ status: 'on_hold' }).changes[0].suggestsCompletion).toBe(false)
  })
})

describe('objectives', () => {
  it('turns each operation into a change against the current objective', () => {
    const { changes } = parsed({
      objectives: [
        { op: 'add', title: ' Recover the clapper ' },
        { op: 'complete', id: OBJ_OPEN },
        { op: 'reopen', id: OBJ_DONE },
        { op: 'rename', id: OBJ_OTHER, title: 'Ask the harbourmaster' },
      ],
    })
    expect(changes.map((change) => [change.key, change.state])).toEqual([
      ['objective:add:0', 'ok'],
      [`objective:complete:${OBJ_OPEN}`, 'ok'],
      [`objective:reopen:${OBJ_DONE}`, 'ok'],
      [`objective:rename:${OBJ_OTHER}`, 'ok'],
    ])
    expect(changes[0]).toMatchObject({ proposed: 'Recover the clapper', current: null })
    expect(changes[1]).toMatchObject({
      current: 'Not done',
      proposed: 'Done',
      objectiveTitle: 'Find the bell',
      suggestsCompletion: true,
    })
    expect(changes[2]).toMatchObject({
      current: 'Done',
      proposed: 'Not done',
      suggestsCompletion: false,
    })
    expect(changes[3]).toMatchObject({ current: 'Ask around', proposed: 'Ask the harbourmaster' })
  })

  it('marks operations that change nothing', () => {
    const { changes } = parsed({
      objectives: [
        { op: 'complete', id: OBJ_DONE },
        { op: 'reopen', id: OBJ_OPEN },
        { op: 'rename', id: OBJ_OTHER, title: 'Ask around' },
      ],
    })
    expect(changes.map((change) => [change.state, change.suggestsCompletion])).toEqual([
      ['unchanged', false],
      ['unchanged', false],
      ['unchanged', false],
    ])
  })

  it('disables an invalid title without blocking the rest', () => {
    const { changes } = parsed({
      objectives: [
        { op: 'add', title: '' },
        { op: 'add' },
        { op: 'add', title: 'x'.repeat(201) },
        { op: 'add', title: 'x'.repeat(200) },
        { op: 'rename', id: OBJ_OPEN, title: 'two\nlines' },
        { op: 'rename', id: OBJ_OTHER },
      ],
    })
    expect(changes.map((change) => change.state)).toEqual([
      'invalid',
      'invalid',
      'invalid',
      'ok',
      'invalid',
      'invalid',
    ])
  })

  it('blocks an id that is not on the adventure', () => {
    for (const op of ['complete', 'reopen', 'rename']) {
      const result = parseHandoff(
        handoffJson({
          objectives: [{ op, id: 'ffffffff-0000-4000-8000-000000000000', title: 'x' }],
        }),
        target(),
      )
      expect(result).toEqual({
        kind: 'rejected',
        message:
          'This handoff was made for a different version of the adventure. Copy the prompt again.',
      })
    }
    // A new adventure has no objectives to target.
    expect(
      parseHandoff(handoffJson({ objectives: [{ op: 'complete', id: OBJ_OPEN }] }), blankTarget())
        .kind,
    ).toBe('rejected')
  })

  it('blocks duplicate operations on one objective, bad shapes, and too many operations', () => {
    const rejectedFor = (objectives: unknown) =>
      parseHandoff(handoffJson({ objectives }), target()).kind === 'rejected'
    expect(
      rejectedFor([
        { op: 'complete', id: OBJ_OPEN },
        { op: 'rename', id: OBJ_OPEN, title: 'x' },
      ]),
    ).toBe(true)
    expect(rejectedFor('add')).toBe(true)
    expect(rejectedFor(['add'])).toBe(true)
    expect(rejectedFor([{ op: 'remove', id: OBJ_OPEN }])).toBe(true)
    expect(rejectedFor([{ op: 'complete' }])).toBe(true)
    expect(rejectedFor([{ op: 'complete', id: 5 }])).toBe(true)
    expect(
      rejectedFor(Array.from({ length: 51 }, (_, n) => ({ op: 'add', title: `Goal ${n}` }))),
    ).toBe(true)
    expect(
      rejectedFor(Array.from({ length: 50 }, (_, n) => ({ op: 'add', title: `Goal ${n}` }))),
    ).toBe(false)
  })

  it('disables adds that would pass the 50-objective cap', () => {
    const crowded = target({
      objectives: Array.from({ length: 48 }, (_, n) => ({
        id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        title: `Goal ${n}`,
        done: false,
      })),
    })
    const { changes } = parsed(
      {
        objectives: [
          { op: 'add', title: 'A' },
          { op: 'add', title: 'B' },
          { op: 'add', title: 'C' },
        ],
      },
      crowded,
    )
    expect(changes.map((change) => change.state)).toEqual(['ok', 'ok', 'invalid'])
    expect(changes[2].problem).toContain('50 objectives')
  })
})

describe('update', () => {
  it('proposes one progress update, trimmed and with line endings normalized', () => {
    const { changes } = parsed({ update: '  We reached Saltmere.\r\nThe bell was stolen.  ' })
    expect(changes).toEqual([
      expect.objectContaining({
        key: 'update',
        kind: 'update',
        state: 'ok',
        proposed: 'We reached Saltmere.\nThe bell was stolen.',
        current: null,
      }),
    ])
  })

  it('ignores an empty update, disables a too long or non-text one', () => {
    expect(parsed({ update: '   ' }).changes).toEqual([])
    expect(parsed({ update: 'x'.repeat(2001) }).changes[0].state).toBe('invalid')
    expect(parsed({ update: 'x'.repeat(2000) }).changes[0].state).toBe('ok')
    expect(parsed({ update: 5 }).changes[0].state).toBe('invalid')
  })
})

describe('handoffTargetFrom', () => {
  it('keeps only what the parser and the prompt use', () => {
    const detail = adventure()
    expect(Object.keys(handoffTargetFrom(detail)).sort()).toEqual([
      'description',
      'next_step',
      'objectives',
      'reference',
      'status',
      'title',
      'type',
    ])
  })
})
