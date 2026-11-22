import {
  checkEnvelope,
  documentFormats,
  handoffDocumentVersion,
  isRecord,
  readJsonDocument,
  regenerateHandoffMessage,
} from '../characters/importText'
import { adventureStatuses, type AdventureDetail, type AdventureStatus } from './adventureTypes'
import {
  adventureLimits,
  normalizeLineEndings,
  normalizeUpdateBody,
  validateAdventureField,
  validateObjectiveTitle,
  validateUpdateBody,
} from './adventureValidation'

/**
 * The handoff proposal document, version 1 (M03.9 §2.1): parsing it against the adventure as it
 * is now and turning it into a list of reviewable changes. Nothing here saves anything.
 *
 * Only structural failures block a document (H8). A single bad value disables its own change,
 * and the assistant's doubts (`issues`) are shown as notes.
 */

/** The adventure values a proposal is compared with. A new adventure starts from `blankTarget`. */
export type HandoffTarget = {
  title: string
  type: string
  status: AdventureStatus
  next_step: string
  reference: string
  description: string
  objectives: { id: string; title: string; done: boolean }[]
}

export const blankTarget = (type = 'side'): HandoffTarget => ({
  title: '',
  type,
  status: 'pending',
  next_step: '',
  reference: '',
  description: '',
  objectives: [],
})

export function handoffTargetFrom(
  adventure: Pick<
    AdventureDetail,
    'title' | 'type' | 'status' | 'next_step' | 'reference' | 'description' | 'objectives'
  >,
): HandoffTarget {
  return {
    title: adventure.title,
    type: adventure.type,
    status: adventure.status,
    next_step: adventure.next_step,
    reference: adventure.reference,
    description: adventure.description,
    objectives: adventure.objectives.map(({ id, title, done }) => ({ id, title, done })),
  }
}

export const detailFields = ['title', 'status', 'next_step', 'reference', 'description'] as const
export type DetailField = (typeof detailFields)[number]

export const detailLabels: Record<DetailField, string> = {
  title: 'Title',
  status: 'Status',
  next_step: 'Next step',
  reference: 'Reference',
  description: 'Description',
}

export type HandoffChangeKind =
  | 'detail'
  | 'objective-add'
  | 'objective-rename'
  | 'objective-complete'
  | 'objective-reopen'
  | 'update'

/** `unchanged` is shown as "No change" and cannot be selected; `invalid` explains itself. */
export type HandoffChangeState = 'ok' | 'unchanged' | 'invalid'

export type HandoffChange = {
  /** Stable within one parse; the selection is a set of keys. */
  key: string
  kind: HandoffChangeKind
  label: string
  /** The current value as text, or null when there is none (an added objective, an update). */
  current: string | null
  /** The proposed value as text (the normalized value when it is valid). */
  proposed: string
  state: HandoffChangeState
  problem?: string
  /** H7: "The handoff suggests this. Only you decide it's done." Never preselected. */
  suggestsCompletion: boolean
  field?: DetailField
  objectiveId?: string
  /** The objective's current title, for complete, reopen, and rename. */
  objectiveTitle?: string
}

export type HandoffParseResult =
  | { kind: 'rejected'; message: string }
  | {
      kind: 'parsed'
      changes: HandoffChange[]
      /** The assistant's doubts (`issues`), shown at the top of the review. */
      notes: string[]
      /** Keys the format does not have, listed under "Not imported". */
      ignored: string[]
    }

export const maxObjectiveOps = adventureLimits.objectivesPerAdventure
const maxNotes = 20
const maxNoteLength = 500

const differentVersion =
  'This handoff was made for a different version of the adventure. Copy the prompt again.'

type Rec = Record<string, unknown>

const rejected = (message: string): HandoffParseResult => ({ kind: 'rejected', message })

const fieldProblems: Record<DetailField, string> = {
  title: 'Enter a title of up to 120 characters on one line.',
  status: 'The status must be Pending, In progress, On hold, or Completed.',
  next_step: 'The next step can be up to 280 characters on one line.',
  reference: 'The reference can be up to 280 characters on one line.',
  description: 'The description can be up to 4,000 characters.',
}

function detailChange(field: DetailField, raw: unknown, target: HandoffTarget): HandoffChange {
  const current = target[field]
  const base = {
    key: `detail:${field}`,
    kind: 'detail' as const,
    label: detailLabels[field],
    current,
    field,
  }
  const invalid = (problem: string, proposed = ''): HandoffChange => ({
    ...base,
    proposed,
    state: 'invalid',
    problem,
    suggestsCompletion: false,
  })
  if (typeof raw !== 'string') {
    return invalid(
      raw === null
        ? 'Leave a field out, or use an empty text, to propose clearing it.'
        : `${base.label} must be text.`,
      typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : '',
    )
  }

  if (field === 'status') {
    const status = raw.trim()
    if (!(adventureStatuses as readonly string[]).includes(status)) {
      return invalid(fieldProblems.status, raw)
    }
    return {
      ...base,
      proposed: status,
      state: status === current ? 'unchanged' : 'ok',
      suggestsCompletion: status === 'completed' && current !== 'completed',
    }
  }

  const value = field === 'description' ? normalizeLineEndings(raw) : raw.trim()
  const formField = field === 'next_step' ? 'nextStep' : field
  if (validateAdventureField(formField, value) !== null) {
    return invalid(fieldProblems[field], value)
  }
  return {
    ...base,
    proposed: value,
    state: value === current ? 'unchanged' : 'ok',
    suggestsCompletion: false,
  }
}

/** Reads a handoff proposal from pasted or uploaded text and compares it with `target`. */
export function parseHandoff(text: string, target: HandoffTarget): HandoffParseResult {
  const read = readJsonDocument(text)
  if (!read.ok) return rejected(read.message)
  const refusal = checkEnvelope(
    read.value,
    { format: documentFormats.handoff, version: handoffDocumentVersion },
    regenerateHandoffMessage,
  )
  if (refusal) return rejected(refusal)

  const root = read.value as Rec
  if (!isRecord(root.proposal)) return rejected('The handoff has no proposal section.')
  const proposal = root.proposal

  const ignored: string[] = []
  for (const key of Object.keys(root)) {
    if (!['format', 'version', 'proposal', 'issues'].includes(key)) ignored.push(key)
  }
  for (const key of Object.keys(proposal)) {
    if (![...detailFields, 'objectives', 'update'].includes(key)) ignored.push(`proposal.${key}`)
  }

  let notes: string[] = []
  if (root.issues !== undefined) {
    if (Array.isArray(root.issues) && root.issues.every((issue) => typeof issue === 'string')) {
      notes = (root.issues as string[])
        .map((issue) => issue.trim().slice(0, maxNoteLength))
        .filter((issue) => issue !== '')
        .slice(0, maxNotes)
    } else {
      ignored.push('issues')
    }
  }

  const changes: HandoffChange[] = []

  for (const field of detailFields) {
    if (proposal[field] !== undefined) changes.push(detailChange(field, proposal[field], target))
  }

  if (proposal.objectives !== undefined) {
    if (!Array.isArray(proposal.objectives)) {
      return rejected(
        '“proposal.objectives” must be a list. Generate it again with the current prompt.',
      )
    }
    if (proposal.objectives.length > maxObjectiveOps) {
      return rejected(
        `The handoff changes more than ${maxObjectiveOps} objectives. Import it one thread at a time.`,
      )
    }

    const known = new Map(target.objectives.map((objective) => [objective.id, objective]))
    const seen = new Set<string>()
    let capacity = adventureLimits.objectivesPerAdventure - target.objectives.length

    for (const [index, entry] of proposal.objectives.entries()) {
      const where = `proposal.objectives[${index}]`
      if (!isRecord(entry)) {
        return rejected(`“${where}” must be an object. Generate it again with the current prompt.`)
      }
      const allowed =
        entry.op === 'add'
          ? ['op', 'title']
          : entry.op === 'rename'
            ? ['op', 'id', 'title']
            : ['op', 'id']
      for (const key of Object.keys(entry)) {
        if (!allowed.includes(key)) ignored.push(`${where}.${key}`)
      }

      if (entry.op === 'add') {
        const title = typeof entry.title === 'string' ? entry.title.trim() : null
        const problem =
          title === null ? 'The objective needs a title.' : validateObjectiveTitle(title)
        const overCapacity = problem === null && capacity <= 0
        if (problem === null) capacity -= 1
        changes.push({
          key: `objective:add:${index}`,
          kind: 'objective-add',
          label: 'New objective',
          current: null,
          proposed: title ?? '',
          state: problem !== null || overCapacity ? 'invalid' : 'ok',
          problem: overCapacity
            ? `An adventure can have ${adventureLimits.objectivesPerAdventure} objectives.`
            : (problem ?? undefined),
          suggestsCompletion: false,
        })
        continue
      }

      if (entry.op !== 'complete' && entry.op !== 'reopen' && entry.op !== 'rename') {
        return rejected(
          `“${where}.op” must be add, complete, reopen, or rename. Generate it again with the current prompt.`,
        )
      }
      if (typeof entry.id !== 'string') {
        return rejected(
          `“${where}.id” must be an objective id. Generate it again with the current prompt.`,
        )
      }
      const objective = known.get(entry.id)
      if (!objective) return rejected(differentVersion)
      if (seen.has(entry.id)) {
        return rejected(
          'The handoff changes the same objective twice. Generate it again with the current prompt.',
        )
      }
      seen.add(entry.id)

      const base = {
        current: objective.title,
        objectiveId: objective.id,
        objectiveTitle: objective.title,
      }
      if (entry.op === 'rename') {
        const title = typeof entry.title === 'string' ? entry.title.trim() : null
        const problem =
          title === null ? 'The objective needs a title.' : validateObjectiveTitle(title)
        changes.push({
          ...base,
          key: `objective:rename:${objective.id}`,
          kind: 'objective-rename',
          label: 'Rename objective',
          proposed: title ?? '',
          state: problem !== null ? 'invalid' : title === objective.title ? 'unchanged' : 'ok',
          problem: problem ?? undefined,
          suggestsCompletion: false,
        })
      } else if (entry.op === 'complete') {
        changes.push({
          ...base,
          key: `objective:complete:${objective.id}`,
          kind: 'objective-complete',
          label: 'Complete objective',
          current: 'Not done',
          proposed: 'Done',
          state: objective.done ? 'unchanged' : 'ok',
          suggestsCompletion: !objective.done,
        })
      } else {
        changes.push({
          ...base,
          key: `objective:reopen:${objective.id}`,
          kind: 'objective-reopen',
          label: 'Reopen objective',
          current: 'Done',
          proposed: 'Not done',
          state: objective.done ? 'ok' : 'unchanged',
          suggestsCompletion: false,
        })
      }
    }
  }

  if (proposal.update !== undefined) {
    if (typeof proposal.update !== 'string') {
      changes.push({
        key: 'update',
        kind: 'update',
        label: 'Progress update',
        current: null,
        proposed: '',
        state: 'invalid',
        problem: 'The update must be text.',
        suggestsCompletion: false,
      })
    } else if (proposal.update.trim() !== '') {
      const body = normalizeUpdateBody(proposal.update)
      const problem = validateUpdateBody(body)
      changes.push({
        key: 'update',
        kind: 'update',
        label: 'Progress update',
        current: null,
        proposed: body,
        state: problem ? 'invalid' : 'ok',
        problem: problem ?? undefined,
        suggestsCompletion: false,
      })
    }
  }

  return { kind: 'parsed', changes, notes, ignored }
}
