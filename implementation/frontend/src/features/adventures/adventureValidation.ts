import type {
  AdventureCreateInput,
  AdventureCreateValues,
  AdventureInput,
  AdventureValues,
} from './adventureTypes'

/** Mirrors the database CHECK constraints and caps (M03.5 plan §2.1, D8). */
export const adventureLimits = {
  title: 120,
  description: 4000,
  nextStep: 280,
  reference: 280,
  objective: 200,
  update: 2000,
  objectivesPerAdventure: 50,
  updatesPerAdventure: 500,
  perCreator: 200,
  /** Counters appear this close to a text limit. */
  counterWithin: 200,
} as const

// Single-line fields refuse every control character, line breaks included.
// eslint-disable-next-line no-control-regex
const lineControls = /[\u0000-\u001f\u007f-\u009f]/
// Multi-line fields allow newlines and tabs only.
// eslint-disable-next-line no-control-regex
const textControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

export type AdventureErrors = Partial<
  Record<'title' | 'description' | 'nextStep' | 'reference' | 'character', string>
>

const messages = {
  title: 'Enter a title of up to 120 characters on one line.',
  description: 'The description can be up to 4,000 characters.',
  nextStep: 'The next step can be up to 280 characters on one line.',
  reference: 'The reference can be up to 280 characters on one line.',
  character: 'Choose one of your characters in this campaign.',
  objective: 'Enter an objective of up to 200 characters on one line.',
  update: 'Enter an update of up to 2,000 characters.',
}

/** Line endings are stored as `\n`, so the count and the checks see what the database will. */
export function normalizeLineEndings(text: string) {
  return text.replace(/\r\n?/g, '\n')
}

function validLine(text: string, max: number, min = 0) {
  const value = text.trim()
  return value.length >= min && value.length <= max && !lineControls.test(value)
}

function validText(text: string, max: number) {
  const value = normalizeLineEndings(text)
  return value.length <= max && !textControls.test(value)
}

/** Per-field errors for the details form; an empty object means valid. */
export function validateAdventureInput(
  input: Pick<AdventureInput, 'title' | 'description' | 'nextStep' | 'reference'>,
): AdventureErrors {
  const errors: AdventureErrors = {}
  if (!validLine(input.title, adventureLimits.title, 1)) errors.title = messages.title
  if (!validText(input.description, adventureLimits.description)) {
    errors.description = messages.description
  }
  if (!validLine(input.nextStep, adventureLimits.nextStep)) errors.nextStep = messages.nextStep
  if (!validLine(input.reference, adventureLimits.reference)) errors.reference = messages.reference
  return errors
}

/** Per-field errors for the create form. Personal and side adventures need one of your characters. */
export function validateAdventureCreateInput(input: AdventureCreateInput): AdventureErrors {
  const errors: AdventureErrors = {}
  if (!validLine(input.title, adventureLimits.title, 1)) errors.title = messages.title
  if (!validLine(input.nextStep, adventureLimits.nextStep)) errors.nextStep = messages.nextStep
  if (input.type !== 'main' && !input.characterId) errors.character = messages.character
  return errors
}

/** An error message for an objective title, or null when it is valid. */
export function validateObjectiveTitle(title: string): string | null {
  return validLine(title, adventureLimits.objective, 1) ? null : messages.objective
}

/** An error message for an update, or null when it is valid. */
export function validateUpdateBody(body: string): string | null {
  const text = normalizeLineEndings(body).trim()
  return text.length >= 1 && validText(text, adventureLimits.update) ? null : messages.update
}

/** The characters left before a limit once the count is close to it, else null. */
export function charactersLeft(text: string, max: number) {
  const left = max - normalizeLineEndings(text).length
  return left <= adventureLimits.counterWithin ? left : null
}

/** Trims single-line fields and normalizes line endings. An empty description is stored as ''. */
export function normalizeAdventureInput(input: AdventureInput): AdventureValues {
  return {
    title: input.title.trim(),
    type: input.type,
    description: normalizeLineEndings(input.description),
    next_step: input.nextStep.trim(),
    reference: input.reference.trim(),
  }
}

/** A main adventure never carries a character. */
export function normalizeAdventureCreateInput(input: AdventureCreateInput): AdventureCreateValues {
  return {
    type: input.type,
    title: input.title.trim(),
    character_id: input.type === 'main' ? null : input.characterId,
    next_step: input.nextStep.trim(),
  }
}

export function normalizeUpdateBody(body: string) {
  return normalizeLineEndings(body).trim()
}
