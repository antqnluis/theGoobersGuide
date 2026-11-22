import type { HandoffRecord } from './handoffService'
import { blankTarget, type HandoffTarget } from './handoffDocument'

export const OBJ_OPEN = '00000000-0000-4000-8000-0000000000a1'
export const OBJ_DONE = '00000000-0000-4000-8000-0000000000a2'
export const OBJ_OTHER = '00000000-0000-4000-8000-0000000000a3'

/** An adventure with one open and one finished objective, as the prompt and parser see it. */
export function target(overrides: Partial<HandoffTarget> = {}): HandoffTarget {
  return {
    ...blankTarget('personal'),
    title: 'The Drowned Bell',
    status: 'pending',
    next_step: 'Go to Saltmere',
    reference: 'Maren Vos',
    description: 'A bell went missing.',
    objectives: [
      { id: OBJ_OPEN, title: 'Find the bell', done: false },
      { id: OBJ_DONE, title: 'Reach the harbour', done: true },
      { id: OBJ_OTHER, title: 'Ask around', done: false },
    ],
    ...overrides,
  }
}

/** A handoff document as the assistant would return it. */
export function handoffJson(
  proposal: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return JSON.stringify({
    format: 'the-goobers-guide-adventure-handoff',
    version: 1,
    proposal,
    ...extra,
  })
}

/** One kept source, as the sources list reads it. */
export function handoffRecord(overrides: Partial<HandoffRecord> = {}): HandoffRecord {
  return {
    id: 'h1',
    adventure_id: 'a1',
    kind: 'attach',
    source_label: 'session-4.md',
    source_text: '# Session 4\n\n<b>The party</b> reached Saltmere.',
    applied: {
      fields: ['status', 'next_step'],
      objectives_added: 2,
      objectives_changed: 1,
      update: true,
    },
    change_count: 6,
    imported_by: '00000000-0000-4000-8000-000000000001',
    imported_at: '2026-11-22T10:00:00+00:00',
    ...overrides,
  }
}
