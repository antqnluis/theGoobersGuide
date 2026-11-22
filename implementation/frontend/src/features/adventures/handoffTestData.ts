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
