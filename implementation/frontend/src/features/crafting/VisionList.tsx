import { useState } from 'react'
import { CardRail } from './CardRail'
import { FragmentCard } from './FragmentCard'
import { SealedFolio } from './SealedFolio'
import { VisionCard } from './VisionCard'
import { formatRestTime, plural } from './craftingText'
import type { CharacterVisions, Vision } from './craftingTypes'
import { useSealedReveal } from './visionReveal'

/**
 * One character's guide: visions, then fragments, then saved visions (plan §6.2). New ones come
 * first and each group is by name, which the database already orders. What a rest just brought
 * arrives sealed, and the player breaks the seals to read it.
 */
export function VisionList(props: {
  characterId: string
  visions: CharacterVisions
  pending: boolean
  onToggleSaved: (vision: Vision) => void
}) {
  // The seals are read fresh for each character and each rest.
  return (
    <VisionListBody key={`${props.characterId}|${props.visions.last_rest_at ?? ''}`} {...props} />
  )
}

function VisionListBody({
  characterId,
  visions,
  pending,
  onToggleSaved,
}: {
  characterId: string
  visions: CharacterVisions
  pending: boolean
  onToggleSaved: (vision: Vision) => void
}) {
  const newIds = [
    ...visions.visions.filter((vision) => vision.new).map((vision) => vision.recipe_id),
    ...visions.fragments.filter((fragment) => fragment.new).map((fragment) => fragment.id),
  ]
  const reveal = useSealedReveal(characterId, visions.last_rest_at, newIds)
  // One seal broken alone hands focus to what it opened; breaking them all does not.
  const [focused, setFocused] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  if (visions.library_count === 0) {
    return (
      <p className="journal-status" role="status">
        Your DM hasn’t added a crafting library to this campaign.
      </p>
    )
  }
  if (!visions.last_rest_at) {
    return (
      <p className="journal-status" role="status">
        No visions yet. They come when the party takes a long rest.
      </p>
    )
  }
  const empty =
    visions.visions.length === 0 && visions.fragments.length === 0 && visions.saved.length === 0

  const visionName = (id: string) =>
    visions.visions.find((vision) => vision.recipe_id === id)?.output.name
  const sealedVisions = visions.visions.filter((vision) => reveal.sealed.has(vision.recipe_id))
  const sealedFragments = visions.fragments.filter((fragment) => reveal.sealed.has(fragment.id))

  function breakOne(id: string) {
    setFocused(id)
    setAnnouncement(
      visionName(id) ? `Vision revealed: ${visionName(id)}.` : 'Fragment revealed: unknown item.',
    )
    reveal.open(id)
  }

  function breakAll() {
    setFocused(null)
    setAnnouncement(`${plural(reveal.sealed.size, 'seal')} broken.`)
    reveal.openAll()
  }

  /** The order sealed folios open in when all at once, so their entrances stagger. */
  const staggerOf = (id: string) => [...reveal.entering].indexOf(id) * 220

  const visionCard = (vision: Vision) =>
    reveal.sealed.has(vision.recipe_id) ? (
      <SealedFolio
        key={vision.recipe_id}
        kind="vision"
        onBreak={() => breakOne(vision.recipe_id)}
      />
    ) : (
      <VisionCard
        enterDelay={staggerOf(vision.recipe_id)}
        entering={reveal.entering.has(vision.recipe_id)}
        focusOnEnter={focused === vision.recipe_id}
        key={vision.recipe_id}
        onToggleSaved={onToggleSaved}
        pending={pending}
        vision={vision}
      />
    )

  return (
    <div className="vision-list">
      <p className="crafting-sr" role="status">
        {announcement}
      </p>

      {reveal.sealed.size > 0 && (
        <div className="vision-stir">
          <p className="vision-stir__title">
            {reveal.sealed.size === 1
              ? 'One thing stirs from the rest'
              : `${reveal.sealed.size} things stir from the rest`}
          </p>
          <p className="crafting-hint">
            {sealedVisions.length > 0 &&
              `${plural(sealedVisions.length, 'vision')} ${sealedVisions.length === 1 ? 'waits' : 'wait'}`}
            {sealedVisions.length > 0 && sealedFragments.length > 0 && ' and '}
            {sealedFragments.length > 0 &&
              `${plural(sealedFragments.length, 'fragment')} ${sealedFragments.length === 1 ? 'waits' : 'wait'}`}{' '}
            behind wax. Break the seals one at a time, or all together.
          </p>
          <button
            className="journal-button journal-button--secondary"
            onClick={breakAll}
            type="button"
          >
            Break all seals
          </button>
        </div>
      )}

      <div className="vision-rest">
        <p className="crafting-hint">Last long rest: {formatRestTime(visions.last_rest_at)}.</p>
        {reveal.sealed.size === 0 && reveal.total > 0 && (
          <button
            className="journal-button journal-button--ghost"
            onClick={reveal.replay}
            type="button"
          >
            Replay the reveal
          </button>
        )}
      </div>
      {empty && (
        <p className="journal-status" role="status">
          Nothing stirred in your dreams. Carry new materials into your next rest.
        </p>
      )}

      {visions.visions.length > 0 && (
        <CardRail title={`Visions (${visions.visions.length})`}>
          {visions.visions.map(visionCard)}
        </CardRail>
      )}

      {visions.fragments.length > 0 && (
        <CardRail
          intro={
            <p className="crafting-hint">
              You hold part of {plural(visions.fragments.length, 'recipe')}. Find the rest of the
              key materials to see what each one makes.
            </p>
          }
          size="slim"
          title={`Fragments (${visions.fragments.length})`}
        >
          {visions.fragments.map((fragment) =>
            reveal.sealed.has(fragment.id) ? (
              <SealedFolio
                key={fragment.id}
                kind="fragment"
                onBreak={() => breakOne(fragment.id)}
              />
            ) : (
              <FragmentCard
                enterDelay={staggerOf(fragment.id)}
                entering={reveal.entering.has(fragment.id)}
                focusOnEnter={focused === fragment.id}
                fragment={fragment}
                key={fragment.id}
              />
            ),
          )}
        </CardRail>
      )}

      {visions.saved.length > 0 && (
        <CardRail
          intro={
            <p className="crafting-hint">
              Saved visions stay here even when a rest would hide them.
            </p>
          }
          title={`Saved (${visions.saved.length})`}
        >
          {visions.saved.map((vision) => (
            <VisionCard
              key={vision.recipe_id}
              onToggleSaved={onToggleSaved}
              pending={pending}
              vision={vision}
            />
          ))}
        </CardRail>
      )}
    </div>
  )
}
