import { describe, expect, it } from 'vitest'
import {
  adventureLimits,
  charactersLeft,
  normalizeAdventureCreateInput,
  normalizeAdventureInput,
  normalizeUpdateBody,
  validateAdventureCreateInput,
  validateAdventureInput,
  validateObjectiveTitle,
  validateUpdateBody,
} from './adventureValidation'

const valid = { title: 'Find the heir', description: '', nextStep: '', reference: '' }

describe('validateAdventureInput', () => {
  it('accepts a title alone and every limit exactly', () => {
    expect(validateAdventureInput(valid)).toEqual({})
    expect(
      validateAdventureInput({
        title: 'a'.repeat(adventureLimits.title),
        description: 'd'.repeat(adventureLimits.description),
        nextStep: 'n'.repeat(adventureLimits.nextStep),
        reference: 'r'.repeat(adventureLimits.reference),
      }),
    ).toEqual({})
  })

  it('refuses an empty or too long title and one with a line break', () => {
    for (const title of ['', '   ', 'a'.repeat(121), 'two\nlines', 'tab\there', 'bell\u0007']) {
      expect(validateAdventureInput({ ...valid, title }).title).toBeDefined()
    }
  })

  it('refuses line breaks and overlong text in the single-line fields', () => {
    expect(validateAdventureInput({ ...valid, nextStep: 'a\nb' }).nextStep).toBeDefined()
    expect(validateAdventureInput({ ...valid, reference: 'a\nb' }).reference).toBeDefined()
    expect(validateAdventureInput({ ...valid, nextStep: 'n'.repeat(281) }).nextStep).toBeDefined()
    expect(validateAdventureInput({ ...valid, reference: 'r'.repeat(281) }).reference).toBeDefined()
  })

  it('allows newlines and tabs in the description but no other controls, and counts \\r\\n once', () => {
    expect(validateAdventureInput({ ...valid, description: 'a\nb\tc\r\nd' })).toEqual({})
    expect(validateAdventureInput({ ...valid, description: 'a\u0007' }).description).toBeDefined()
    expect(
      validateAdventureInput({ ...valid, description: 'x'.repeat(4001) }).description,
    ).toBeDefined()
    // 2,000 CRLF pairs are 4,000 characters once stored.
    expect(validateAdventureInput({ ...valid, description: 'ab\r\n'.repeat(1000) })).toEqual({})
  })
})

describe('validateAdventureCreateInput', () => {
  const create = {
    title: 'Find the heir',
    type: 'personal',
    characterId: 'c1',
    nextStep: '',
  } as const

  it('needs a character for personal and side adventures, not for main', () => {
    expect(validateAdventureCreateInput(create)).toEqual({})
    expect(validateAdventureCreateInput({ ...create, characterId: null }).character).toBeDefined()
    expect(
      validateAdventureCreateInput({ ...create, type: 'side', characterId: null }).character,
    ).toBeDefined()
    expect(validateAdventureCreateInput({ ...create, type: 'main', characterId: null })).toEqual({})
  })

  it('checks the title and next step like the details form', () => {
    expect(validateAdventureCreateInput({ ...create, title: ' ' }).title).toBeDefined()
    expect(validateAdventureCreateInput({ ...create, nextStep: 'a\nb' }).nextStep).toBeDefined()
  })
})

describe('objective and update text', () => {
  it('validates an objective title of 1–200 characters on one line', () => {
    expect(validateObjectiveTitle('Search the cellar')).toBeNull()
    expect(validateObjectiveTitle('a'.repeat(200))).toBeNull()
    for (const title of ['', '  ', 'a'.repeat(201), 'a\nb']) {
      expect(validateObjectiveTitle(title)).not.toBeNull()
    }
  })

  it('validates an update of 1–2,000 characters with line breaks allowed', () => {
    expect(validateUpdateBody('Found a key.\nIt was rusty.')).toBeNull()
    expect(validateUpdateBody('a'.repeat(2000))).toBeNull()
    for (const body of ['', '   \n ', 'a'.repeat(2001), 'a\u0007']) {
      expect(validateUpdateBody(body)).not.toBeNull()
    }
  })
})

describe('normalization', () => {
  it('trims single-line fields and normalizes the description’s line endings', () => {
    expect(
      normalizeAdventureInput({
        title: '  Find the heir ',
        type: 'side',
        description: 'a\r\nb\rc',
        nextStep: ' Ask ',
        reference: ' Inn ',
      }),
    ).toEqual({
      title: 'Find the heir',
      type: 'side',
      description: 'a\nb\nc',
      next_step: 'Ask',
      reference: 'Inn',
    })
  })

  it('never sends a character with a main adventure', () => {
    const input = { title: ' Story ', type: 'main', characterId: 'c1', nextStep: ' go ' } as const
    expect(normalizeAdventureCreateInput(input)).toEqual({
      type: 'main',
      title: 'Story',
      character_id: null,
      next_step: 'go',
    })
    expect(normalizeAdventureCreateInput({ ...input, type: 'side' }).character_id).toBe('c1')
  })

  it('trims an update and normalizes its line endings', () => {
    expect(normalizeUpdateBody('  a\r\nb  ')).toBe('a\nb')
  })
})

describe('charactersLeft', () => {
  it('shows the count only near the limit', () => {
    expect(charactersLeft('short', 4000)).toBeNull()
    expect(charactersLeft('x'.repeat(3800), 4000)).toBe(200)
    expect(charactersLeft('x'.repeat(4001), 4000)).toBe(-1)
  })
})
