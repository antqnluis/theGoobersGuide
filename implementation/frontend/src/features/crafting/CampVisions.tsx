import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { CampPanel } from '../campaigns/camp/CampPanel'
import type { CharacterSummary } from '../characters/characterTypes'
import { ownCharacters } from './ownCharacters'
import { visionsOptions } from './craftingQueries'
import { RibbonTabs } from './RibbonTabs'
import { VisionList } from './VisionList'
import { VisionsDm } from './VisionsDm'
import { useCraftingActions } from './useCraftingActions'
import type { Vision } from './craftingTypes'
import './crafting.css'

function CharacterVisions({
  character,
  userId,
  enabled,
}: {
  character: CharacterSummary
  userId: string
  enabled: boolean
}) {
  const visions = useQuery(visionsOptions(character.id, userId, enabled))
  const actions = useCraftingActions(userId)

  async function toggle(vision: Vision) {
    await actions.setSaved(character.id, vision.recipe_id, !vision.saved)
  }

  return (
    <div className="vision-character">
      {actions.error && (
        <p className="journal-alert" role="alert">
          {actions.error}
        </p>
      )}
      {visions.isPending && (
        <p className="journal-status" role="status">
          Reading your visions…
        </p>
      )}
      {visions.isError && (
        <div className="journal-status journal-status--error" role="alert">
          <p>Your visions could not be loaded.</p>
          <button
            className="journal-button journal-button--secondary"
            onClick={() => void visions.refetch()}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
      {visions.isSuccess && (
        <VisionList
          characterId={character.id}
          onToggleSaved={(vision) => void toggle(vision)}
          pending={actions.isPending}
          visions={visions.data}
        />
      )}
    </div>
  )
}

type Tab = 'visions' | 'dm'

/**
 * The Maker's Visions, the shrine stone beside the campfire (M04 plan W13, W14). Every member
 * reads their own characters' visions; the campaign owner also gets a DM tab for libraries,
 * packs, and calling a long rest. Nobody reads another player's visions (W7).
 */
export function CampVisions({
  campaignId,
  userId,
  isOwner,
  enabled,
  characters,
  onNotice,
}: {
  campaignId: string
  userId: string
  isOwner: boolean
  /** Loads once the area is first opened. */
  enabled: boolean
  /** Every character in the campaign; only the viewer's own are read. */
  characters: readonly CharacterSummary[]
  onNotice: (message: string) => void
}) {
  const own = ownCharacters(characters, userId)
  const pickerId = useId()
  const [picked, setPicked] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('visions')
  const character = own.find((entry) => entry.id === picked) ?? own[0] ?? null
  // An owner with no character has only the DM side to show.
  const showing: Tab = isOwner && (tab === 'dm' || !character) ? 'dm' : 'visions'

  return (
    <CampPanel
      headingId="camp-visions-heading"
      icon="eye"
      place="Shrine stone"
      title="The Maker’s Visions"
    >
      {isOwner && character && (
        <RibbonTabs
          active={showing}
          label="Maker’s Visions"
          onChange={setTab}
          tabs={[
            { id: 'visions', label: 'My visions', icon: 'eye' },
            { id: 'dm', label: 'DM: libraries and rests', icon: 'book' },
          ]}
        />
      )}

      {showing === 'dm' && (
        <VisionsDm campaignId={campaignId} enabled={enabled} onNotice={onNotice} userId={userId} />
      )}

      {showing === 'visions' && !character && (
        <p className="journal-status" role="status">
          The shrine is quiet. Create a character in the tent, and visions find you when the party
          rests.
        </p>
      )}
      {showing === 'visions' && character && (
        <>
          {own.length > 1 && (
            <div className="journal-field">
              <label htmlFor={pickerId}>Character</label>
              <select
                className="journal-input"
                id={pickerId}
                onChange={(event) => setPicked(event.target.value)}
                value={character.id}
              >
                {own.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                    {entry.status === 'active' ? '' : ` (${entry.status})`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <CharacterVisions
            character={character}
            enabled={enabled}
            key={character.id}
            userId={userId}
          />
        </>
      )}
    </CampPanel>
  )
}
