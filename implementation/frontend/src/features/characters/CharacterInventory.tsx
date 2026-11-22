import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { characterItemsOptions } from './characterQueries'
import type { CharacterItem, CharacterItemValues } from './characterTypes'
import {
  attunedCount,
  attunementWarning,
  carriedWeight,
  formatWeight,
  sortItems,
} from './inventoryRules'
import { ItemForm } from './ItemForm'
import type { useCharacterActions } from './useCharacterActions'
import { DiceText } from '../dice/TextWithDice'

export type InventoryActions = Pick<
  ReturnType<typeof useCharacterActions>,
  | 'addItem'
  | 'editItem'
  | 'changeItemFlag'
  | 'changeItemQuantity'
  | 'removeItem'
  | 'pendingAction'
  | 'pendingCharacterId'
  | 'pendingItemId'
>

type Editing = { type: 'add' } | { type: 'edit'; id: string }

/** A character's items. Owners add, edit, equip, count, and remove; everyone else only reads. */
export function CharacterInventory({
  actions,
  capacity,
  characterId,
  characterName,
  onFormDirtyChange,
  onNotice,
  userId,
}: {
  /** Present only for the owner; without it the list is read-only. */
  actions?: InventoryActions
  /** Carrying capacity in pounds, shown beside the carried weight. */
  capacity: number
  characterId: string
  characterName: string
  /** Reports whether an open item form holds unsaved input. */
  onFormDirtyChange?: (dirty: boolean) => void
  onNotice?: (notice: string) => void
  userId: string
}) {
  const query = useQuery(characterItemsOptions(characterId, userId))
  const [editing, setEditing] = useState<Editing | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  // Bumped when focus should return to "Add item" once it is back on screen.
  const [refocusAdd, setRefocusAdd] = useState(0)
  useEffect(() => {
    if (refocusAdd > 0) addRef.current?.focus()
  }, [refocusAdd])

  if (query.isPending) {
    return (
      <p className="journal-status" role="status">
        Loading inventory…
      </p>
    )
  }
  if (query.isError) {
    return (
      <div className="journal-status journal-status--error" role="alert">
        <p>The inventory could not be loaded.</p>
        <button
          className="journal-button journal-button--secondary"
          onClick={() => query.refetch()}
          type="button"
        >
          Try again
        </button>
      </div>
    )
  }

  const items = sortItems(query.data)
  const owner = Boolean(actions)
  const weight = carriedWeight(items)
  const warning = attunementWarning(items)
  const pendingHere = actions?.pendingCharacterId === characterId
  const addPending = pendingHere && actions?.pendingAction === 'item-add'

  async function add(values: CharacterItemValues) {
    if (!actions) return false
    const ok = await actions.addItem(characterId, values)
    if (ok) {
      setEditing(null)
      onNotice?.(`Added ${values.name}.`)
      setRefocusAdd((count) => count + 1)
    }
    return ok
  }

  return (
    <div className="inventory">
      <p className="inventory__summary">
        <span>
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
        <span data-over={weight > capacity || undefined}>
          Carrying {formatWeight(weight)} of {formatWeight(capacity)}
          {weight > capacity ? ' (over capacity)' : ''}
        </span>
        <span>Attuned {attunedCount(items)} of 3</span>
      </p>
      {warning && (
        <p className="inventory__warning" role="status">
          {warning}
        </p>
      )}

      {owner && editing?.type === 'add' ? (
        <ItemForm
          isPending={addPending}
          mode="add"
          onCancel={() => {
            setEditing(null)
            setRefocusAdd((count) => count + 1)
          }}
          onDirtyChange={onFormDirtyChange}
          onSubmit={add}
        />
      ) : (
        owner && (
          <button
            className="journal-button journal-button--secondary inventory__add"
            onClick={() => {
              setRemoving(null)
              setEditing({ type: 'add' })
            }}
            ref={addRef}
            type="button"
          >
            Add item
          </button>
        )
      )}

      {items.length === 0 ? (
        <p className="sheet-empty">No items yet.</p>
      ) : (
        <ul
          className="inventory-list sheet-resizable"
          // A long list starts at a set height (and scrolls) so its drag handle is within reach.
          style={items.length > 8 ? { height: '36rem' } : undefined}
          tabIndex={0}
        >
          {items.map((item) => (
            <InventoryRow
              actions={actions}
              characterId={characterId}
              characterName={characterName}
              editing={editing?.type === 'edit' && editing.id === item.id}
              item={item}
              key={item.id}
              onEdit={(open) => {
                setRemoving(null)
                setEditing(open ? { type: 'edit', id: item.id } : null)
              }}
              onFormDirtyChange={onFormDirtyChange}
              onNotice={onNotice}
              onRemoving={(open) => setRemoving(open ? item.id : null)}
              removing={removing === item.id}
              addFocus={() => setRefocusAdd((count) => count + 1)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function InventoryRow({
  actions,
  addFocus,
  characterId,
  characterName,
  editing,
  item,
  onEdit,
  onFormDirtyChange,
  onNotice,
  onRemoving,
  removing,
}: {
  actions?: InventoryActions
  addFocus: () => void
  characterId: string
  characterName: string
  editing: boolean
  item: CharacterItem
  onEdit: (open: boolean) => void
  onFormDirtyChange?: (dirty: boolean) => void
  onNotice?: (notice: string) => void
  onRemoving: (open: boolean) => void
  removing: boolean
}) {
  const editRef = useRef<HTMLButtonElement>(null)
  const removeRef = useRef<HTMLButtonElement>(null)
  const pending = actions?.pendingCharacterId === characterId && actions.pendingItemId === item.id
  const pendingAction = pending ? actions?.pendingAction : null
  // Quantity taps may repeat while one is saving; everything else waits for the save.
  const quantityLocked = pending && pendingAction !== 'item-quantity'
  const locked = pending

  // Focus returns to the control that opened a form or a confirmation once it closes.
  const wasEditing = useRef(false)
  const wasRemoving = useRef(false)
  useEffect(() => {
    if (wasEditing.current && !editing) editRef.current?.focus()
    wasEditing.current = editing
  }, [editing])
  useEffect(() => {
    if (wasRemoving.current && !removing) removeRef.current?.focus()
    wasRemoving.current = removing
  }, [removing])

  if (editing && actions) {
    return (
      <li className="inventory-item inventory-item--editing">
        <ItemForm
          // A refetch after a conflict brings the latest version, so the form starts over.
          initial={item}
          isPending={pendingAction === 'item-edit'}
          key={item.updated_at}
          mode="edit"
          onCancel={() => onEdit(false)}
          onDirtyChange={onFormDirtyChange}
          onSubmit={async (values) => {
            const ok = await actions.editItem(characterId, item, values)
            if (ok) {
              onEdit(false)
              onNotice?.(`Saved ${values.name}.`)
            }
            return ok
          }}
        />
      </li>
    )
  }

  return (
    <li className="inventory-item" data-equipped={item.equipped || undefined}>
      <div className="inventory-item__head">
        <strong className="inventory-item__name">{item.name}</strong>
        <ul className="journal-chips inventory-item__badges">
          {item.equipped && <li className="journal-chip journal-chip--active">Equipped</li>}
          {item.attuned && <li className="journal-chip journal-chip--party">Attuned</li>}
        </ul>
      </div>
      <p className="inventory-item__meta">
        <span>Quantity {item.quantity.toLocaleString('en-US')}</span>
        {item.weight !== null && <span>{formatWeight(item.weight)} each</span>}
      </p>
      {item.description && (
        <details className="inventory-item__details">
          <summary>Description</summary>
          <p className="sheet-text">
            <DiceText context={item.name} text={item.description} />
          </p>
        </details>
      )}

      {actions && !removing && (
        <div className="inventory-item__controls">
          <div className="inventory-item__count" role="group" aria-label={`${item.name} quantity`}>
            <button
              aria-label={`Use one ${item.name}`}
              className="journal-button journal-button--secondary inventory-item__step"
              disabled={quantityLocked || item.quantity <= 0}
              onClick={() => void actions.changeItemQuantity(characterId, item.id, -1)}
              type="button"
            >
              −
            </button>
            <output aria-live="polite">{item.quantity}</output>
            <button
              aria-label={`Add one ${item.name}`}
              className="journal-button journal-button--secondary inventory-item__step"
              disabled={quantityLocked || item.quantity >= 9999}
              onClick={() => void actions.changeItemQuantity(characterId, item.id, 1)}
              type="button"
            >
              +
            </button>
          </div>
          <button
            aria-pressed={item.equipped}
            className="journal-button journal-button--secondary"
            disabled={locked}
            onClick={() =>
              void actions.changeItemFlag(characterId, item.id, 'equipped', !item.equipped)
            }
            type="button"
          >
            {item.equipped ? `Unequip ${item.name}` : `Equip ${item.name}`}
          </button>
          <button
            aria-pressed={item.attuned}
            className="journal-button journal-button--secondary"
            disabled={locked}
            onClick={() =>
              void actions.changeItemFlag(characterId, item.id, 'attuned', !item.attuned)
            }
            type="button"
          >
            {item.attuned ? `End attunement to ${item.name}` : `Attune ${item.name}`}
          </button>
          <button
            aria-label={`Edit ${item.name}`}
            className="journal-button journal-button--ghost"
            disabled={locked}
            onClick={() => onEdit(true)}
            ref={editRef}
            type="button"
          >
            Edit
          </button>
          <button
            aria-label={`Remove ${item.name}`}
            className="journal-button journal-button--danger"
            disabled={locked}
            onClick={() => onRemoving(true)}
            ref={removeRef}
            type="button"
          >
            Remove
          </button>
        </div>
      )}

      {actions && removing && (
        <div aria-label={`Confirm removing ${item.name}`} className="journal-confirm" role="group">
          <p>
            Remove <strong>{item.name}</strong> from {characterName}&rsquo;s inventory?
          </p>
          <div className="journal-actions">
            <button
              aria-busy={pendingAction === 'item-delete' || undefined}
              autoFocus
              className="journal-button journal-button--solid-danger"
              disabled={pending}
              onClick={async () => {
                if (await actions.removeItem(characterId, item.id)) {
                  onNotice?.(`Removed ${item.name}.`)
                  onRemoving(false)
                  addFocus()
                }
              }}
              type="button"
            >
              {pendingAction === 'item-delete' ? 'Removing…' : 'Yes, remove item'}
            </button>
            <button
              className="journal-button journal-button--ghost"
              disabled={pending}
              onClick={() => onRemoving(false)}
              type="button"
            >
              Keep item
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
