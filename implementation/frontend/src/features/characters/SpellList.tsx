import { DiceText } from '../dice/TextWithDice'
import { parseSpells } from './spellFormat'

/**
 * The spells field laid out as a spell book: a card per group (cantrips, each spell level)
 * with its slots, and a list of spells. Text it cannot place is shown as written.
 */
export function SpellList({
  text,
  characterId,
  rollable = true,
}: {
  text: string
  characterId?: string | null
  /** False on another player's sheet: dice notation stays plain text. */
  rollable?: boolean
}) {
  const blocks = parseSpells(text)
  if (blocks.length === 0) return <p className="sheet-text">Nothing recorded.</p>

  return (
    <div className="spell-book">
      {blocks.map((block, index) =>
        block.kind === 'text' ? (
          <p className="sheet-text spell-book__text" key={index}>
            <DiceText characterId={characterId} rollable={rollable} text={block.text} />
          </p>
        ) : (
          <section
            aria-label={block.title || 'Other spells'}
            className="spell-group"
            data-cantrip={block.mark === 'C' || undefined}
            key={index}
          >
            <header className="spell-group__head">
              {block.mark && (
                <span aria-hidden="true" className="spell-group__mark">
                  {block.mark}
                </span>
              )}
              <h4>{block.title || 'Other spells'}</h4>
              {block.slots && <span className="spell-group__slots">{block.slots}</span>}
              <span className="spell-group__count">
                {block.spells.length} {block.spells.length === 1 ? 'spell' : 'spells'}
              </span>
            </header>
            <ul className="spell-group__list">
              {block.spells.map((spell, at) => (
                <li key={`${spell.name}:${at}`}>
                  <span className="spell-group__name">{spell.name}</span>
                  {spell.detail && (
                    <span className="spell-group__detail">
                      <DiceText
                        characterId={characterId}
                        context={spell.name}
                        rollable={rollable}
                        text={spell.detail}
                      />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  )
}
