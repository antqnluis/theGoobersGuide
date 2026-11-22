import { describe, expect, it } from 'vitest'
import { adventure, miraId, participant } from './adventureTestData'
import { appliedSummary, maxSourceBytes, newSourceAudience, sourceAudience } from './handoffRules'
import { handoffTag } from './handoffLabels'
import { handoffRecord } from './handoffTestData'

describe('appliedSummary', () => {
  it('lists the changed fields and the counts', () => {
    expect(appliedSummary(handoffRecord())).toBe(
      'Changed status, next step. 2 objectives added. 1 objective changed. 1 progress update posted.',
    )
  })

  it('says so when a source changed nothing', () => {
    expect(
      appliedSummary(
        handoffRecord({
          change_count: 0,
          applied: { fields: [], objectives_added: 0, objectives_changed: 0, update: false },
        }),
      ),
    ).toBe('Kept as a source only. No changes applied.')
  })

  it('uses singular nouns and skips what did not happen', () => {
    expect(
      appliedSummary(
        handoffRecord({
          change_count: 1,
          applied: { fields: [], objectives_added: 1, objectives_changed: 0, update: false },
        }),
      ),
    ).toBe('1 objective added.')
  })
})

describe('sourceAudience', () => {
  it('names who can read a source', () => {
    expect(sourceAudience(adventure({ type: 'main', visibility: 'campaign' }))).toContain(
      'Everyone in this campaign',
    )
    expect(sourceAudience(adventure())).toBe('Only you can read the source.')
    expect(
      sourceAudience(
        adventure({
          participants: [participant(), participant({ profile_id: miraId })],
        }),
      ),
    ).toBe('Everyone in this adventure can read the source.')
    expect(sourceAudience(adventure({ visibility: 'party' }))).toContain(
      'The party can read it too',
    )
  })

  it('names who will read the source of a new adventure', () => {
    expect(newSourceAudience('main')).toContain('Everyone in this campaign')
    expect(newSourceAudience('personal')).toContain('starts private')
    expect(newSourceAudience('side')).toContain('Only you')
  })

  it('keeps the size limit the database has', () => {
    expect(maxSourceBytes).toBe(65_536)
  })
})

describe('handoffTag', () => {
  const labels = new Map<string, string | null>([
    ['h1', 'session-4.md'],
    ['h2', null],
  ])

  it('labels rows a handoff created, with the source when it has one', () => {
    expect(handoffTag('h1', labels)).toBe('From handoff: session-4.md')
    expect(handoffTag('h2', labels)).toBe('From handoff')
    expect(handoffTag('unknown', labels)).toBe('From handoff')
    expect(handoffTag(null, labels)).toBeNull()
  })
})
