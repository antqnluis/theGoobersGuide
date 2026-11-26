import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { formatCopper } from '../crafting/craftingCost'
import type { ItemSuggestion } from '../crafting/craftingTypes'
import { useItemSuggestions } from '../crafting/useItemSuggestions'
import {
  itemRarities,
  type CharacterItem,
  type CharacterItemInput,
  type CharacterItemValues,
  type ItemRarity,
} from './characterTypes'
import { rarityLabels, toRarity } from './itemRarity'
import { normalizeItemInput, validateItemInput, type ItemErrors } from './inventoryValidation'

type Fields = {
  name: string
  quantity: string
  weight: string
  description: string
  rarity: ItemRarity
  equipped: boolean
  attuned: boolean
  /** The catalogue item this one is linked to, if any. */
  craftingItemId: string | null
}

function toFields(item?: CharacterItem): Fields {
  return {
    name: item?.name ?? '',
    quantity: String(item?.quantity ?? 1),
    weight: item?.weight == null ? '' : String(item.weight),
    description: item?.description ?? '',
    rarity: item?.rarity ?? 'common',
    equipped: item?.equipped ?? false,
    attuned: item?.attuned ?? false,
    craftingItemId: item?.crafting_item_id ?? null,
  }
}

/** Adds or edits one item. Validates on submit; the button stays enabled until it is pending. */
export function ItemForm({
  characterId,
  initial,
  isPending,
  mode,
  onCancel,
  onDirtyChange,
  onSubmit,
}: {
  /**
   * The character the item belongs to. With it, the name field suggests catalogue items and the
   * form can link or unlink the item; without it, the form leaves the link as it is.
   */
  characterId?: string
  initial?: CharacterItem
  isPending: boolean
  mode: 'add' | 'edit'
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
  /** Resolves to whether the item was saved. */
  onSubmit: (values: CharacterItemValues) => Promise<boolean>
}) {
  const base = useId()
  const [saved] = useState(() => toFields(initial))
  const [values, setValues] = useState<Fields>(saved)
  const [errors, setErrors] = useState<ItemErrors>({})
  const submittingRef = useRef(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // Suggestions are offered only while the item is not already linked; unlink to look again.
  const { suggestions, isSearching } = useItemSuggestions(
    characterId,
    values.name,
    suggestOpen && values.craftingItemId === null,
  )
  const showSuggestions = suggestOpen && suggestions.length > 0

  const dirty = (Object.keys(values) as (keyof Fields)[]).some(
    (field) => values[field] !== saved[field],
  )
  const reportRef = useRef(onDirtyChange)
  useEffect(() => {
    reportRef.current = onDirtyChange
  })
  useEffect(() => {
    reportRef.current?.(dirty)
  }, [dirty])
  useEffect(() => () => reportRef.current?.(false), [])

  // The form is opened on purpose, so keyboard focus goes straight to its first field.
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const id = (field: string) => `${base}-${field}`
  const change = <K extends keyof Fields>(field: K, value: Fields[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  /** Fills the name, rarity, and (when the catalogue has them) weight and description, and links. */
  function pick(suggestion: ItemSuggestion) {
    setValues((current) => ({
      ...current,
      name: suggestion.name,
      rarity: toRarity(suggestion.rarity),
      weight: suggestion.weight === null ? current.weight : String(suggestion.weight),
      description: suggestion.description ?? current.description,
      craftingItemId: suggestion.id,
    }))
    setErrors((current) => ({
      ...current,
      name: undefined,
      weight: undefined,
      description: undefined,
    }))
    setSuggestOpen(false)
    setActiveIndex(-1)
  }

  function onNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index) => (index + step + suggestions.length) % suggestions.length)
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      pick(suggestions[activeIndex])
    } else if (event.key === 'Escape') {
      // Closes the list, not the journal behind it.
      event.preventDefault()
      event.stopPropagation()
      setSuggestOpen(false)
      setActiveIndex(-1)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submittingRef.current) return
    const { craftingItemId, ...fields } = values
    const input: CharacterItemInput = {
      ...fields,
      quantity: values.quantity.trim() === '' ? Number.NaN : Number(values.quantity),
      // Only a form that can search can also link, so only it speaks for the link.
      ...(characterId ? { crafting_item_id: craftingItemId } : {}),
    }
    const found = validateItemInput(input)
    setErrors(found)
    const first = (['name', 'quantity', 'weight', 'description'] as const).find(
      (field) => found[field],
    )
    if (first) {
      document.getElementById(id(first))?.focus()
      return
    }
    submittingRef.current = true
    try {
      await onSubmit(normalizeItemInput(input))
    } finally {
      submittingRef.current = false
    }
  }

  const describe = (field: keyof ItemErrors) => (errors[field] ? `${id(field)}-error` : undefined)
  const error = (field: keyof ItemErrors) =>
    errors[field] && (
      <p className="journal-error" id={`${id(field)}-error`}>
        {errors[field]}
      </p>
    )

  return (
    <form
      aria-label={mode === 'add' ? 'Add an item' : `Edit ${initial?.name ?? 'item'}`}
      className="item-form"
      noValidate
      onSubmit={submit}
    >
      <div className="journal-field item-form__name">
        <label htmlFor={id('name')}>Name</label>
        <input
          aria-activedescendant={
            showSuggestions && activeIndex >= 0 ? id(`suggestion-${activeIndex}`) : undefined
          }
          aria-autocomplete={characterId ? 'list' : undefined}
          aria-controls={showSuggestions ? id('suggestions') : undefined}
          aria-describedby={describe('name')}
          aria-expanded={characterId ? showSuggestions : undefined}
          aria-invalid={errors.name ? 'true' : undefined}
          autoComplete="off"
          className="journal-input"
          disabled={isPending}
          id={id('name')}
          onBlur={() => setSuggestOpen(false)}
          onChange={(event) => {
            change('name', event.target.value)
            setSuggestOpen(true)
            setActiveIndex(-1)
          }}
          onKeyDown={onNameKeyDown}
          ref={nameRef}
          required
          role={characterId ? 'combobox' : undefined}
          value={values.name}
        />
        {error('name')}
        {characterId && values.craftingItemId && (
          <p className="item-form__link">
            <span className="journal-chip journal-chip--active">Linked to the catalogue</span>
            <button
              className="journal-button journal-button--ghost"
              disabled={isPending}
              onClick={() => change('craftingItemId', null)}
              type="button"
            >
              Unlink
            </button>
          </p>
        )}
        {isSearching && (
          <p className="item-form__hint" role="status">
            Searching the catalogue…
          </p>
        )}
        {showSuggestions && (
          <ul
            aria-label="Catalogue suggestions"
            className="item-suggestions"
            id={id('suggestions')}
            role="listbox"
          >
            {suggestions.map((suggestion, index) => (
              <li
                aria-selected={index === activeIndex}
                className="item-suggestions__option"
                id={id(`suggestion-${index}`)}
                key={suggestion.id}
                onMouseDown={(event) => {
                  // Keep focus in the field, so picking doesn't close the list first.
                  event.preventDefault()
                  pick(suggestion)
                }}
                role="option"
              >
                <span className="item-suggestions__name">{suggestion.name}</span>
                <span className="item-suggestions__meta">
                  {rarityLabels[toRarity(suggestion.rarity)]} · {formatCopper(suggestion.value_cp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="journal-field">
        <label htmlFor={id('quantity')}>Quantity</label>
        <input
          aria-describedby={describe('quantity')}
          aria-invalid={errors.quantity ? 'true' : undefined}
          className="journal-input"
          disabled={isPending}
          id={id('quantity')}
          inputMode="numeric"
          onChange={(event) => change('quantity', event.target.value)}
          value={values.quantity}
        />
        {error('quantity')}
      </div>
      <div className="journal-field">
        <label htmlFor={id('weight')}>
          Weight, lb <span>(optional, each)</span>
        </label>
        <input
          aria-describedby={describe('weight')}
          aria-invalid={errors.weight ? 'true' : undefined}
          autoComplete="off"
          className="journal-input"
          disabled={isPending}
          id={id('weight')}
          inputMode="decimal"
          onChange={(event) => change('weight', event.target.value)}
          value={values.weight}
        />
        {error('weight')}
      </div>
      <div className="journal-field">
        <label htmlFor={id('rarity')}>Rarity</label>
        <select
          className="journal-select"
          disabled={isPending}
          id={id('rarity')}
          onChange={(event) => change('rarity', event.target.value as ItemRarity)}
          value={values.rarity}
        >
          {itemRarities.map((rarity) => (
            <option key={rarity} value={rarity}>
              {rarityLabels[rarity]}
            </option>
          ))}
        </select>
      </div>
      <div className="journal-field item-form__description">
        <label htmlFor={id('description')}>
          Description <span>(optional)</span>
        </label>
        <textarea
          aria-describedby={describe('description')}
          aria-invalid={errors.description ? 'true' : undefined}
          className="journal-input"
          disabled={isPending}
          id={id('description')}
          onChange={(event) => change('description', event.target.value)}
          rows={3}
          value={values.description}
        />
        {error('description')}
      </div>
      <div className="item-form__flags">
        <div className="journal-check">
          <input
            checked={values.equipped}
            disabled={isPending}
            id={id('equipped')}
            onChange={(event) => change('equipped', event.target.checked)}
            type="checkbox"
          />
          <label htmlFor={id('equipped')}>Equipped</label>
        </div>
        <div className="journal-check">
          <input
            checked={values.attuned}
            disabled={isPending}
            id={id('attuned')}
            onChange={(event) => change('attuned', event.target.checked)}
            type="checkbox"
          />
          <label htmlFor={id('attuned')}>Attuned</label>
        </div>
      </div>
      <div className="journal-actions item-form__actions">
        <button
          aria-busy={isPending || undefined}
          className="journal-button"
          disabled={isPending}
          type="submit"
        >
          {isPending ? 'Saving…' : mode === 'add' ? 'Add item' : 'Save item'}
        </button>
        <button
          className="journal-button journal-button--ghost"
          disabled={isPending}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
