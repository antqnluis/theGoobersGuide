import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ViewTransition, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useNavigationType, useParams } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { campaignCharactersOptions } from '../characters/characterQueries'
import { CharacterTent, type TentView } from '../characters/CharacterTent'
import type { CharacterConfirmation } from '../characters/CharacterStatusControls'
import { useCharacterActions } from '../characters/useCharacterActions'
import { CampAdventures, type AdventureScreen } from '../adventures/CampAdventures'
import {
  adventuresKey,
  adventuresOptions,
  invitationsKey,
  requestCountKey,
  requestCountOptions,
} from '../adventures/adventureQueries'
import { sharedThreadCount } from '../adventures/adventureRules'
import { useAdventureActions } from '../adventures/useAdventureActions'
import { useDiceScope } from '../dice/useDice'
import { CampNotes, type NoteScreen } from '../notes/CampNotes'
import { notesKey } from '../notes/noteQueries'
import { useNoteActions } from '../notes/useNoteActions'
import { CampaignForm } from './CampaignForm'
import { CampaignOutgoingInvitations } from './CampaignOutgoingInvitations'
import { CampaignOwnershipTransfer } from './CampaignOwnershipTransfer'
import { CampaignPartyMembers } from './CampaignPartyMembers'
import { CampaignCamp } from './CampaignCamp'
import { CampPanel } from './camp/CampPanel'
import { AppearanceDrawer } from './camp/AppearanceDrawer'
import { adventurerAppearance } from './camp/adventurerAppearance'
import { campaignAppearancesOptions } from './camp/campAppearance'
import { useCampaignAppearance } from './useCampaignAppearance'
import { useCampToasts } from './camp/useCampToasts'
import { worldFor } from './camp/campBackground'
import { useCampBackground, useCampHue } from './camp/useCampBackground'
import { galaxyPlanetsOptions } from './galaxyPlanets'
import { planetAppearance, planetAppearanceForSlot } from './planetModel'
import { getCampaign, getCampaignRoster } from './campaignService'
import { useCampaignLive } from './useCampaignLive'
import { useCampaignManagement } from './useCampaignManagement'
import { useCampaignMembership, type MembershipConfirmation } from './useCampaignMembership'

export function CampaignWorkspacePage() {
  const { campaignId = '' } = useParams()
  return <CampaignWorkspace campaignId={campaignId} key={campaignId} />
}

function CampaignWorkspace({ campaignId }: { campaignId: string }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const [isEditing, setIsEditing] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const deleteTriggerRef = useRef<HTMLButtonElement>(null)
  const restoreDeleteFocusRef = useRef(false)
  const routeState = location.state as {
    campaignCreated?: boolean
    campaignTransition?: { campaignId: string; name: string }
  } | null
  const campaignTransitionTitle =
    navigationType === 'PUSH' && routeState?.campaignTransition?.campaignId === campaignId
      ? routeState.campaignTransition.name
      : null
  // The descent plays only on a fresh arrival from the galaxy, never on a direct
  // load, a refresh, or Back and Forward to the same history entry.
  const [arrivedFromGalaxy] = useState(
    () => navigationType === 'PUSH' && routeState?.campaignTransition?.campaignId === campaignId,
  )
  const [notice, setNotice] = useState<string | null>(() =>
    routeState?.campaignCreated ? 'Campaign created.' : null,
  )
  const management = useCampaignManagement(campaignId, userId)
  const membership = useCampaignMembership(campaignId, userId)
  const characterActions = useCharacterActions(campaignId, userId)
  const noteActions = useNoteActions(campaignId, userId)
  const adventureActions = useAdventureActions(campaignId, userId)
  const queryClient = useQueryClient()
  const appearanceActions = useCampaignAppearance(campaignId, userId)
  const [tentView, setTentView] = useState<TentView>({ type: 'list' })
  const [characterDirty, setCharacterDirty] = useState(false)
  const [noteScreen, setNoteScreen] = useState<NoteScreen>({ type: 'list' })
  const [noteDirty, setNoteDirty] = useState(false)
  // The notes load when the Notes destination is first opened, and refresh each time after.
  const [notesOpened, setNotesOpened] = useState(false)
  const [adventureScreen, setAdventureScreen] = useState<AdventureScreen>({ type: 'list' })
  const [adventureDirty, setAdventureDirty] = useState(false)
  // The adventures load when the Adventures destination is first opened, and refresh each time after.
  const [adventuresOpened, setAdventuresOpened] = useState(false)
  // A shared sheet opened read-only from the Party panel.
  const [partySheetId, setPartySheetId] = useState<string | null>(null)
  const toasts = useCampToasts()
  const [characterConfirmation, setCharacterConfirmation] = useState<CharacterConfirmation | null>(
    null,
  )
  const [confirmation, setConfirmation] = useState<MembershipConfirmation | null>(null)
  // Which action the current membership error belongs to, so it shows beside its own control.
  const [membershipErrorFor, setMembershipErrorFor] = useState<'party' | 'settings'>('party')

  const campaignQuery = useQuery({
    queryKey: ['campaigns', 'detail', campaignId, userId],
    queryFn: () => getCampaign(campaignId),
    enabled: Boolean(campaignId) && Boolean(userId),
  })
  const rosterQuery = useQuery({
    queryKey: ['campaigns', 'roster', campaignId, userId],
    queryFn: () => getCampaignRoster(campaignId),
    enabled: Boolean(campaignId) && Boolean(userId) && Boolean(campaignQuery.data),
  })
  const charactersQuery = useQuery({
    ...campaignCharactersOptions(campaignId, userId),
    enabled: Boolean(campaignId) && Boolean(userId) && Boolean(campaignQuery.data),
  })
  // The Places entry shows how many adventure requests wait for the player: read when the camp
  // opens, kept live by useCampaignLive, and refetched on focus. A failed read shows no count.
  // Read only when the Adventures list is already cached: leaving names the shared ones (D9).
  const adventuresList = useQuery(adventuresOptions(campaignId, userId, false))
  const requestCount = useQuery(
    requestCountOptions(
      campaignId,
      userId,
      Boolean(campaignId) && Boolean(userId) && Boolean(campaignQuery.data),
    ),
  )
  const charactersData = charactersQuery.data
  // The camp names each seat for its player's active character, when they have one.
  const characterNames = useMemo(
    () =>
      new Map(
        (charactersData ?? [])
          .filter((character) => character.status === 'active')
          .map((character) => [character.owner_id, character.name]),
      ),
    [charactersData],
  )
  const appearancesQuery = useQuery({
    ...campaignAppearancesOptions(campaignId, userId),
    enabled: Boolean(campaignId) && Boolean(userId) && Boolean(campaignQuery.data),
  })
  const appearances = appearancesQuery.data
  const campaign = campaignQuery.data
  // Sheets, notes, and adventures update live once the campaign has loaded.
  useCampaignLive(campaignId, userId, Boolean(campaign))
  // The camp wears the look of the planet this player's campaign sits on. It is read from
  // the planets query, usually already cached by the galaxy. While that loads the camp waits
  // (it already copes with no planet), and if it fails the camp falls back to the look the
  // campaign's own id gives.
  const planetsQuery = useQuery({ ...galaxyPlanetsOptions(userId), enabled: Boolean(userId) })
  const planetSlot = planetsQuery.data?.find((row) => row.campaign_id === campaignId)?.slot
  const planetSettled = planetsQuery.isError || planetsQuery.isSuccess
  const planet = useMemo(() => {
    if (!campaign || !planetSettled) return null
    return planetSlot === undefined
      ? planetAppearance(campaign.id)
      : planetAppearanceForSlot(planetSlot)
  }, [campaign, planetSettled, planetSlot])
  const [background, setBackground] = useCampBackground(campaignId)
  const [hue, setHue] = useCampHue(campaignId)
  // The player's pick wears the planet's colours; by default the camp is the planet's own.
  const world = useMemo(
    () => (planet ? worldFor(planet, background, hue) : null),
    [planet, background, hue],
  )
  const isOwner = Boolean(campaign && campaign.owner_id === session?.user.id)
  const rosterData = rosterQuery.data
  const roster = useMemo(() => rosterData ?? [], [rosterData])
  // The dice roll at this table: the server makes and shares the rolls, and the log names players
  // and their characters from what this member can read.
  const diceScope = useMemo(
    () =>
      campaign && userId
        ? {
            campaignId,
            userId,
            memberNames: new Map(
              roster.map((member) => [
                member.profile_id,
                member.display_name || member.username || 'A player',
              ]),
            ),
            characterNames: new Map(
              (charactersData ?? []).map((character) => [character.id, character.name]),
            ),
          }
        : null,
    [campaign, campaignId, charactersData, roster, userId],
  )
  useDiceScope(diceScope)
  const currentRole = isOwner
    ? 'Owner'
    : roster.find((member) => member.profile_id === session?.user.id)?.role === 'owner'
      ? 'Owner'
      : 'Member'
  const ownerUsername =
    roster.find((member) => member.role === 'owner')?.username ?? 'Campaign owner'

  useEffect(() => {
    if (routeState?.campaignCreated) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, navigate, routeState?.campaignCreated])

  useEffect(() => {
    if (!isConfirmingDelete && restoreDeleteFocusRef.current) {
      restoreDeleteFocusRef.current = false
      deleteTriggerRef.current?.focus()
    }
  }, [isConfirmingDelete])

  const save = async (name: string, description: string) => {
    if (await management.save(name, description)) {
      setIsEditing(false)
      setNotice('Campaign details saved.')
    }
  }

  const remove = async () => {
    if (await management.remove()) {
      navigate('/app/campaigns', { state: { campaignNotice: 'deleted' } })
    }
  }

  const changeConfirmation = (next: MembershipConfirmation | null) => {
    membership.clearError()
    setConfirmation(next)
  }

  const leaveCampaign = async () => {
    setMembershipErrorFor('party')
    if (await membership.leave()) {
      navigate('/app/campaigns', { state: { campaignNotice: 'left' } })
    }
  }

  const removeMember = async (profileId: string, name: string) => {
    setMembershipErrorFor('party')
    setNotice(null)
    if (await membership.remove(profileId)) {
      setConfirmation(null)
      setNotice(`${name} was removed.`)
    }
  }

  const transferOwnership = async (profileId: string, name: string) => {
    setMembershipErrorFor('settings')
    setNotice(null)
    if (await membership.transfer(profileId)) {
      setConfirmation(null)
      setNotice(`Ownership transferred to ${name}.`)
    }
  }

  if (campaignQuery.isPending) {
    return (
      <section className="campaign-page camp-pending" aria-labelledby="workspace-loading-heading">
        {campaignTransitionTitle ? (
          <>
            <ViewTransition
              default="none"
              name={'campaign-title-' + campaignId}
              share="campaign-title-morph"
            >
              <h1 id="workspace-loading-heading" title={campaignTransitionTitle}>
                {campaignTransitionTitle}
              </h1>
            </ViewTransition>
            <p className="campaign-loading" role="status">
              Opening campaign workspace…
            </p>
          </>
        ) : (
          <>
            <p className="campaign-loading" role="status">
              Opening campaign workspace…
            </p>
            <h1 className="visually-hidden" id="workspace-loading-heading">
              Campaign workspace
            </h1>
          </>
        )}
      </section>
    )
  }

  if (campaignQuery.isError) {
    return (
      <section
        className="campaign-page campaign-state camp-state"
        aria-labelledby="workspace-error-heading"
      >
        <h1 id="workspace-error-heading">This workspace could not be opened.</h1>
        <p>Check your connection and try again.</p>
        <button
          className="auth-button auth-button--secondary"
          onClick={() => campaignQuery.refetch()}
          type="button"
        >
          Try again
        </button>
      </section>
    )
  }

  if (!campaign || !world) {
    return (
      <section
        className="campaign-page campaign-state camp-state"
        aria-labelledby="workspace-missing-heading"
      >
        <h1 id="workspace-missing-heading">Campaign not available</h1>
        <p>This campaign may have been removed, or your account may not have access.</p>
        <Link className="campaign-inline-link" to="/app/campaigns">
          Return to your campaigns
        </Link>
      </section>
    )
  }

  return (
    <CampaignCamp
      characterFolio={tentView.type === 'character' || tentView.type === 'edit'}
      partyFolio={partySheetId !== null}
      unsavedChanges={{
        characters: characterDirty,
        notes: noteDirty,
        adventures: adventureDirty,
      }}
      waiting={{ adventures: requestCount.data ?? 0 }}
      onDestinationChange={(id) => {
        if (id === 'adventures') {
          if (adventuresOpened) {
            for (const queryKey of [
              adventuresKey(campaignId, userId),
              invitationsKey(campaignId, userId),
              requestCountKey(campaignId, userId),
            ]) {
              void queryClient.invalidateQueries({ queryKey })
            }
          } else setAdventuresOpened(true)
          return
        }
        if (id !== 'notes') return
        if (notesOpened)
          void queryClient.invalidateQueries({ queryKey: notesKey(campaignId, userId) })
        else setNotesOpened(true)
      }}
      onDismissToast={toasts.dismiss}
      toasts={toasts.toasts}
      cancelDelete={() => {
        if (isConfirmingDelete) {
          management.clearError()
          setIsConfirmingDelete(false)
        }
        membership.clearError()
        setConfirmation(null)
        characterActions.clearError()
        setCharacterConfirmation(null)
        setTentView({ type: 'list' })
        setCharacterDirty(false)
        noteActions.clearError()
        setNoteScreen({ type: 'list' })
        setNoteDirty(false)
        adventureActions.clearError()
        setAdventureScreen({ type: 'list' })
        setAdventureDirty(false)
        setPartySheetId(null)
      }}
      isDeleting={
        management.isDeleting ||
        membership.pendingAction !== null ||
        characterActions.pendingAction !== null ||
        noteActions.pendingAction !== null ||
        adventureActions.pendingAction !== null
      }
      isOwner={isOwner}
      notice={notice}
      landfallKey={arrivedFromGalaxy ? location.key : null}
      background={background}
      onBackgroundChange={setBackground}
      hue={hue}
      onHueChange={setHue}
      onLeave={() => navigate('/app/campaigns')}
      roster={roster}
      characterNames={characterNames}
      appearances={appearances}
      partyDrawer={
        <AppearanceDrawer
          defaultLook={adventurerAppearance(userId)}
          error={appearanceActions.error}
          onClearError={appearanceActions.clearError}
          onReset={async () => {
            const done = await appearanceActions.reset()
            if (done) toasts.push('Your look is back to the default.')
            return done
          }}
          onSave={async (look) => {
            const done = await appearanceActions.save(look)
            if (done) toasts.push('Your look was saved.')
            return done
          }}
          pending={appearanceActions.pendingAction}
          saved={appearances?.get(userId) ?? null}
        />
      }
      world={world}
      title={
        <ViewTransition
          default="none"
          name={'campaign-title-' + campaign.id}
          share="campaign-title-morph"
        >
          <h1 id="campaign-workspace-heading" title={campaign.name}>
            {campaign.name}
          </h1>
        </ViewTransition>
      }
      overview={
        <CampPanel
          headingId="camp-overview-heading"
          icon="flag"
          place="Campfire"
          title={campaign.name}
        >
          <p className="camp-ledger__description">
            {campaign.description || 'No description has been added.'}
          </p>
          <dl className="camp-ledger__facts">
            <div>
              <dt>Your role</dt>
              <dd>{currentRole}</dd>
            </div>
            <div>
              <dt>Campaign owner</dt>
              <dd>{ownerUsername}</dd>
            </div>
          </dl>
        </CampPanel>
      }
      party={
        <CampaignPartyMembers
          campaignName={campaign.name}
          characters={charactersQuery.data ?? []}
          charactersStatus={
            charactersQuery.isError ? 'error' : charactersQuery.isSuccess ? 'success' : 'pending'
          }
          confirmation={confirmation}
          error={membershipErrorFor === 'party' ? membership.error : null}
          onSheetChange={setPartySheetId}
          sheetCharacterId={partySheetId}
          userId={userId}
          isOwner={isOwner}
          onConfirmationChange={changeConfirmation}
          onLeaveCampaign={leaveCampaign}
          sharedAdventureCount={
            adventuresList.data ? sharedThreadCount(adventuresList.data, userId) : undefined
          }
          onRemoveMember={removeMember}
          onRetry={() => rosterQuery.refetch()}
          pendingAction={membership.pendingAction}
          pendingProfileId={membership.pendingProfileId}
          roster={roster}
          status={rosterQuery.isError ? 'error' : rosterQuery.isSuccess ? 'success' : 'pending'}
        >
          {isOwner && (
            <CampaignOutgoingInvitations
              campaignId={campaign.id}
              key={campaign.id + userId}
              userId={userId}
            />
          )}
        </CampaignPartyMembers>
      }
      characters={
        <CharacterTent
          actions={characterActions}
          campaignId={campaignId}
          characters={charactersQuery.data ?? []}
          confirmation={characterConfirmation}
          onConfirmationChange={(next) => {
            characterActions.clearError()
            setCharacterConfirmation(next)
          }}
          onDirtyChange={setCharacterDirty}
          onNotice={toasts.push}
          onRetry={() => charactersQuery.refetch()}
          onViewChange={setTentView}
          status={
            charactersQuery.isError ? 'error' : charactersQuery.isSuccess ? 'success' : 'pending'
          }
          userId={userId}
          view={tentView}
        />
      }
      adventures={
        <CampAdventures
          actions={adventureActions}
          campaignId={campaignId}
          characters={charactersQuery.data ?? []}
          enabled={adventuresOpened}
          onDirtyChange={setAdventureDirty}
          onNotice={toasts.push}
          onScreenChange={setAdventureScreen}
          roster={roster}
          screen={adventureScreen}
          userId={userId}
        />
      }
      notes={
        <CampNotes
          actions={noteActions}
          campaignId={campaignId}
          characters={charactersQuery.data ?? []}
          enabled={notesOpened}
          onDirtyChange={setNoteDirty}
          onNotice={toasts.push}
          onScreenChange={setNoteScreen}
          roster={roster}
          screen={noteScreen}
          userId={userId}
        />
      }
      settings={
        <CampPanel
          headingId="camp-settings-heading"
          icon="book"
          place="Steward’s wagon"
          title="Campaign settings"
        >
          {management.error && (
            <p className="campaign-form__feedback" role="alert">
              {management.error}
            </p>
          )}
          {isEditing ? (
            <CampaignForm
              initialDescription={campaign.description}
              initialName={campaign.name}
              isPending={management.isSaving}
              onCancel={() => {
                setIsEditing(false)
                management.clearError()
              }}
              onSubmit={save}
              submitLabel="Save changes"
            />
          ) : !isConfirmingDelete ? (
            <div className="campaign-settings__actions">
              <button
                className="auth-button auth-button--secondary"
                onClick={() => {
                  management.clearError()
                  changeConfirmation(null)
                  setIsEditing(true)
                }}
                type="button"
              >
                Edit details
              </button>
              <button
                className="campaign-danger-button"
                ref={deleteTriggerRef}
                onClick={() => {
                  management.clearError()
                  changeConfirmation(null)
                  setIsConfirmingDelete(true)
                }}
                type="button"
              >
                Delete campaign
              </button>
            </div>
          ) : null}

          {!isEditing && !isConfirmingDelete && (
            <CampaignOwnershipTransfer
              campaignName={campaign.name}
              confirmation={confirmation}
              error={membershipErrorFor === 'settings' ? membership.error : null}
              onConfirmationChange={changeConfirmation}
              onRetry={() => rosterQuery.refetch()}
              onTransfer={transferOwnership}
              pendingAction={membership.pendingAction}
              roster={roster}
              status={rosterQuery.isError ? 'error' : rosterQuery.isSuccess ? 'success' : 'pending'}
            />
          )}

          {isConfirmingDelete && (
            <div
              aria-label="Confirm campaign deletion"
              className="campaign-delete-confirm"
              role="group"
            >
              <p>
                Delete <strong>{campaign.name}</strong> permanently? Its details, member list,
                notes, adventures, and every player's characters, character sheets, and inventories
                will be removed. This can't be undone.
              </p>
              <div className="campaign-settings__actions">
                <button
                  className="campaign-danger-button"
                  disabled={management.isDeleting}
                  onClick={remove}
                  type="button"
                  autoFocus
                >
                  {management.isDeleting ? 'Deleting campaign…' : 'Yes, delete campaign'}
                </button>
                <button
                  className="campaign-text-button"
                  disabled={management.isDeleting}
                  onClick={() => {
                    restoreDeleteFocusRef.current = true
                    setIsConfirmingDelete(false)
                  }}
                  type="button"
                >
                  Keep campaign
                </button>
              </div>
            </div>
          )}
        </CampPanel>
      }
    />
  )
}
