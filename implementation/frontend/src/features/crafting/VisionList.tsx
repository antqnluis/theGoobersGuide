import { FragmentCard } from './FragmentCard'
import { VisionCard } from './VisionCard'
import { formatRestTime, plural } from './craftingText'
import type { CharacterVisions, Vision } from './craftingTypes'

/**
 * One character's guide: visions, then fragments, then saved visions (plan §6.2). New ones come
 * first and each group is by name, which the database already orders.
 */
export function VisionList({
  visions,
  pending,
  onToggleSaved,
}: {
  visions: CharacterVisions
  pending: boolean
  onToggleSaved: (vision: Vision) => void
}) {
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

  return (
    <div className="vision-list">
      <p className="crafting-hint">Last long rest: {formatRestTime(visions.last_rest_at)}.</p>
      {empty && (
        <p className="journal-status" role="status">
          Nothing stirred in your dreams. Carry new materials into your next rest.
        </p>
      )}

      {visions.visions.length > 0 && (
        <section aria-labelledby="visions-heading-visions">
          <h3 className="journal-section-title" id="visions-heading-visions">
            Visions ({visions.visions.length})
          </h3>
          <ul className="crafting-list">
            {visions.visions.map((vision) => (
              <VisionCard
                key={vision.recipe_id}
                onToggleSaved={onToggleSaved}
                pending={pending}
                vision={vision}
              />
            ))}
          </ul>
        </section>
      )}

      {visions.fragments.length > 0 && (
        <section aria-labelledby="visions-heading-fragments">
          <h3 className="journal-section-title" id="visions-heading-fragments">
            Fragments ({visions.fragments.length})
          </h3>
          <p className="crafting-hint">
            You hold part of {plural(visions.fragments.length, 'recipe')}. Find the rest of the key
            materials to see what each one makes.
          </p>
          <ul className="crafting-list">
            {visions.fragments.map((fragment) => (
              <FragmentCard fragment={fragment} key={fragment.id} />
            ))}
          </ul>
        </section>
      )}

      {visions.saved.length > 0 && (
        <section aria-labelledby="visions-heading-saved">
          <h3 className="journal-section-title" id="visions-heading-saved">
            Saved ({visions.saved.length})
          </h3>
          <p className="crafting-hint">Saved visions stay here even when a rest would hide them.</p>
          <ul className="crafting-list">
            {visions.saved.map((vision) => (
              <VisionCard
                key={vision.recipe_id}
                onToggleSaved={onToggleSaved}
                pending={pending}
                vision={vision}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
