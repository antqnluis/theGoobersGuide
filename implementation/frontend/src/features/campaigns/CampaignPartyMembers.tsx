import { useEffect, useRef, type ReactNode } from 'react'
import type { MembershipAction, MembershipConfirmation } from './useCampaignMembership'
import { memberHandle, memberLabel } from './memberName'
import type { CampaignRosterMember } from './campaignTypes'
import { CharacterBadges, CharacterMedallion } from '../characters/CharacterBadges'
import { CampPanel } from './camp/CampPanel'
import { CharacterSheet } from '../characters/CharacterSheet'
import { describeCharacter } from '../characters/characterDisplay'
import type { CharacterSummary } from '../characters/characterTypes'

type CampaignPartyMembersProps = {
  campaignName: string
  isOwner: boolean
  roster: CampaignRosterMember[]
  status: 'pending' | 'error' | 'success'
  onRetry: () => void
  confirmation: MembershipConfirmation | null
  onConfirmationChange: (confirmation: MembershipConfirmation | null) => void
  pendingAction: MembershipAction | null
  pendingProfileId: string | null
  /** Failure copy for a leave or remove attempt. */
  error: string | null
  onLeaveCampaign: () => void
  /**
   * Shared adventures (two or more accepted participants) the viewer is in; they are left when
   * the campaign is (D9). Undefined while the adventures are not loaded, which leaves the
   * sentence out.
   */
  sharedAdventureCount?: number
  onRemoveMember: (profileId: string, name: string) => void
  /** Owner-only controls that follow the list (invitations). */
  children?: ReactNode
  /** Every character the viewer may see; the party is the active, in-party ones. */
  characters?: readonly CharacterSummary[]
  charactersStatus?: 'pending' | 'error' | 'success'
  userId?: string
  /** The character whose shared sheet is open in place of the list, if any. */
  sheetCharacterId?: string | null
  onSheetChange?: (characterId: string | null) => void
}

/** The character a member brings to the party: active and opted in (at most one). */
function partyCharacterOf(characters: readonly CharacterSummary[], profileId: string) {
  return characters.find(
    (character) =>
      character.owner_id === profileId && character.status === 'active' && character.in_party,
  )
}

/**
 * The Party panel: who is in the campaign, with leave (members) and remove
 * (owner) behind an inline confirmation, the same pattern as campaign deletion.
 */
export function CampaignPartyMembers({
  campaignName,
  isOwner,
  roster,
  status,
  onRetry,
  confirmation,
  onConfirmationChange,
  pendingAction,
  pendingProfileId,
  error,
  onLeaveCampaign,
  sharedAdventureCount,
  onRemoveMember,
  children,
  characters = [],
  charactersStatus = 'pending',
  userId = '',
  sheetCharacterId = null,
  onSheetChange = () => {},
}: CampaignPartyMembersProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const restoreFocusRef = useRef<string | null>(null)
  const previousConfirmationRef = useRef<MembershipConfirmation | null>(null)
  const busy = pendingAction !== null
  const hasOtherMembers = roster.some((member) => member.role !== 'owner')

  // Cancelling returns focus to the control that opened the confirmation. A finished
  // removal leaves focus on a vanished button, so it moves somewhere stable instead.
  useEffect(() => {
    const previous = previousConfirmationRef.current
    previousConfirmationRef.current = confirmation
    if (confirmation) return
    const root = rootRef.current
    const key = restoreFocusRef.current
    restoreFocusRef.current = null
    if (key) {
      root?.querySelector<HTMLElement>(`[data-membership-trigger="${CSS.escape(key)}"]`)?.focus()
    } else if (previous?.type === 'remove' && root?.closest('dialog')?.open) {
      const invite = root.querySelector<HTMLElement>('[aria-controls="campaign-invite-form"]')
      ;(invite ?? headingRef.current)?.focus()
    }
  }, [confirmation])

  // Opening a sheet moves focus to its heading; closing it returns focus to "View sheet".
  const sheetHeadingRef = useRef<HTMLHeadingElement>(null)
  const restoreSheetFocusRef = useRef<string | null>(null)
  useEffect(() => {
    if (sheetCharacterId) {
      sheetHeadingRef.current?.focus()
      return
    }
    const key = restoreSheetFocusRef.current
    restoreSheetFocusRef.current = null
    if (key) {
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-sheet-trigger="${CSS.escape(key)}"]`)
        ?.focus()
    }
  }, [sheetCharacterId])

  const sheetCharacter = sheetCharacterId
    ? (characters.find((character) => character.id === sheetCharacterId) ?? null)
    : null
  const canViewSheet = (character: CharacterSummary) =>
    character.owner_id === userId || character.sheet_visibility === 'campaign'
  const closeSheet = () => {
    restoreSheetFocusRef.current = sheetCharacterId
    onSheetChange(null)
  }
  const partyCount =
    charactersStatus === 'success'
      ? roster.filter((member) => partyCharacterOf(characters, member.profile_id)).length
      : null

  if (sheetCharacterId) {
    return (
      <div ref={rootRef}>
        {/* Keeps the dialog's accessible name while the list is swapped out. */}
        <h2 className="visually-hidden" id="camp-party-heading">
          People in this campaign
        </h2>
        <section aria-labelledby="party-sheet-heading" className="folio tent-turn">
          <header className="folio-head">
            <button
              className="journal-button journal-button--ghost folio-head__back"
              onClick={closeSheet}
              type="button"
            >
              Back to party
            </button>
            {sheetCharacter && canViewSheet(sheetCharacter) ? (
              <div className="folio-head__identity">
                <CharacterMedallion character={sheetCharacter} size={72} />
                <div className="folio-head__names">
                  <h3 id="party-sheet-heading" ref={sheetHeadingRef} tabIndex={-1}>
                    {sheetCharacter.name}
                  </h3>
                  <p className="folio-head__meta">
                    {describeCharacter(sheetCharacter)}
                    {sheetCharacter.background ? ` · ${sheetCharacter.background}` : ''}
                    {sheetCharacter.subclass ? ` · ${sheetCharacter.subclass}` : ''}
                  </p>
                  <CharacterBadges character={sheetCharacter} />
                </div>
              </div>
            ) : (
              <h3 id="party-sheet-heading" ref={sheetHeadingRef} tabIndex={-1}>
                Character sheet
              </h3>
            )}
          </header>
          {sheetCharacter && canViewSheet(sheetCharacter) ? (
            <CharacterSheet character={sheetCharacter} readOnly userId={userId} />
          ) : (
            <p className="journal-status">This sheet is no longer available.</p>
          )}
        </section>
      </div>
    )
  }

  function cancel(key: string) {
    restoreFocusRef.current = key
    onConfirmationChange(null)
  }

  return (
    <div ref={rootRef}>
      <CampPanel
        headingId="camp-party-heading"
        headingRef={headingRef}
        icon="lantern"
        place="Bedroll circle"
        title="People in this campaign"
      >
        {status === 'pending' && (
          <p className="campaign-loading" role="status">
            Loading campaign members…
          </p>
        )}
        {status === 'error' && (
          <div className="campaign-inline-error" role="alert">
            <p>Campaign members could not be loaded.</p>
            <button className="campaign-text-button" onClick={onRetry} type="button">
              Try again
            </button>
          </div>
        )}
        {status === 'success' && roster.length === 0 && (
          <p className="campaign-members__empty">No member information is available.</p>
        )}
        {status === 'success' && roster.length > 0 && partyCount !== null && (
          <p className="campaign-members__empty">
            {partyCount} of {roster.length} {roster.length === 1 ? 'member has' : 'members have'} a
            character in the party.
          </p>
        )}
        {status === 'success' && roster.length > 0 && (
          <ul className="campaign-member-list">
            {roster.map((member) => {
              const name = memberLabel(member)
              const confirmingRemoval =
                confirmation?.type === 'remove' && confirmation.profileId === member.profile_id
              const removing = busy && pendingProfileId === member.profile_id
              const partyCharacter =
                charactersStatus === 'success'
                  ? (partyCharacterOf(characters, member.profile_id) ?? null)
                  : null
              return (
                <li
                  className={
                    confirmingRemoval ? 'campaign-member-list__row--confirming' : undefined
                  }
                  key={member.profile_id}
                >
                  <span className="campaign-member-list__who">
                    <span>
                      {member.display_name ||
                        member.username ||
                        (member.role === 'owner' ? 'Campaign owner' : 'Player')}
                      {memberHandle(member) && (
                        <small className="campaign-member-list__handle">
                          {' '}
                          {memberHandle(member)}
                        </small>
                      )}
                    </span>
                    {charactersStatus === 'success' && (
                      <span className="campaign-member-list__character">
                        {partyCharacter ? (
                          <>
                            <strong>{partyCharacter.name}</strong>
                            <small> {describeCharacter(partyCharacter)}</small>
                          </>
                        ) : (
                          'No character in the party'
                        )}
                      </span>
                    )}
                  </span>
                  {partyCharacter && canViewSheet(partyCharacter) && (
                    <button
                      aria-label={`View ${partyCharacter.name}'s sheet`}
                      className="campaign-text-button"
                      data-sheet-trigger={partyCharacter.id}
                      onClick={() => onSheetChange(partyCharacter.id)}
                      type="button"
                    >
                      View sheet
                    </button>
                  )}
                  <span className="campaign-member-list__role">
                    {member.role === 'owner' ? 'Owner' : 'Member'}
                  </span>
                  {isOwner && member.role !== 'owner' && !confirmingRemoval && (
                    <button
                      aria-label={`Remove ${name} from the campaign`}
                      className="campaign-text-button"
                      data-membership-trigger={member.profile_id}
                      disabled={busy}
                      onClick={() =>
                        onConfirmationChange({ type: 'remove', profileId: member.profile_id })
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  )}
                  {confirmingRemoval && (
                    <div
                      aria-label={`Confirm removal of ${name}`}
                      className="campaign-delete-confirm"
                      role="group"
                    >
                      <p>
                        Remove <strong>{name}</strong> from <strong>{campaignName}</strong>? They'll
                        lose access until you invite them again. Their characters are kept and leave
                        the party.
                      </p>
                      <div className="campaign-settings__actions">
                        <button
                          autoFocus
                          className="campaign-danger-button"
                          disabled={busy}
                          onClick={() => onRemoveMember(member.profile_id, name)}
                          type="button"
                        >
                          {removing ? 'Removing…' : 'Yes, remove'}
                        </button>
                        <button
                          className="campaign-text-button"
                          disabled={busy}
                          onClick={() => cancel(member.profile_id)}
                          type="button"
                        >
                          Keep {name}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {error && (
          <p className="campaign-form__feedback" role="alert">
            {error}
          </p>
        )}

        {isOwner && status === 'success' && hasOtherMembers && (
          <p className="campaign-members__empty">
            To leave this campaign, transfer ownership in Campaign settings first.
          </p>
        )}

        {!isOwner && confirmation?.type !== 'leave' && (
          <div className="campaign-settings__actions">
            <button
              className="campaign-danger-button"
              data-membership-trigger="leave"
              disabled={busy}
              onClick={() => onConfirmationChange({ type: 'leave' })}
              type="button"
            >
              Leave campaign
            </button>
          </div>
        )}
        {!isOwner && confirmation?.type === 'leave' && (
          <div
            aria-label="Confirm leaving the campaign"
            className="campaign-delete-confirm"
            role="group"
          >
            <p>
              Leave <strong>{campaignName}</strong>? You'll lose access until the owner invites you
              again. Your characters are kept and leave the party.
              {sharedAdventureCount ? (
                <>
                  {' '}
                  You&rsquo;ll leave {sharedAdventureCount} shared{' '}
                  {sharedAdventureCount === 1 ? 'adventure' : 'adventures'}. Rejoining the campaign
                  won&rsquo;t bring you back into {sharedAdventureCount === 1 ? 'it' : 'them'}.
                </>
              ) : null}
            </p>
            <div className="campaign-settings__actions">
              <button
                autoFocus
                className="campaign-danger-button"
                disabled={busy}
                onClick={onLeaveCampaign}
                type="button"
              >
                {pendingAction === 'leave' ? 'Leaving…' : 'Yes, leave campaign'}
              </button>
              <button
                className="campaign-text-button"
                disabled={busy}
                onClick={() => cancel('leave')}
                type="button"
              >
                Stay in campaign
              </button>
            </div>
          </div>
        )}

        {children}
      </CampPanel>
    </div>
  )
}
