import { useEffect, useRef, type CSSProperties } from 'react'
import { PixelIcon } from '../characters/PixelIcon'
import { rarityLabels } from '../characters/itemRarity'
import {
  formatCopper,
  lineCost,
  materialsSubtotal,
  missingCount,
  stillToPay,
  totalCost,
} from './craftingCost'
import { CountCopper } from './CountCopper'
import { categoryLabels, type Vision } from './craftingTypes'
import { plural } from './craftingText'

/** How many materials the card's face lists before it says there are more. */
const faceLines = 5

function attunementText(attunement: Vision['output']['attunement']) {
  if (attunement === true) return 'Requires attunement'
  if (typeof attunement === 'string' && attunement.trim()) {
    return `Requires attunement (${attunement.trim()})`
  }
  return null
}

/**
 * One vision: what the recipe makes, every material with how many the character holds, and what
 * is still to pay (M04 plan W9). The counts are live, so they follow the inventory.
 */
export function VisionCard({
  vision,
  pending,
  onToggleSaved,
  entering = false,
  focusOnEnter = false,
  enterDelay = 0,
}: {
  vision: Vision
  pending: boolean
  onToggleSaved: (vision: Vision) => void
  /** Just unsealed: the card plays its entrance once. */
  entering?: boolean
  /** Moves focus to the card's summary when it enters, after a single seal is broken. */
  focusOnEnter?: boolean
  /** Staggers several cards entering together, in milliseconds. */
  enterDelay?: number
}) {
  const summary = useRef<HTMLElement>(null)
  useEffect(() => {
    if (entering && focusOnEnter) summary.current?.focus()
  }, [entering, focusOnEnter])
  const { output, lines } = vision
  const subtotal = materialsSubtotal(lines)
  const total = totalCost(lines, vision.crafting_cost_cp)
  const toPay = stillToPay(lines, vision.crafting_cost_cp)
  const keys = lines.filter((line) => line.role === 'key')
  const lacking = lines.filter((line) => missingCount(line) > 0).length
  const attunement = attunementText(output.attunement)

  return (
    <li
      className={
        entering ? 'journal-panel vision-card vision-card--entering' : 'journal-panel vision-card'
      }
      data-new={vision.new || undefined}
      data-rarity={output.rarity}
      style={entering ? ({ '--enter-delay': `${enterDelay}ms` } as CSSProperties) : undefined}
    >
      <details>
        <summary ref={summary}>
          <span className="crafting-row__name">
            {output.name}
            {output.quantity > 1 && ` × ${output.quantity}`}
          </span>
          <span className="vision-face__chips">
            <span className="journal-chip journal-chip--rarity" data-rarity={output.rarity}>
              {rarityLabels[output.rarity]}
            </span>
            {vision.new && (
              <span className="journal-chip journal-chip--new">
                <PixelIcon name="star" />
                New
              </span>
            )}
            {vision.saved && <span className="journal-chip">Saved</span>}
          </span>
          <span className="crafting-row__meta vision-face__pay">
            {toPay === 0 && 'Nothing left to pay'}
            {toPay !== 0 && <CountCopper animate={entering} value={toPay} />}
            {toPay !== 0 &&
              ` still to pay${lacking > 0 ? `, ${plural(lacking, 'material')} missing` : ''}`}
          </span>
          <span className="vision-face__lines">
            {lines.slice(0, faceLines).map((line, index) => (
              <span
                className="vision-face__line"
                data-have={line.have >= line.need ? 'enough' : 'short'}
                key={`${line.role}-${line.item_id}`}
                style={{ '--line': index } as CSSProperties}
              >
                <PixelIcon
                  className="vision-have"
                  name={line.have >= line.need ? 'check' : 'cross'}
                />
                <span className="vision-face__material">{line.name}</span>
                <span className="vision-face__count">
                  {line.have} of {line.need}
                </span>
              </span>
            ))}
            {lines.length > faceLines && (
              <span className="vision-face__line vision-face__line--more">
                and {plural(lines.length - faceLines, 'more material')}
              </span>
            )}
          </span>
          <span className="vision-face__open">Recipe details</span>
        </summary>

        {output.description && <p className="crafting-text">{output.description}</p>}

        <table className="crafting-lines">
          <caption className="crafting-sr">Materials for {output.name}</caption>
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col">You hold</th>
              <th className="crafting-each" scope="col">
                Each
              </th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const enough = line.have >= line.need
              return (
                <tr
                  key={`${line.role}-${line.item_id}`}
                  style={{ '--line': index } as CSSProperties}
                >
                  <th scope="row">
                    {line.name}
                    {line.need > 1 && ` × ${line.need}`}
                    {line.role === 'key' && <span className="crafting-key"> (key)</span>}
                  </th>
                  <td data-have={enough ? 'enough' : 'short'}>
                    <PixelIcon className="vision-have" name={enough ? 'check' : 'cross'} />{' '}
                    {`have ${line.have} of ${line.need}`}
                  </td>
                  <td className="crafting-each">{formatCopper(line.value_cp)}</td>
                  <td>{formatCopper(lineCost(line))}</td>
                </tr>
              )
            })}
            <tr>
              <th scope="row">Crafting cost</th>
              <td />
              <td />
              <td>{formatCopper(vision.crafting_cost_cp)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td />
              <td>{formatCopper(subtotal)} in materials</td>
              <td>{formatCopper(total)}</td>
            </tr>
            <tr>
              <th scope="row">
                Still to pay<span className="crafting-key"> (missing materials and crafting)</span>
              </th>
              <td />
              <td />
              <td>{formatCopper(toPay)}</td>
            </tr>
          </tfoot>
        </table>
        {keys.length > 1 && (
          <p className="crafting-hint">
            Key materials: {keys.map((line) => line.name).join(', ')}.
          </p>
        )}

        <dl className="crafting-facts">
          <div>
            <dt>Makes</dt>
            <dd>
              {categoryLabels[output.category]}, worth {formatCopper(output.value_cp)}
              {output.weight !== null && `, ${output.weight} lb`}
              {output.consumable && ', consumable'}
            </dd>
          </div>
          {attunement && (
            <div>
              <dt>Attunement</dt>
              <dd>{attunement}</dd>
            </div>
          )}
          <div>
            <dt>Workdays</dt>
            <dd>{vision.workdays}</dd>
          </div>
          {vision.tools.length > 0 && (
            <div>
              <dt>Tools</dt>
              <dd>{vision.tools.join(', ')}</dd>
            </div>
          )}
          {vision.requirements && (
            <div>
              <dt>Requirements</dt>
              <dd className="crafting-text">{vision.requirements}</dd>
            </div>
          )}
          {vision.check && (
            <div>
              <dt>Check</dt>
              <dd>
                {vision.check.skill} DC {vision.check.dc}
              </dd>
            </div>
          )}
          {vision.notes && (
            <div>
              <dt>Notes</dt>
              <dd className="crafting-text">{vision.notes}</dd>
            </div>
          )}
        </dl>

        <div className="crafting-row__actions">
          <button
            aria-busy={pending || undefined}
            aria-label={`${vision.saved ? 'Remove from saved' : 'Save this vision'} (${output.name})`}
            className="journal-button journal-button--secondary"
            disabled={pending}
            onClick={() => onToggleSaved(vision)}
            type="button"
          >
            {vision.saved ? 'Remove from saved' : 'Save this vision'}
          </button>
        </div>
      </details>
    </li>
  )
}
