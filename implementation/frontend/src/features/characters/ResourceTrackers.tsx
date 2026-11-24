import { useQuery } from '@tanstack/react-query'
import { characterResourcesOptions } from './characterQueries'
import type { CharacterResource, ResetRule } from './characterTypes'
import { groupResources, resourceLabel } from './resourceRules'
import type { ResourceActions } from './useResourceActions'

type ResourceTrackersProps = {
  characterId: string
  userId: string
  /** Without it the trackers are display only (another member's sheet). */
  live?: Pick<ResourceActions, 'adjustResource'>
}

const resetCopy: Record<ResetRule, string> = {
  short: 'Short rest',
  long: 'Long rest',
  none: 'Manual',
}

/** Above this many, a tracker shows a counter instead of one pip each. */
const pipLimit = 10

/** One tracker: a pip per use (tap a full pip to spend, an empty one to restore), or a counter. */
function TrackerRow({
  resource,
  onAdjust,
}: {
  resource: CharacterResource
  onAdjust?: (delta: number) => void
}) {
  const label = resourceLabel(resource)
  const summary = `${label}, ${resource.current} of ${resource.maximum} left`

  return (
    <li className="tracker" data-empty={resource.current === 0 ? '' : undefined}>
      <div className="tracker__head">
        <span className="tracker__name">{label}</span>
        <span className="tracker__reset">{resetCopy[resource.reset]}</span>
      </div>
      {resource.maximum <= pipLimit ? (
        <div aria-label={summary} className="tracker__pips" role="group">
          {Array.from({ length: resource.maximum }, (_, index) => {
            const filled = index < resource.current
            return onAdjust ? (
              <button
                aria-label={filled ? `Use one ${label}` : `Restore one ${label}`}
                aria-pressed={filled}
                className="tracker__pip"
                key={index}
                onClick={() => onAdjust(filled ? -1 : 1)}
                type="button"
              />
            ) : (
              <span
                aria-hidden="true"
                className="tracker__pip"
                data-on={filled || undefined}
                key={index}
              />
            )
          })}
          {resource.maximum === 0 && <span className="tracker__none">None</span>}
          {!onAdjust && <span className="visually-hidden">{summary}</span>}
        </div>
      ) : (
        <div aria-label={summary} className="tracker__counter" role="group">
          {onAdjust && (
            <button
              aria-label={`Use one ${label}`}
              className="journal-button journal-button--secondary tracker__step"
              disabled={resource.current === 0}
              onClick={() => onAdjust(-1)}
              type="button"
            >
              −
            </button>
          )}
          <span className="tracker__count">
            <strong>{resource.current}</strong> / {resource.maximum}
          </span>
          {onAdjust && (
            <button
              aria-label={`Restore one ${label}`}
              className="journal-button journal-button--secondary tracker__step"
              disabled={resource.current >= resource.maximum}
              onClick={() => onAdjust(1)}
              type="button"
            >
              +
            </button>
          )}
        </div>
      )}
    </li>
  )
}

/** Spell slots, hit dice, and class or homebrew trackers, grouped and collapsible (M04 L4). */
export function ResourceTrackers({ characterId, userId, live }: ResourceTrackersProps) {
  const query = useQuery(characterResourcesOptions(characterId, userId))

  if (query.isPending) {
    return (
      <p className="journal-status" role="status">
        Loading trackers…
      </p>
    )
  }
  if (query.isError) {
    return (
      <div className="journal-status journal-status--error" role="alert">
        <p>The trackers could not be loaded.</p>
        <button
          className="journal-button journal-button--secondary"
          onClick={() => query.refetch()}
          type="button"
        >
          Try again
        </button>
      </div>
    )
  }

  const groups = groupResources(query.data)
  const sections = [
    ['Spell slots', groups.spellSlots],
    ['Hit dice', groups.hitDice],
    ['Features', groups.features],
  ] as const

  if (query.data.length === 0) {
    // Another member has nothing to see; the owner learns where trackers come from.
    return live ? (
      <p className="trackers__empty">
        No trackers yet. Add spell slots, hit dice, and class features in Edit character.
      </p>
    ) : null
  }

  return (
    <div className="trackers">
      {sections.map(([title, rows]) =>
        rows.length > 0 ? (
          <details className="trackers__group" key={title} open>
            <summary>{title}</summary>
            <ul>
              {rows.map((row) => (
                <TrackerRow
                  key={row.id}
                  onAdjust={
                    live
                      ? (delta) => void live.adjustResource(characterId, row.id, delta)
                      : undefined
                  }
                  resource={row}
                />
              ))}
            </ul>
          </details>
        ) : null,
      )}
    </div>
  )
}
