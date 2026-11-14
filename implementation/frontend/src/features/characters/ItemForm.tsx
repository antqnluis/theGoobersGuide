import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { CharacterItem, CharacterItemInput, CharacterItemValues } from './characterTypes'
import { normalizeItemInput, validateItemInput, type ItemErrors } from './inventoryValidation'

type Fields = {
  name: string
  quantity: string
  weight: string
  description: string
  equipped: boolean
  attuned: boolean
}

function toFields(item?: CharacterItem): Fields {
  return {
    name: item?.name ?? '',
    quantity: String(item?.quantity ?? 1),
    weight: item?.weight == null ? '' : String(item.weight),
    description: item?.description ?? '',
    equipped: item?.equipped ?? false,
    attuned: item?.attuned ?? false,
  }
}

/** Adds or edits one item. Validates on submit; the button stays enabled until it is pending. */
export function ItemForm({
  initial,
  isPending,
  mode,
  onCancel,
  onDirtyChange,
  onSubmit,
}: {
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

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submittingRef.current) return
    const input: CharacterItemInput = {
      ...values,
      quantity: values.quantity.trim() === '' ? Number.NaN : Number(values.quantity),
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
          aria-describedby={describe('name')}
          aria-invalid={errors.name ? 'true' : undefined}
          autoComplete="off"
          className="journal-input"
          disabled={isPending}
          id={id('name')}
          onChange={(event) => change('name', event.target.value)}
          ref={nameRef}
          required
          value={values.name}
        />
        {error('name')}
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
