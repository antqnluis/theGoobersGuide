import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { DeviceIcon, LockIcon, StarIcon, WarnIcon } from './DiceIcons'
import { DieGlyph } from './DieGlyph'
import { countUp, freshMs, motionAvailable, playRollMotion, type RollMotion } from './diceMotion'
import {
  faceMark,
  isConstantOnly,
  isLocalRoll,
  naturalOutcome,
  rollTitle,
  type DiceRollRecord,
} from './diceRules'

/** Every face of a roll, in term order: dice as tiles, constants as numbers. Dropped dice are struck through. */
export function RollBreakdown({
  roll,
  tumble = false,
}: {
  roll: DiceRollRecord
  tumble?: boolean
}) {
  return (
    <ul aria-label="Dice rolled" className="dice-breakdown">
      {roll.terms.map((term, index) => {
        const operator = term.sign < 0 ? '−' : index === 0 ? '' : '+'
        if (term.kind === 'constant') {
          return (
            <li className="dice-term" key={index}>
              {operator && <span className="dice-term__operator">{operator}</span>}
              <span className="dice-term__constant">{term.value}</span>
            </li>
          )
        }
        return (
          <li className="dice-term" key={index}>
            {operator && <span className="dice-term__operator">{operator}</span>}
            <ul aria-label={`${term.count}d${term.sides}`} className="dice-faces">
              {(roll.dice[index] ?? []).map((face, faceIndex) => {
                const mark = faceMark(term.sides, face.value)
                return (
                  <li
                    className="dice-face"
                    data-dropped={face.kept ? undefined : ''}
                    data-mark={mark ?? undefined}
                    data-sides={tumble ? term.sides : undefined}
                    key={faceIndex}
                    style={{ '--dice-i': faceIndex } as CSSProperties}
                  >
                    {tumble && <DieGlyph sides={term.sides} />}
                    {face.value}
                    {!face.kept && <span className="dice-sr"> dropped</span>}
                    {mark === 'max' && <span className="dice-sr"> natural 20</span>}
                    {mark === 'min' && <span className="dice-sr"> natural 1</span>}
                  </li>
                )
              })}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}

/** Where a roll lives: only you, or only this device. Icon and words, never colour alone. */
export function RollScope({ roll }: { roll: DiceRollRecord }) {
  if (isLocalRoll(roll)) {
    return (
      <span className="dice-chip" data-tone="device">
        <DeviceIcon size={14} />
        Not saved
      </span>
    )
  }
  if (roll.visibility === 'self') {
    return (
      <span className="dice-chip" data-tone="private">
        <LockIcon size={14} />
        Only you
      </span>
    )
  }
  return null
}

export function NaturalChip({ roll }: { roll: DiceRollRecord }) {
  const natural = naturalOutcome(roll)
  if (!natural) return null
  return (
    <span className="dice-chip" data-tone={natural === 'natural-20' ? 'high' : 'low'}>
      <StarIcon size={14} />
      {natural === 'natural-20' ? 'Natural 20' : 'Natural 1'}
    </span>
  )
}

/** The latest roll, large: its title, who made it, the faces, and the total. */
export function DiceResult({
  roll,
  pendingTitle,
  rollerName,
  characterName,
  onCritical,
  resultAt = 0,
}: {
  roll: DiceRollRecord | null
  /** Set while a roll is in flight: dice shaken in the hand, no numbers. */
  pendingTitle: string | null
  /** When the roll arrived (ms since epoch): a fresh one is thrown onto the plate. */
  resultAt?: number
  rollerName: string
  characterName: string | null
  /** Offered after a natural 20 on an attack (D9). */
  onCritical?: () => void
}) {
  if (pendingTitle) {
    return (
      <div aria-busy="true" className="dice-result" data-state="pending">
        <p className="dice-result__title">{pendingTitle}</p>
        <div aria-hidden="true" className="dice-result__resting">
          <DieGlyph className="dice-rattle" sides={6} />
          <DieGlyph className="dice-rattle" sides={20} />
          <DieGlyph className="dice-rattle" sides={8} />
        </div>
        <p className="dice-result__note">Rolling…</p>
      </div>
    )
  }

  if (!roll) {
    return (
      <div className="dice-result" data-state="empty">
        <p className="dice-result__title">Nothing rolled yet</p>
        <p className="dice-result__note">Pick a die below, or type a roll like 2d6 + 3.</p>
      </div>
    )
  }

  return (
    <RolledResult
      characterName={characterName}
      key={roll.id}
      onCritical={onCritical}
      resultAt={resultAt}
      roll={roll}
      rollerName={rollerName}
    />
  )
}

/**
 * A roll on the plate. One that has just arrived is thrown (see `diceMotion`); one the tray finds
 * already waiting, or any roll under reduced motion, simply rests.
 */
function RolledResult({
  roll,
  resultAt,
  rollerName,
  characterName,
  onCritical,
}: {
  roll: DiceRollRecord
  resultAt: number
  rollerName: string
  characterName: string | null
  onCritical?: () => void
}) {
  const plateRef = useRef<HTMLDivElement>(null)
  const motion = useRef<RollMotion | null>(null)
  const [tumble] = useState(() => Date.now() - resultAt < freshMs && motionAvailable())
  const natural = naturalOutcome(roll)

  // Before paint, so the real numbers never flash ahead of the throw.
  useLayoutEffect(() => {
    const plate = plateRef.current
    if (!tumble || !plate) return
    motion.current = playRollMotion(plate)
    return () => {
      motion.current?.cancel()
      motion.current = null
    }
  }, [tumble])

  return (
    <div
      className="dice-result"
      data-natural={natural ?? undefined}
      data-state="rolled"
      onPointerDown={() => motion.current?.skip()}
      ref={plateRef}
    >
      <div className="dice-result__head">
        <p className="dice-result__title">{rollTitle(roll)}</p>
        <p className="dice-result__who">
          {rollerName}
          {characterName ? ` as ${characterName}` : ''}
          {roll.label ? (
            <span className="dice-result__expression"> · {roll.expression}</span>
          ) : null}
        </p>
      </div>
      <div className="dice-result__body">
        <RollBreakdown roll={roll} tumble={tumble} />
        <p className="dice-result__total" data-value={roll.total}>
          <span className="dice-sr">Total </span>
          {roll.total}
        </p>
      </div>
      <div className="dice-result__marks">
        <NaturalChip roll={roll} />
        <RollScope roll={roll} />
        {isConstantOnly(roll) && <span className="dice-chip">No dice</span>}
      </div>
      {onCritical && natural === 'natural-20' && (
        <button className="dice-button-secondary" onClick={onCritical} type="button">
          Roll critical damage
        </button>
      )}
    </div>
  )
}

/** A number that counts up to `value` when it appears: the peek's total. */
export function CountingTotal({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !motionAvailable()) return
    return countUp(el, value, 640)
  }, [value])
  return (
    <span className={className} ref={ref}>
      {value}
    </span>
  )
}

export function DiceFailureNotice({
  message,
  canRollLocally,
  onRetry,
  onRollLocally,
  onDismiss,
}: {
  message: string
  canRollLocally: boolean
  onRetry: () => void
  onRollLocally: () => void
  onDismiss: () => void
}) {
  return (
    <div className="dice-failure" role="alert">
      <p className="dice-failure__message">
        <WarnIcon size={16} />
        <span>
          {message}
          {canRollLocally ? ' Roll on this device instead? It won’t be saved or shared.' : ''}
        </span>
      </p>
      <div className="dice-failure__actions">
        <button className="dice-button-secondary" onClick={onRetry} type="button">
          Retry
        </button>
        {canRollLocally && (
          <button className="dice-button-secondary" onClick={onRollLocally} type="button">
            Roll on this device
          </button>
        )}
        <button className="dice-button-ghost" onClick={onDismiss} type="button">
          Dismiss
        </button>
      </div>
    </div>
  )
}
