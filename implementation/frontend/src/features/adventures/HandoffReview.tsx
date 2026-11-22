import { useId } from 'react'
import { adventureStatusLabels } from './adventureRules'
import type { AdventureStatus } from './adventureTypes'
import { isSelectable } from './handoffChanges'
import type { HandoffChange } from './handoffDocument'

const sections: readonly (readonly [string, string, (change: HandoffChange) => boolean])[] = [
  ['details', 'Details', (change) => change.kind === 'detail'],
  ['objectives', 'Objectives', (change) => change.kind.startsWith('objective')],
  ['update', 'Progress update', (change) => change.kind === 'update'],
]

/** How a value reads in the review: statuses by name, an empty value as such. */
function display(change: HandoffChange, value: string | null) {
  if (value === null) return null
  if (change.field === 'status') return adventureStatusLabels[value as AdventureStatus] ?? value
  return value === '' ? '(empty)' : value
}

/**
 * The review (M03.9 §5.1): each proposed change against the current value, with a checkbox.
 * Unchanged and invalid changes cannot be selected. Suggested completions say whose decision
 * they are (H7). Notes from the assistant come first; keys the format lacks are listed last.
 */
export function HandoffReview({
  changes,
  disabled,
  ignored,
  notes,
  onSelect,
  selected,
}: {
  changes: HandoffChange[]
  disabled: boolean
  ignored: string[]
  notes: string[]
  onSelect: (selected: ReadonlySet<string>) => void
  selected: ReadonlySet<string>
}) {
  const selectable = changes.filter(isSelectable)
  const chosen = selectable.filter((change) => selected.has(change.key))
  const cannot = changes.filter((change) => change.state === 'invalid').length

  function toggle(change: HandoffChange) {
    if (disabled || !isSelectable(change)) return
    const next = new Set(selected)
    if (next.has(change.key)) next.delete(change.key)
    else next.add(change.key)
    onSelect(next)
  }

  return (
    <section aria-label="Review" className="handoff-review">
      {notes.length > 0 && (
        <div className="handoff-review__notes" role="note">
          <p>
            <strong>The assistant flagged these. Check them against the handoff.</strong>
          </p>
          <ul>
            {notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {changes.length === 0 ? (
        <p className="handoff-review__summary" role="status">
          This handoff proposes nothing. You can still keep it as a source.
        </p>
      ) : (
        <>
          <div className="handoff-review__bar">
            <p className="handoff-review__summary" role="status">
              {chosen.length} of {changes.length} {changes.length === 1 ? 'change' : 'changes'}{' '}
              selected.
              {cannot > 0 && ` ${cannot} can’t be applied.`}
            </p>
            <div className="handoff-review__bulk">
              <button
                className="journal-button journal-button--secondary"
                disabled={
                  disabled || selectable.length === 0 || chosen.length === selectable.length
                }
                onClick={() => onSelect(new Set(selectable.map((change) => change.key)))}
                type="button"
              >
                Select all valid
              </button>
              <button
                className="journal-button journal-button--secondary"
                disabled={disabled || chosen.length === 0}
                onClick={() => onSelect(new Set())}
                type="button"
              >
                Clear selection
              </button>
            </div>
          </div>
          {sections.map(([id, title, belongs]) => {
            const inSection = changes.filter(belongs)
            if (inSection.length === 0) return null
            return (
              <fieldset className="handoff-review__section" key={id}>
                <legend>{title}</legend>
                <ul className="handoff-review__list">
                  {inSection.map((change) => (
                    <ChangeRow
                      change={change}
                      checked={selected.has(change.key)}
                      disabled={disabled}
                      key={change.key}
                      onToggle={() => toggle(change)}
                    />
                  ))}
                </ul>
              </fieldset>
            )
          })}
        </>
      )}

      {ignored.length > 0 && (
        <details className="handoff-review__ignored">
          <summary>Not imported ({ignored.length})</summary>
          <p>These parts aren’t part of the format, so they were left out.</p>
          <ul>
            {ignored.map((path) => (
              <li key={path}>
                <code>{path}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function ChangeRow({
  change,
  checked,
  disabled,
  onToggle,
}: {
  change: HandoffChange
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const id = useId()
  const noteId = `${id}-note`
  const current = display(change, change.current)
  const proposed = display(change, change.proposed)
  const locked = change.state !== 'ok'
  // The visible label starts the accessible name, which also says the proposed value.
  const visibleLabel =
    change.objectiveTitle && change.kind !== 'objective-rename'
      ? `${change.label}: ${change.objectiveTitle}`
      : change.label
  const accessibleName =
    change.kind === 'objective-rename' || change.kind === 'objective-add' || change.field
      ? `${change.label}: ${proposed}`
      : visibleLabel
  const note =
    change.state === 'invalid'
      ? change.problem
      : change.state === 'unchanged'
        ? 'No change'
        : change.suggestsCompletion
          ? 'The handoff suggests this. Only you decide it’s done.'
          : null

  return (
    <li className="handoff-review__change" data-state={change.state}>
      <input
        aria-describedby={note ? noteId : `${id}-values`}
        aria-label={accessibleName}
        checked={checked && !locked}
        disabled={disabled || locked}
        id={id}
        onChange={onToggle}
        type="checkbox"
      />
      <label htmlFor={id}>{visibleLabel}</label>
      <p className="handoff-review__values" id={`${id}-values`}>
        {current !== null && change.kind !== 'objective-add' && change.kind !== 'update' && (
          <>
            <span className="handoff-review__before">
              <span className="handoff-review__sr">Now: </span>
              {current}
            </span>
            <span aria-hidden="true"> → </span>
            <span className="handoff-review__sr"> becomes: </span>
          </>
        )}
        <span className="handoff-review__after">{proposed}</span>
      </p>
      {note && (
        <p
          className={change.state === 'invalid' ? 'journal-error' : 'handoff-review__note'}
          id={noteId}
        >
          {note}
        </p>
      )}
    </li>
  )
}
