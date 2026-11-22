import type { Json } from '../../types/database'
import type { DetailField, HandoffChange } from './handoffDocument'

/**
 * From the reviewed changes to the RPC payloads (M03.9 §3.3). Only changes the player selected
 * are sent, and only changes that are valid and actually change something can be selected.
 */

export type HandoffMode = 'attach' | 'new'

/** The `p_changes` the RPCs take. Database-shaped; every key is optional. */
export type HandoffRpcChanges = {
  details?: Partial<Record<DetailField, string>>
  objectives?: {
    add?: string[]
    update?: { id: string; title?: string; done?: boolean }[]
  }
  update?: string
}

/** The versions the review was built from. Strings exactly as the database returned them. */
export type HandoffVersions = {
  adventureUpdatedAt: string
  /** `updated_at` of every objective, keyed by id. */
  objectiveUpdatedAt: Record<string, string>
}

export type HandoffExpected = {
  adventure_updated_at: string
  objectives: Record<string, string>
}

export type HandoffRequest =
  | {
      ok: true
      changes: HandoffRpcChanges & Json
      expected: HandoffExpected | Record<string, never>
      count: number
    }
  | { ok: false; reason: string }

/** A change can be selected when it is valid and changes something. */
export const isSelectable = (change: HandoffChange) => change.state === 'ok'

/**
 * H6 and H7. Attaching starts with nothing selected. A new adventure starts with every
 * selectable proposal selected, except the status (it stays Pending unless the player picks
 * one). Suggested completions are never preselected.
 */
export function defaultSelection(changes: HandoffChange[], mode: HandoffMode): Set<string> {
  if (mode === 'attach') return new Set()
  return new Set(
    changes
      .filter(
        (change) => isSelectable(change) && !change.suggestsCompletion && change.field !== 'status',
      )
      .map((change) => change.key),
  )
}

/** The selected changes that can really be sent, in review order. */
export function selectedChanges(changes: HandoffChange[], selected: ReadonlySet<string>) {
  return changes.filter((change) => selected.has(change.key) && isSelectable(change))
}

function toRpcChanges(chosen: HandoffChange[]): HandoffRpcChanges {
  const result: HandoffRpcChanges = {}
  const details: Partial<Record<DetailField, string>> = {}
  const add: string[] = []
  const update: { id: string; title?: string; done?: boolean }[] = []
  const operations = new Map<string, { id: string; title?: string; done?: boolean }>()

  for (const change of chosen) {
    if (change.kind === 'detail' && change.field) {
      details[change.field] = change.proposed
    } else if (change.kind === 'objective-add') {
      add.push(change.proposed)
    } else if (change.kind === 'update') {
      result.update = change.proposed
    } else if (change.objectiveId) {
      // One operation per objective, in the order the document gave them.
      let operation = operations.get(change.objectiveId)
      if (!operation) {
        operation = { id: change.objectiveId }
        operations.set(change.objectiveId, operation)
        update.push(operation)
      }
      if (change.kind === 'objective-rename') operation.title = change.proposed
      if (change.kind === 'objective-complete') operation.done = true
      if (change.kind === 'objective-reopen') operation.done = false
    }
  }

  if (Object.keys(details).length > 0) result.details = details
  if (add.length > 0 || update.length > 0) {
    result.objectives = {
      ...(add.length > 0 ? { add } : {}),
      ...(update.length > 0 ? { update } : {}),
    }
  }
  return result
}

/**
 * The arguments for `attach_adventure_handoff`. With nothing selected this is a source-only
 * attach: empty changes and no expected versions, which the database accepts.
 */
export function buildAttachRequest(
  changes: HandoffChange[],
  selected: ReadonlySet<string>,
  versions: HandoffVersions,
): HandoffRequest {
  const chosen = selectedChanges(changes, selected)
  if (chosen.length === 0) return { ok: true, changes: {}, expected: {}, count: 0 }

  const rpc = toRpcChanges(chosen)
  const targets = (rpc.objectives?.update ?? []).map((operation) => operation.id)
  const objectives: Record<string, string> = {}
  for (const id of targets) {
    const stamp = versions.objectiveUpdatedAt[id]
    if (!stamp)
      return { ok: false, reason: 'An objective in this handoff is no longer on the adventure.' }
    objectives[id] = stamp
  }
  return {
    ok: true,
    changes: rpc as HandoffRpcChanges & Json,
    expected: { adventure_updated_at: versions.adventureUpdatedAt, objectives },
    count: chosen.length,
  }
}

/**
 * The `p_changes` for `create_adventure_from_handoff`. A title is required, so the selection
 * must include one. `status` is the player's own choice (H6): an explicit `status` wins, then a
 * selected status change, else the adventure stays Pending.
 */
export function buildNewRequest(
  changes: HandoffChange[],
  selected: ReadonlySet<string>,
  status?: string,
): HandoffRequest {
  const all = selectedChanges(changes, selected)
  const chosen = all.filter((change) => change.field !== 'status')
  const effective = status ?? all.find((change) => change.field === 'status')?.proposed
  const rpc = toRpcChanges(chosen)
  if (!rpc.details?.title) return { ok: false, reason: 'A new adventure needs a title.' }
  const hasStatus = effective !== undefined && effective !== 'pending'
  if (hasStatus) rpc.details.status = effective
  return {
    ok: true,
    changes: rpc as HandoffRpcChanges & Json,
    expected: {},
    count: chosen.length + (hasStatus ? 1 : 0),
  }
}

/** How many of the selectable changes the handoff suggests completing (H7), for the review. */
export const completionSuggestions = (changes: HandoffChange[]) =>
  changes.filter((change) => change.suggestsCompletion && isSelectable(change))
