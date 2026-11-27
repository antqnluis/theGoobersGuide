import { rarityLabels } from '../characters/itemRarity'
import {
  formatCopper,
  lineCost,
  materialsSubtotal,
  missingCount,
  stillToPay,
  totalCost,
} from './craftingCost'
import { categoryLabels, type Vision } from './craftingTypes'
import { plural } from './craftingText'

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
}: {
  vision: Vision
  pending: boolean
  onToggleSaved: (vision: Vision) => void
}) {
  const { output, lines } = vision
  const subtotal = materialsSubtotal(lines)
  const total = totalCost(lines, vision.crafting_cost_cp)
  const toPay = stillToPay(lines, vision.crafting_cost_cp)
  const keys = lines.filter((line) => line.role === 'key')
  const lacking = lines.filter((line) => missingCount(line) > 0).length
  const attunement = attunementText(output.attunement)

  return (
    <li className="vision-card" data-new={vision.new || undefined}>
      <details>
        <summary>
          <span className="crafting-row__name">
            {output.name}
            {output.quantity > 1 && ` × ${output.quantity}`}
          </span>
          <span className="journal-chip journal-chip--rarity" data-rarity={output.rarity}>
            {rarityLabels[output.rarity]}
          </span>
          {vision.new && <span className="vision-badge">New</span>}
          {vision.saved && <span className="journal-chip">Saved</span>}
          <span className="crafting-row__meta">
            {toPay === 0
              ? 'Nothing left to pay'
              : `${formatCopper(toPay)} still to pay${lacking > 0 ? `, ${plural(lacking, 'material')} missing` : ''}`}
          </span>
        </summary>

        {output.description && <p className="crafting-text">{output.description}</p>}

        <table className="crafting-lines">
          <caption className="crafting-sr">Materials for {output.name}</caption>
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col">You hold</th>
              <th scope="col">Each</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const enough = line.have >= line.need
              return (
                <tr key={`${line.role}-${line.item_id}`}>
                  <th scope="row">
                    {line.name}
                    {line.need > 1 && ` × ${line.need}`}
                    {line.role === 'key' && <span className="crafting-key"> (key)</span>}
                  </th>
                  <td data-have={enough ? 'enough' : 'short'}>
                    <span aria-hidden="true">{enough ? '✓' : '✗'}</span>{' '}
                    {`have ${line.have} of ${line.need}`}
                  </td>
                  <td>{formatCopper(line.value_cp)}</td>
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
              <th scope="row">Still to pay</th>
              <td />
              <td>missing materials and crafting</td>
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
