import { useCallback, useState, useSyncExternalStore } from 'react'

/**
 * Which new visions the player has already unsealed (M04 plan W17). A rest brings visions that
 * arrive sealed; breaking a seal reads it. The record lives on this device only, per character
 * and per rest, so a reveal plays once and a reload keeps what was opened. It is a nicety, never
 * authority: the database still says what is new.
 */

const prefix = 'goobers-visions-opened'

const storageKey = (characterId: string, restKey: string) => `${prefix}:${characterId}:${restKey}`

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

function readRaw(characterId: string, restKey: string) {
  try {
    return window.localStorage.getItem(storageKey(characterId, restKey)) ?? ''
  } catch {
    return ''
  }
}

function parseOpened(raw: string): ReadonlySet<string> {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

const readOpened = (characterId: string, restKey: string) =>
  parseOpened(readRaw(characterId, restKey))

function writeOpened(characterId: string, restKey: string, opened: ReadonlySet<string>) {
  try {
    const own = `${prefix}:${characterId}:`
    // An earlier rest's record can never matter again.
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(own) && key !== storageKey(characterId, restKey)) {
        window.localStorage.removeItem(key)
      }
    }
    if (opened.size === 0) window.localStorage.removeItem(storageKey(characterId, restKey))
    else window.localStorage.setItem(storageKey(characterId, restKey), JSON.stringify([...opened]))
  } catch {
    // Private windows and blocked storage just replay the reveal next time.
  }
  notify()
}

/**
 * How many of a character's new visions and fragments are still sealed, for the shrine's glow and
 * the Places count. It follows the same record the list writes, in this tab and in others.
 */
export function useSealedCount(
  characterId: string,
  restKey: string | null,
  newIds: readonly string[],
) {
  const raw = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      window.addEventListener('storage', listener)
      return () => {
        listeners.delete(listener)
        window.removeEventListener('storage', listener)
      }
    },
    () => (restKey && characterId ? readRaw(characterId, restKey) : ''),
  )
  const opened = parseOpened(raw)
  return newIds.filter((id) => !opened.has(id)).length
}

/** True when the visitor asked their system for less motion. */
export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export type SealedReveal = {
  /** New visions and fragments still behind their seal. */
  sealed: ReadonlySet<string>
  /** Opened during this visit, which are the ones that play their entrance. */
  entering: ReadonlySet<string>
  /** Every new id, sealed or not. */
  total: number
  open: (id: string) => void
  openAll: () => void
  /** Seals the new ones again, to watch the reveal once more. */
  replay: () => void
}

/**
 * Sealing state for one character's visions after one rest. Remount it (a `key` of the character
 * and the rest) when either changes, so the record is read fresh.
 */
export function useSealedReveal(
  characterId: string,
  restKey: string | null,
  newIds: readonly string[],
): SealedReveal {
  const [opened, setOpened] = useState<ReadonlySet<string>>(() =>
    restKey ? readOpened(characterId, restKey) : new Set(),
  )
  const [entering, setEntering] = useState<ReadonlySet<string>>(new Set())

  const commit = useCallback(
    (next: ReadonlySet<string>) => {
      setOpened(next)
      if (restKey) writeOpened(characterId, restKey, next)
    },
    [characterId, restKey],
  )

  const sealed = new Set(newIds.filter((id) => !opened.has(id)))

  return {
    sealed,
    entering,
    total: newIds.length,
    open: (id) => {
      commit(new Set([...opened, id]))
      setEntering((current) => new Set([...current, id]))
    },
    openAll: () => {
      commit(new Set([...opened, ...newIds]))
      setEntering((current) => new Set([...current, ...sealed]))
    },
    replay: () => {
      commit(new Set())
      setEntering(new Set())
    },
  }
}
