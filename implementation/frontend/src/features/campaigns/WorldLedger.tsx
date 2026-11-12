import { useCallback, useState, type RefObject } from 'react'
import { Link } from 'react-router'
import type { CampaignListItem } from './campaignTypes'
import { catalogueNumeral } from './orreryLayout'

export const compactViewport = '(max-width: 680px)'

/** More campaigns than this and the ledger offers a filter. */
export const filterThreshold = 8

export type LedgerStatus = 'pending' | 'error' | 'ready'

type WorldLedgerProps = {
  /** Campaigns oldest first, the same order as the orbits. */
  planets: readonly CampaignListItem[]
  status: LedgerStatus
  onRetry: () => void
  notice: string | null
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  selectedId: string | null
  onSelect: (id: string) => void
  canPause: boolean
  paused: boolean
  onTogglePause: () => void
  disclosureRef: RefObject<HTMLButtonElement | null>
  selectedButtonRef: RefObject<HTMLButtonElement | null>
}

/**
 * The index of campaigns, typeset like the contents of a book. It is the main
 * keyboard and screen-reader way to choose a world, and it works without WebGL.
 * Loading, error, and empty states sit outside the collapsible list so a
 * collapsed ledger never hides them.
 */
export function WorldLedger({
  planets,
  status,
  onRetry,
  notice,
  expanded,
  onExpandedChange,
  selectedId,
  onSelect,
  canPause,
  paused,
  onTogglePause,
  disclosureRef,
  selectedButtonRef,
}: WorldLedgerProps) {
  const [filter, setFilter] = useState('')
  const restoreFocusOnPauseRemoval = useCallback(
    (button: HTMLButtonElement | null) => {
      if (!button) return
      return () => {
        if (document.activeElement === button) disclosureRef.current?.focus()
      }
    },
    [disclosureRef],
  )

  const showFilter = planets.length > filterThreshold
  const terms = showFilter ? filter.trim().toLocaleLowerCase() : ''
  const rows = planets
    .map((campaign, index) => ({ campaign, index }))
    .filter(({ campaign }) => !terms || campaign.name.toLocaleLowerCase().includes(terms))

  return (
    <div
      className="galaxy-index galaxy-surface"
      onKeyDown={(event) => {
        // On a phone the list is a drawer, and Escape closes it. Elsewhere Escape
        // belongs to the scene, which returns to the overview.
        if (event.key === 'Escape' && expanded && window.matchMedia?.(compactViewport).matches) {
          event.preventDefault()
          disclosureRef.current?.focus()
          onExpandedChange(false)
        }
      }}
    >
      <h1 id="campaigns-heading">
        <button
          aria-controls="galaxy-campaign-list"
          aria-expanded={expanded}
          className="galaxy-disclosure"
          onClick={() => onExpandedChange(!expanded)}
          ref={disclosureRef}
          type="button"
        >
          Your campaigns
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </h1>

      {notice && (
        <p className="galaxy-notice" role="status">
          {notice}
        </p>
      )}
      {status === 'pending' && (
        <p className="galaxy-list-message" role="status">
          Gathering your campaigns…
        </p>
      )}
      {status === 'error' && (
        <div className="galaxy-list-message" role="alert">
          <h2>Your campaigns could not be loaded.</h2>
          <p>Check your connection and try again.</p>
          <button className="galaxy-action" onClick={onRetry} type="button">
            Try again
          </button>
        </div>
      )}
      {status === 'ready' && planets.length === 0 && (
        <div className="galaxy-list-message">
          <h2>Your next story starts here.</h2>
          <p>Create a campaign to give your group a shared place to begin.</p>
        </div>
      )}

      <div className="galaxy-list-reveal" data-expanded={expanded} id="galaxy-campaign-list">
        <div aria-hidden={!expanded} className="galaxy-list-scroll" inert={!expanded}>
          {showFilter && (
            <div className="galaxy-ledger-filter">
              <label htmlFor="galaxy-ledger-filter">Find a world</label>
              <input
                autoComplete="off"
                id="galaxy-ledger-filter"
                onChange={(event) => setFilter(event.target.value)}
                type="search"
                value={filter}
              />
            </div>
          )}
          {planets.length > 0 && (
            <ul aria-label="Campaign list" className="galaxy-list">
              {rows.map(({ campaign, index }) => (
                <li key={campaign.id}>
                  <button
                    aria-pressed={selectedId === campaign.id}
                    className="galaxy-list-button"
                    onClick={() => onSelect(campaign.id)}
                    ref={selectedId === campaign.id ? selectedButtonRef : undefined}
                    type="button"
                  >
                    <span aria-hidden="true" className="galaxy-list-button__numeral">
                      {catalogueNumeral(index)}
                    </span>
                    <span className="galaxy-list-button__name">{campaign.name}</span>
                    {campaign.role === 'owner' && (
                      <span aria-hidden="true" className="galaxy-list-button__mark">
                        Owner
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showFilter && rows.length === 0 && (
            <p className="galaxy-list-message">No campaign matches “{filter.trim()}”.</p>
          )}
        </div>
      </div>

      <div className="galaxy-index-actions">
        <Link className="galaxy-create-link" to="/app/campaigns/new">
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Create campaign
        </Link>
        {canPause && (
          <button
            aria-label="Pause ambient motion"
            aria-pressed={paused}
            className="galaxy-motion-toggle"
            onClick={onTogglePause}
            ref={restoreFocusOnPauseRemoval}
            title={paused ? 'Resume ambient motion' : 'Pause ambient motion'}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
              {paused ? (
                <path d="M5 3.5 12 8l-7 4.5z" stroke="currentColor" strokeWidth="1.5" />
              ) : (
                <path d="M5.5 3.5v9m5-9v9" stroke="currentColor" strokeWidth="1.5" />
              )}
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
