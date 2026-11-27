import { useQuery } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import { itemRarities } from '../characters/characterTypes'
import { rarityLabels } from '../characters/itemRarity'
import {
  describeGuideline,
  formatCopper,
  lineCost,
  materialsSubtotal,
  totalCost,
  type CostLine,
} from './craftingCost'
import {
  allTags,
  byName,
  filterItems,
  filterRecipes,
  indexLibrary,
  noFilters,
  unsourcedKeyMaterials,
  type BrowserFilters,
  type LibraryIndex,
} from './craftingLibrary'
import { libraryContentOptions } from './craftingQueries'
import {
  categoryLabels,
  craftingCategories,
  type CraftingLibrary,
  type LibraryContent,
  type LibraryItem,
  type LibraryRecipe,
} from './craftingTypes'
import { RibbonTabs } from './RibbonTabs'
import './crafting.css'

const pageStep = 100

/** An item's own line: name, rarity, category, value, and what is only for the DM. */
function ItemRow({ item }: { item: LibraryItem }) {
  const attunement = item.attunement
    ? item.attunement_note
      ? `Requires attunement ${item.attunement_note}`
      : 'Requires attunement'
    : null
  const harvest = item.harvest
  return (
    <li className="journal-panel crafting-row">
      <details>
        <summary>
          <span className="crafting-row__name">{item.name}</span>
          <span className="journal-chip journal-chip--rarity" data-rarity={item.rarity}>
            {rarityLabels[item.rarity]}
          </span>
          <span className="crafting-row__meta">
            {categoryLabels[item.category]} · {formatCopper(item.value_cp)}
          </span>
        </summary>
        <dl className="crafting-facts">
          <div>
            <dt>Id</dt>
            <dd>
              <code>{item.slug}</code>
            </dd>
          </div>
          {item.weight !== null && (
            <div>
              <dt>Weight</dt>
              <dd>{item.weight.toLocaleString('en-US')} lb</dd>
            </div>
          )}
          {item.consumable && (
            <div>
              <dt>Consumable</dt>
              <dd>Yes</dd>
            </div>
          )}
          {attunement && (
            <div>
              <dt>Attunement</dt>
              <dd>{attunement}</dd>
            </div>
          )}
          {item.description && (
            <div>
              <dt>Description</dt>
              <dd className="crafting-text">{item.description}</dd>
            </div>
          )}
          {item.tags.length > 0 && (
            <div>
              <dt>Tags</dt>
              <dd>{item.tags.join(', ')}</dd>
            </div>
          )}
        </dl>
        {(item.source || harvest || item.dm_notes) && (
          <div className="crafting-dm">
            <p className="journal-eyebrow">Only you see this</p>
            <dl className="crafting-facts">
              {item.source && (
                <div>
                  <dt>Source</dt>
                  <dd>{item.source}</dd>
                </div>
              )}
              {harvest && (
                <div>
                  <dt>Harvest</dt>
                  <dd>
                    {[
                      harvest.from?.length ? `from ${harvest.from.join(', ')}` : null,
                      harvest.skill ? harvest.skill : null,
                      harvest.dc ? `DC ${harvest.dc}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {harvest.notes && <span className="crafting-text"> {harvest.notes}</span>}
                  </dd>
                </div>
              )}
              {item.dm_notes && (
                <div>
                  <dt>DM notes</dt>
                  <dd className="crafting-text">{item.dm_notes}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </details>
    </li>
  )
}

type RecipeView = {
  output: LibraryItem
  lines: Array<CostLine & { name: string; role: 'key' | 'other'; item: LibraryItem }>
}

function viewOf(recipe: LibraryRecipe, index: LibraryIndex): RecipeView | null {
  const output = index.byId.get(recipe.output_item_id)
  if (!output) return null
  const lines = recipe.lines.flatMap((line) => {
    const item = index.byId.get(line.item_id)
    // `have: 0` is what a player holding nothing would see.
    return item
      ? [
          {
            name: item.name,
            role: line.role,
            item,
            value_cp: item.value_cp,
            need: line.quantity,
            have: 0,
          },
        ]
      : []
  })
  return { output, lines }
}

/** One recipe, with every field, the cost against the DMG guideline, and a player's-eye preview. */
function RecipeRow({ recipe, index }: { recipe: LibraryRecipe; index: LibraryIndex }) {
  const [asPlayer, setAsPlayer] = useState(false)
  const view = viewOf(recipe, index)
  if (!view) return null
  const { output, lines } = view
  const total = totalCost(lines, recipe.crafting_cost_cp)
  const guideline = describeGuideline(output.rarity, output.consumable, rarityLabels[output.rarity])
  const unsourced = unsourcedKeyMaterials(recipe, index)
  const keys = lines.filter((line) => line.role === 'key')

  return (
    <li className="journal-panel crafting-row">
      <details>
        <summary>
          <span className="crafting-row__name">
            {output.name}
            {recipe.output_quantity > 1 && ` × ${recipe.output_quantity}`}
          </span>
          <span className="journal-chip journal-chip--rarity" data-rarity={output.rarity}>
            {rarityLabels[output.rarity]}
          </span>
          <span className="crafting-row__meta">
            Key:{' '}
            {keys.map((line) => `${line.name}${line.need > 1 ? ` × ${line.need}` : ''}`).join(', ')}
          </span>
        </summary>

        {!asPlayer && unsourced.length > 0 && (
          <p className="journal-status crafting-warning">
            No known source for {unsourced.map((item) => item.name).join(', ')}: no recipe makes it
            and it has no harvest data, so a player may never find it.
          </p>
        )}

        <div className="crafting-row__actions">
          <button
            aria-pressed={asPlayer}
            className="journal-button journal-button--secondary"
            onClick={() => setAsPlayer((value) => !value)}
            type="button"
          >
            {asPlayer ? 'Show everything' : 'Preview as a player'}
          </button>
        </div>

        <table className="crafting-lines">
          <caption className="crafting-sr">Materials for {output.name}</caption>
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col">Needed</th>
              <th scope="col">Each</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.item.id}>
                <th scope="row">
                  {line.name}
                  {line.role === 'key' && <span className="crafting-key"> (key)</span>}
                </th>
                <td>{line.need}</td>
                <td>{formatCopper(line.value_cp)}</td>
                <td>{formatCopper(lineCost(line))}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Crafting cost</th>
              <td />
              <td />
              <td>{formatCopper(recipe.crafting_cost_cp)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{asPlayer ? 'Total, with nothing in hand' : 'Total'}</th>
              <td />
              <td>{formatCopper(materialsSubtotal(lines))} in materials</td>
              <td>{formatCopper(total)}</td>
            </tr>
          </tfoot>
        </table>
        {guideline && <p className="crafting-hint">{guideline}</p>}

        <dl className="crafting-facts">
          <div>
            <dt>Workdays</dt>
            <dd>{recipe.workdays}</dd>
          </div>
          {recipe.tools.length > 0 && (
            <div>
              <dt>Tools</dt>
              <dd>{recipe.tools.join(', ')}</dd>
            </div>
          )}
          {recipe.requirements && (
            <div>
              <dt>Requirements</dt>
              <dd className="crafting-text">{recipe.requirements}</dd>
            </div>
          )}
          {recipe.check_skill && recipe.check_dc && (
            <div>
              <dt>Check</dt>
              <dd>
                {recipe.check_skill} DC {recipe.check_dc}
              </dd>
            </div>
          )}
          {recipe.notes && (
            <div>
              <dt>Notes</dt>
              <dd className="crafting-text">{recipe.notes}</dd>
            </div>
          )}
        </dl>
        {!asPlayer && (recipe.source || recipe.dm_notes) && (
          <div className="crafting-dm">
            <p className="journal-eyebrow">Only you see this</p>
            <dl className="crafting-facts">
              <div>
                <dt>Id</dt>
                <dd>
                  <code>{recipe.slug}</code>
                </dd>
              </div>
              {recipe.source && (
                <div>
                  <dt>Source</dt>
                  <dd>{recipe.source}</dd>
                </div>
              )}
              {recipe.dm_notes && (
                <div>
                  <dt>DM notes</dt>
                  <dd className="crafting-text">{recipe.dm_notes}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </details>
    </li>
  )
}

function Browser({ content }: { content: LibraryContent }) {
  const searchId = useId()
  const categoryId = useId()
  const rarityId = useId()
  const tagId = useId()
  const [tab, setTab] = useState<'items' | 'recipes'>('items')
  const [filters, setFilters] = useState<BrowserFilters>(noFilters)
  const [shown, setShown] = useState(pageStep)
  const index = useMemo(() => indexLibrary(content), [content])
  const tags = useMemo(() => allTags(content.items), [content.items])

  const items = useMemo(() => byName(filterItems(content.items, filters)), [content.items, filters])
  const recipes = useMemo(
    () =>
      filterRecipes(content.recipes, index, filters).toSorted((a, b) =>
        (index.byId.get(a.output_item_id)?.name ?? '').localeCompare(
          index.byId.get(b.output_item_id)?.name ?? '',
          'en',
          { sensitivity: 'base' },
        ),
      ),
    [content.recipes, index, filters],
  )

  const change = (patch: Partial<BrowserFilters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setShown(pageStep)
  }
  const filtered = filters.query || filters.category || filters.rarity || filters.tag
  const rows = tab === 'items' ? items : recipes

  return (
    <>
      <RibbonTabs
        active={tab}
        label="Browse"
        onChange={(id) => {
          setTab(id)
          setShown(pageStep)
        }}
        tabs={[
          {
            id: 'items',
            label: `Items (${content.items.length.toLocaleString('en-US')})`,
            icon: 'pack',
          },
          {
            id: 'recipes',
            label: `Recipes (${content.recipes.length.toLocaleString('en-US')})`,
            icon: 'quill',
          },
        ]}
      />

      <div className="crafting-filters">
        <div className="journal-field">
          <label htmlFor={searchId}>Search</label>
          <input
            autoComplete="off"
            className="journal-input"
            id={searchId}
            onChange={(event) => change({ query: event.target.value })}
            placeholder={tab === 'items' ? 'Name, id, or tag' : 'Output or material'}
            type="search"
            value={filters.query}
          />
        </div>
        <div className="journal-field">
          <label htmlFor={categoryId}>Category</label>
          <select
            className="journal-select"
            id={categoryId}
            onChange={(event) => change({ category: event.target.value })}
            value={filters.category}
          >
            <option value="">Any</option>
            {craftingCategories.map((category) => (
              <option key={category} value={category}>
                {categoryLabels[category]}
              </option>
            ))}
          </select>
        </div>
        <div className="journal-field">
          <label htmlFor={rarityId}>Rarity</label>
          <select
            className="journal-select"
            id={rarityId}
            onChange={(event) => change({ rarity: event.target.value })}
            value={filters.rarity}
          >
            <option value="">Any</option>
            {itemRarities.map((rarity) => (
              <option key={rarity} value={rarity}>
                {rarityLabels[rarity]}
              </option>
            ))}
          </select>
        </div>
        {tags.length > 0 && (
          <div className="journal-field">
            <label htmlFor={tagId}>Tag</label>
            <select
              className="journal-select"
              id={tagId}
              onChange={(event) => change({ tag: event.target.value })}
              value={filters.tag}
            >
              <option value="">Any</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="journal-status" role="status">
          {filtered
            ? `No ${tab} match these filters.`
            : tab === 'items'
              ? 'This library has no items yet. Import a pack to add some.'
              : 'This library has no recipes yet. Import a pack to add some.'}
        </p>
      ) : (
        <>
          <p className="crafting-count" role="status">
            {filtered
              ? `${rows.length.toLocaleString('en-US')} of ${(tab === 'items' ? content.items : content.recipes).length.toLocaleString('en-US')} ${tab}`
              : `${rows.length.toLocaleString('en-US')} ${tab}`}
          </p>
          <ul className="crafting-list">
            {tab === 'items'
              ? items.slice(0, shown).map((item) => <ItemRow item={item} key={item.id} />)
              : recipes
                  .slice(0, shown)
                  .map((recipe) => <RecipeRow index={index} key={recipe.id} recipe={recipe} />)}
          </ul>
          {rows.length > shown && (
            <button
              className="journal-button journal-button--secondary"
              onClick={() => setShown((count) => count + pageStep)}
              type="button"
            >
              Show {Math.min(pageStep, rows.length - shown)} more
            </button>
          )}
        </>
      )}
    </>
  )
}

/**
 * Browse one whole library, with every field including the ones players never see (plan §6.1).
 * The DM reads the catalogue here, never a character's guide (W16).
 */
export function LibraryBrowser({
  library,
  userId,
  onBack,
}: {
  library: CraftingLibrary
  userId: string
  onBack: () => void
}) {
  const content = useQuery(libraryContentOptions(library.id, userId))

  return (
    <div className="library-browser">
      <button className="journal-button journal-button--ghost" onClick={onBack} type="button">
        Back to libraries
      </button>
      <h3 className="journal-section-title">{library.name}</h3>
      {library.description && <p className="crafting-text">{library.description}</p>}
      {content.isPending && (
        <p className="journal-status" role="status">
          Loading the library…
        </p>
      )}
      {content.isError && (
        <div className="journal-status journal-status--error" role="alert">
          <p>The library could not be loaded.</p>
          <button
            className="journal-button journal-button--secondary"
            onClick={() => void content.refetch()}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
      {content.data && <Browser content={content.data} />}
    </div>
  )
}
