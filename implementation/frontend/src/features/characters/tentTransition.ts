import { flushSync } from 'react-dom'
import type { TentView } from './CharacterTent'

/** Which way the journal's page turns: deeper into a character, or back toward the list. */
export type TentDirection = 'forward' | 'back'

const depth: Record<TentView['type'], number> = {
  home: 0,
  list: 0,
  create: 1,
  character: 1,
  edit: 2,
}

export function tentDirection(from: TentView, to: TentView): TentDirection {
  return depth[to.type] < depth[from.type] ? 'back' : 'forward'
}

export function sameTentView(a: TentView, b: TentView) {
  if (a.type !== b.type) return false
  return 'id' in a && 'id' in b ? a.id === b.id : true
}

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<unknown> }
}

let running: object | null = null

/**
 * Applies a screen change as a page turn: the journal page slides out and the next one
 * slides in, and the cover morphs when the journal changes width. The direction is set on
 * the root for the CSS in characters.css. Where the browser has no View Transitions, the
 * change applies at once and the screen's own entrance animation plays instead.
 */
export function turnPage(direction: TentDirection, update: () => void) {
  const doc = document as TransitionDocument
  if (typeof doc.startViewTransition !== 'function') {
    update()
    return
  }
  const root = document.documentElement
  const token = {}
  running = token
  root.dataset.tentTurn = direction
  const transition = doc.startViewTransition(() => flushSync(update))
  // A newer turn replaces this one, so only the latest clears the direction.
  const clear = () => {
    if (running !== token) return
    running = null
    delete root.dataset.tentTurn
  }
  transition.finished.then(clear, clear)
}
