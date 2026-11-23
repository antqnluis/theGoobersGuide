import { useState, type ReactNode } from 'react'
import { PixelIcon, type PixelIconName } from '../../characters/PixelIcon'
import { CampPanel } from '../camp/CampPanel'
import type { CampaignRecord } from '../campaignTypes'
import { OverviewForm } from './OverviewForm'
import type { OverviewActions } from './useOverviewActions'
import type { CampaignOverview as Overview } from './overviewTypes'
import { isOverviewEmpty } from './overviewValidation'
import './overview.css'

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' })
const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function Block({
  icon,
  title,
  children,
}: {
  icon: PixelIconName
  title: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="overview-block">
      <h3 className="journal-section-title">
        <PixelIcon name={icon} />
        {title}
      </h3>
      {children}
    </section>
  )
}

/** A short fact in a labelled well; nothing for a member when it is empty. */
function Fact({ label, value, isOwner }: { label: string; value: string; isOwner: boolean }) {
  if (!value && !isOwner) return null
  return (
    <div className="overview-fact">
      <dt>{label}</dt>
      <dd data-empty={!value || undefined}>{value || 'Not set'}</dd>
    </div>
  )
}

/** A paragraph the owner wrote, kept as written; an owner is told when it is still empty. */
function Prose({ label, value, isOwner }: { label: string; value: string; isOwner: boolean }) {
  if (!value && !isOwner) return null
  return (
    <div className="overview-prose">
      <h4>{label}</h4>
      {value ? <p>{value}</p> : <p className="overview-prose__empty">Not written yet.</p>}
    </div>
  )
}

function NextSession({ overview, isOwner }: { overview: Overview | null; isOwner: boolean }) {
  // Read once when the page opens: "passed" is a hint, not a clock.
  const [now] = useState(() => Date.now())
  const at = overview?.next_session_at ? new Date(overview.next_session_at) : null
  if (!at && !isOwner) return null
  const passed = at !== null && at.getTime() < now
  return (
    <div className="overview-prose">
      <h4>Next session</h4>
      {at ? (
        <>
          <p>
            <time dateTime={at.toISOString()}>{dateTime.format(at)}</time>
          </p>
          {overview?.next_session_note && <p>{overview.next_session_note}</p>}
          {passed && <p className="overview-prose__empty">That date has passed.</p>}
        </>
      ) : (
        <p className="overview-prose__empty">Not scheduled.</p>
      )}
    </div>
  )
}

/**
 * The camp's Overview: everything about the campaign as it stands now. The owner writes it
 * (where the party is, the chapter and objective, the sessions, the table's rules) and every
 * member reads it. Authorization is the database's; the form is only shown to the owner.
 */
export function CampaignOverview({
  actions,
  campaign,
  editing,
  isOwner,
  onDirtyChange,
  onEditingChange,
  onNotice,
  onRetry,
  overview,
  ownerUsername,
  partySize,
  role,
  status,
}: {
  actions: OverviewActions
  campaign: CampaignRecord
  editing: boolean
  isOwner: boolean
  onDirtyChange: (dirty: boolean) => void
  onEditingChange: (editing: boolean) => void
  onNotice: (message: string) => void
  onRetry: () => void
  overview: Overview | null | undefined
  ownerUsername: string
  partySize: number
  role: string
  status: 'pending' | 'error' | 'success'
}) {
  const panel = (children: ReactNode) => (
    <CampPanel headingId="camp-overview-heading" icon="flag" place="Campfire" title={campaign.name}>
      {children}
    </CampPanel>
  )

  if (editing && isOwner) {
    return panel(
      <OverviewForm
        error={actions.error}
        isPending={actions.isSaving}
        onCancel={() => {
          actions.clearError()
          onEditingChange(false)
        }}
        onDirtyChange={onDirtyChange}
        onSubmit={async (values) => {
          const saved = await actions.save(values)
          if (saved) {
            onEditingChange(false)
            onNotice('The overview was updated.')
          }
          return saved
        }}
        overview={overview}
      />,
    )
  }

  const empty = isOverviewEmpty(overview)
  const hasAny = (...fields: (keyof Overview)[]) =>
    fields.some((field) => Boolean(overview?.[field]))
  const show = (...fields: (keyof Overview)[]) => isOwner || hasAny(...fields)

  return panel(
    <div className="overview">
      {isOwner && (
        <div className="overview__toolbar">
          <button
            className="journal-button journal-button--secondary"
            onClick={() => {
              actions.clearError()
              onEditingChange(true)
            }}
            type="button"
          >
            {empty ? 'Write the overview' : 'Update the overview'}
          </button>
          {overview && (
            <p className="overview__stamp">
              Last updated {day.format(new Date(overview.updated_at))}
            </p>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="journal-alert" role="alert">
          <p>The overview could not be loaded.</p>
          <button
            className="journal-button journal-button--secondary"
            onClick={onRetry}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
      {status === 'pending' && (
        <p className="campaign-loading" role="status">
          Reading the overview…
        </p>
      )}

      {status === 'success' && overview?.announcement && (
        <aside aria-label="Announcement" className="overview-announcement">
          <PixelIcon name="flag" />
          <p>{overview.announcement}</p>
        </aside>
      )}

      {status === 'success' && !isOwner && empty && (
        <p className="overview__none">The campaign owner has not added campaign details yet.</p>
      )}

      {status === 'success' && (
        <>
          {show('location', 'in_world_date', 'chapter', 'situation', 'objective') && (
            <Block icon="lantern" title="Where we are">
              <dl className="overview-facts">
                <Fact isOwner={isOwner} label="Location" value={overview?.location ?? ''} />
                <Fact
                  isOwner={isOwner}
                  label="In-world date"
                  value={overview?.in_world_date ?? ''}
                />
                <Fact isOwner={isOwner} label="Chapter" value={overview?.chapter ?? ''} />
              </dl>
              <Prose
                isOwner={isOwner}
                label="Where things stand"
                value={overview?.situation ?? ''}
              />
              <Prose
                isOwner={isOwner}
                label="Current objective"
                value={overview?.objective ?? ''}
              />
            </Block>
          )}

          {show('next_session_at', 'last_session') && (
            <Block icon="book" title="Sessions">
              <NextSession isOwner={isOwner} overview={overview ?? null} />
              <Prose isOwner={isOwner} label="Last session" value={overview?.last_session ?? ''} />
            </Block>
          )}

          {show('ruleset', 'house_rules', 'table_notes') && (
            <Block icon="shield" title="The table">
              <dl className="overview-facts">
                <Fact isOwner={isOwner} label="Game system" value={overview?.ruleset ?? ''} />
              </dl>
              <Prose isOwner={isOwner} label="House rules" value={overview?.house_rules ?? ''} />
              <Prose
                isOwner={isOwner}
                label="Tone and expectations"
                value={overview?.table_notes ?? ''}
              />
            </Block>
          )}
        </>
      )}

      <Block icon="tent" title="About the campaign">
        <p className="camp-ledger__description">
          {campaign.description || 'No description has been added.'}
        </p>
        <dl className="overview-facts">
          <div className="overview-fact">
            <dt>Your role</dt>
            <dd>{role}</dd>
          </div>
          <div className="overview-fact">
            <dt>Campaign owner</dt>
            <dd>{ownerUsername}</dd>
          </div>
          <div className="overview-fact">
            <dt>Party size</dt>
            <dd>{partySize}</dd>
          </div>
          <div className="overview-fact">
            <dt>Started</dt>
            <dd>{day.format(new Date(campaign.created_at))}</dd>
          </div>
        </dl>
      </Block>
    </div>,
  )
}
