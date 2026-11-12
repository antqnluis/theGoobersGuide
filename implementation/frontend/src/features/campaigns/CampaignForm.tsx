import { useRef, useState, type FormEvent } from 'react'
import { validateCampaignName } from './campaignValidation'

type CampaignFormProps = {
  initialName?: string
  initialDescription?: string | null
  submitLabel: string
  isPending: boolean
  onCancel: () => void
  onSubmit: (name: string, description: string) => Promise<void>
}

export function CampaignForm({
  initialName = '',
  initialDescription = '',
  submitLabel,
  isPending,
  onCancel,
  onSubmit,
}: CampaignFormProps) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const submittingRef = useRef(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submittingRef.current) return

    const validationError = validateCampaignName(name)
    setNameError(validationError)
    if (validationError) {
      document.getElementById('campaign-name')?.focus()
      return
    }

    submittingRef.current = true
    try {
      await onSubmit(name, description)
    } finally {
      submittingRef.current = false
    }
  }

  return (
    <form className="campaign-form" onSubmit={submit}>
      <div className="campaign-form__field">
        <label htmlFor="campaign-name">Campaign name</label>
        <input
          aria-describedby={nameError ? 'campaign-name-error' : undefined}
          aria-invalid={nameError ? 'true' : undefined}
          autoComplete="off"
          autoFocus
          disabled={isPending}
          id="campaign-name"
          onChange={(event) => {
            setName(event.target.value)
            if (nameError) setNameError(null)
          }}
          required
          value={name}
        />
        {nameError && (
          <p className="campaign-form__error" id="campaign-name-error">
            {nameError}
          </p>
        )}
      </div>

      <div className="campaign-form__field">
        <label htmlFor="campaign-description">
          Description <span>(optional)</span>
        </label>
        <textarea
          aria-describedby="campaign-description-hint"
          disabled={isPending}
          id="campaign-description"
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          value={description}
        />
        <p className="campaign-form__hint" id="campaign-description-hint">
          A few words to help your group recognize the campaign.
        </p>
      </div>

      <div className="campaign-form__actions">
        <button className="auth-button" disabled={isPending} type="submit">
          {isPending ? 'Saving campaign…' : submitLabel}
        </button>
        <button
          className="campaign-text-button"
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
