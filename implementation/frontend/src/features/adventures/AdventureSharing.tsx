import { useEffect, useId, useRef, useState } from 'react'
import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import { PixelIcon } from '../characters/PixelIcon'
import { noteAuthorLabel } from '../notes/noteRules'
import {
  acceptedParticipants,
  myParticipation,
  shareRequestLabel,
  shareState,
} from './adventureRules'
import type { AdventureDetail } from './adventureTypes'
import type { AdventureAction, AdventureResult } from './useAdventureActions'

type Roster = readonly Pick<CampaignRosterMember, 'profile_id' | 'username' | 'display_name'>[]

type Confirmation = 'share' | 'stop'

/**
 * Sharing a personal or side adventure with the party (M6, D6). It is shared only when every
 * accepted participant agrees: one player's "Share with party" is a request the others answer
 * with Agree or Not now, and Not now or Stop sharing clears everyone's agreement. Sharing and
 * stopping ask first, with focus on the confirm button and back on the opener afterwards. Hidden
 * for main adventures, archived ones, and everyone who is not an accepted participant.
 */
export function AdventureSharing({
  adventure,
  onConsent,
  pendingAction,
  roster,
  userId,
}: {
  adventure: AdventureDetail
  /** `true` gives the viewer's agreement; `false` clears every agreement. */
  onConsent: (consent: boolean) => Promise<AdventureResult<unknown>>
  pendingAction: AdventureAction | null
  roster: Roster
  userId: string
}) {
  const base = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const restoreRef = useRef(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

  const mine = myParticipation(adventure, userId)
  const visible = adventure.type !== 'main' && adventure.archived_at === null && mine !== null
  const state = shareState(adventure)
  const busy = pendingAction !== null
  // The opening controls stay in place, so focus can return to the one that opened the question.
  const locked = busy || confirmation !== null
  const working = pendingAction === 'consent'
  const accepted = acceptedParticipants(adventure)
  const sole = accepted.length <= 1
  const waitingFor = accepted
    .filter((participant) => !participant.share_consent)
    .map((participant) => noteAuthorLabel(participant.profile_id, userId, roster))

  // Closing the confirmation returns focus to its opener, or to the heading when that is gone.
  useEffect(() => {
    if (confirmation || !restoreRef.current) return
    restoreRef.current = false
    const opener = openerRef.current
    ;(opener?.isConnected && !opener.hasAttribute('disabled')
      ? opener
      : headingRef.current
    )?.focus()
  }, [confirmation])

  if (!visible) return null

  function ask(next: Confirmation, opener: HTMLElement) {
    openerRef.current = opener
    setConfirmation(next)
  }

  function close() {
    restoreRef.current = true
    setConfirmation(null)
  }

  async function run(consent: boolean) {
    await onConsent(consent)
    // The error, if any, shows above the page; the state below is read again either way.
    restoreRef.current = true
    setConfirmation(null)
  }

  const iAgreed = mine?.share_consent === true
  const icon = state === 'shared' ? 'eye' : 'lock'

  let summary: React.ReactNode
  if (state === 'shared') {
    summary = 'Shared with the party. Party members read this adventure and cannot change it.'
  } else if (state === 'requested') {
    summary = iAgreed
      ? `You agreed to share this with the party. Waiting for ${new Intl.ListFormat('en', {
          type: 'conjunction',
        }).format(waitingFor)}.`
      : `${shareRequestLabel(adventure, userId, roster)}.`
  } else {
    summary = 'Only the people in this adventure can see it.'
  }

  return (
    <section aria-labelledby={`${base}-heading`} className="adventure-block adventure-sharing">
      <h4 className="journal-section-title" id={`${base}-heading`} ref={headingRef} tabIndex={-1}>
        <PixelIcon name={icon} />
        Sharing
      </h4>
      <p className="adventure-sharing__state" data-share-state={state}>
        {summary}
      </p>

      <div className="journal-actions">
        {state === 'private' && (
          <button
            className="journal-button"
            disabled={locked}
            onClick={(event) => ask('share', event.currentTarget)}
            type="button"
          >
            Share with party
          </button>
        )}
        {state === 'requested' && !iAgreed && (
          <>
            <button
              className="journal-button"
              disabled={locked}
              onClick={(event) => ask('share', event.currentTarget)}
              type="button"
            >
              Agree
            </button>
            <button
              aria-busy={working || undefined}
              className="journal-button journal-button--ghost"
              disabled={locked}
              onClick={() => void run(false)}
              type="button"
            >
              {working ? 'Saving…' : 'Not now'}
            </button>
          </>
        )}
        {state === 'requested' && iAgreed && (
          <button
            aria-busy={working || undefined}
            className="journal-button journal-button--ghost"
            disabled={locked}
            onClick={() => void run(false)}
            type="button"
          >
            {working ? 'Saving…' : 'Cancel the request'}
          </button>
        )}
        {state === 'shared' && (
          <button
            className="journal-button journal-button--danger"
            disabled={locked}
            onClick={(event) => ask('stop', event.currentTarget)}
            type="button"
          >
            Stop sharing
          </button>
        )}
      </div>

      {confirmation !== null && (
        <div aria-label="Confirm" className="journal-confirm" role="group">
          <p>
            {confirmation === 'share' ? (
              <>
                Share <strong>{adventure.title}</strong> with the party?{' '}
                {sole
                  ? 'Party members will see everything here, read-only.'
                  : 'Everyone in this adventure must agree. Party members will see everything here, read-only.'}
              </>
            ) : (
              <>
                Stop sharing <strong>{adventure.title}</strong>? Party members lose access at once.
                Sharing again needs everyone in this adventure to agree again.
              </>
            )}
          </p>
          <div className="journal-actions">
            <button
              aria-busy={working || undefined}
              autoFocus
              className={`journal-button ${confirmation === 'stop' ? 'journal-button--solid-danger' : ''}`}
              disabled={busy}
              onClick={() => void run(confirmation === 'share')}
              type="button"
            >
              {working ? 'Saving…' : confirmation === 'share' ? 'Yes, share' : 'Yes, stop sharing'}
            </button>
            <button
              className="journal-button journal-button--ghost"
              disabled={busy}
              onClick={close}
              type="button"
            >
              Never mind
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
