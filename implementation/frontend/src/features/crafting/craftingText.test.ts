import { describe, expect, it } from 'vitest'
import { describeRest, formatRestTime } from './craftingText'

describe('describeRest', () => {
  it('names how many characters visions come to', () => {
    expect(describeRest({ character_count: 4, library_count: 1 })).toBe(
      'The party rests. Visions come to 4 characters.',
    )
    expect(describeRest({ character_count: 1, library_count: 2 })).toBe(
      'The party rests. Visions come to 1 character.',
    )
  })

  it('says so when no library is on, or no character is active', () => {
    expect(describeRest({ character_count: 4, library_count: 0 })).toBe(
      'The party rests, but no library is turned on, so nothing stirs.',
    )
    expect(describeRest({ character_count: 0, library_count: 1 })).toBe(
      'The party rests. No active characters to receive visions.',
    )
  })
})

describe('formatRestTime', () => {
  it('writes a short date and time', () => {
    expect(formatRestTime('2026-11-27T21:04:00Z')).toMatch(/^Nov 2[78], 2026, \d{1,2}:04 [AP]M$/)
  })
})
