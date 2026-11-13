import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import villageAvif from './art/lantern-village.avif'
import villageSmallAvif from './art/lantern-village-small.avif'
import villageSmallWebp from './art/lantern-village-small.webp'
import villageWebp from './art/lantern-village.webp'
import './campaignVillage.css'
import { availableLocations, panelSideFor, type CampLocation } from './camp/campLayout'
import { useDestinationDialog } from './camp/useDestinationDialog'

const smallImageMedia = '(max-width: 480px)'

function locationPosition(location: CampLocation): CSSProperties {
  return {
    '--location-x': location.anchor[0] + '%',
    '--location-y': location.anchor[1] + '%',
  } as CSSProperties
}

export function CampaignCamp({
  title,
  notice,
  isOwner,
  isDeleting,
  cancelDelete,
  overview,
  party,
  settings,
}: {
  title: ReactNode
  notice: string | null
  isOwner: boolean
  isDeleting: boolean
  cancelDelete: () => void
  overview: ReactNode
  party: ReactNode
  settings: ReactNode
}) {
  const [artFailed, setArtFailed] = useState(false)
  const [isPageHidden, setIsPageHidden] = useState(() => document.hidden)
  const campRef = useRef<HTMLElement>(null)
  const { active, bodyRef, close, closeRef, dialogRef, open, placesTriggerRef } =
    useDestinationDialog({ cancelDelete, isDeleting, isOwner, scope: campRef })
  const available = availableLocations(isOwner)
  const panelSide = panelSideFor(active)

  useEffect(() => {
    const updateVisibility = () => setIsPageHidden(document.hidden)
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  const placeItems = available.map((location) => (
    <li key={location.id}>
      <button
        aria-haspopup="dialog"
        className="lantern-places__destination"
        data-location={location.id}
        onClick={(event) => open(location, event.currentTarget)}
        type="button"
      >
        {location.label}
        <span>{location.place}</span>
      </button>
    </li>
  ))

  return (
    <section
      aria-labelledby="campaign-workspace-heading"
      className="lantern-village"
      data-art-failed={artFailed || undefined}
      data-camp-state={active?.id ?? 'idle'}
      ref={campRef}
    >
      <div className="lantern-village__heading">
        {title}
        <details className="lantern-places">
          <summary ref={placesTriggerRef}>Places</summary>
          <ul aria-label="Camp places">{placeItems}</ul>
        </details>
        {notice && !active && (
          <p className="lantern-village__notice" role="status">
            {notice}
          </p>
        )}
      </div>

      {!artFailed && (
        <div className="lantern-scene">
          <div
            className="lantern-scene__plane"
            data-camp-plane
            data-focused={active?.id}
            data-motion-paused={isPageHidden || undefined}
            data-panel-side={panelSide}
            style={active ? locationPosition(active) : undefined}
          >
            <picture>
              <source media={smallImageMedia} srcSet={villageSmallAvif} type="image/avif" />
              <source media={smallImageMedia} srcSet={villageSmallWebp} type="image/webp" />
              <source srcSet={villageAvif} type="image/avif" />
              <img
                alt=""
                data-camp-backdrop
                fetchPriority="high"
                height={941}
                onError={() => setArtFailed(true)}
                src={villageWebp}
                width={1672}
              />
            </picture>
            <span aria-hidden="true" className="lantern-scene__light" data-camp-light />
            <span aria-hidden="true" className="lantern-scene__light lantern-scene__light--east" />
            {available.map((location) => (
              <button
                aria-haspopup="dialog"
                className="lantern-sign"
                data-active={active?.id === location.id || undefined}
                data-location={location.id}
                key={location.id}
                onClick={(event) => open(location, event.currentTarget)}
                style={locationPosition(location)}
                type="button"
              >
                <span>{location.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <nav aria-labelledby="camp-places-heading" className="lantern-directory">
        <h2 id="camp-places-heading">Places</h2>
        <ul aria-label="Camp places">{placeItems}</ul>
      </nav>

      <dialog
        aria-labelledby={active ? `camp-${active.id}-heading` : undefined}
        className="lantern-ledger"
        data-panel-side={panelSide}
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
        ref={dialogRef}
      >
        <div className="lantern-ledger__layout">
          <header className="lantern-ledger__bar">
            <button
              className="lantern-ledger__back"
              disabled={isDeleting}
              onClick={close}
              ref={closeRef}
              type="button"
            >
              Back to camp
            </button>
          </header>
          <div className="lantern-ledger__body" ref={bodyRef}>
            {notice && active && (
              <p className="lantern-ledger__notice" role="status">
                {notice}
              </p>
            )}
            <section hidden={active?.id !== 'overview'}>{overview}</section>
            <section hidden={active?.id !== 'party'}>{party}</section>
            {isOwner && <section hidden={active?.id !== 'settings'}>{settings}</section>}
          </div>
        </div>
      </dialog>
    </section>
  )
}
