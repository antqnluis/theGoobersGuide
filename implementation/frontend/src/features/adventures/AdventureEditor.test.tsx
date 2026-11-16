import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdventureEditor } from './AdventureEditor'
import { adventure } from './adventureTestData'

afterEach(cleanup)

const base = adventure({
  id: 'a1',
  title: 'Find the heir',
  description: 'Somebody knows.',
  next_step: 'Ask',
  reference: 'The Gilded Stag',
})

function setup(props: Partial<React.ComponentProps<typeof AdventureEditor>> = {}) {
  const onSubmit = vi
    .fn<React.ComponentProps<typeof AdventureEditor>['onSubmit']>()
    .mockResolvedValue({ ok: true, value: base })
  const onCancel = vi.fn()
  const onDirtyChange = vi.fn()
  render(
    <AdventureEditor
      adventure={base}
      error={null}
      isPending={false}
      onCancel={onCancel}
      onDirtyChange={onDirtyChange}
      onSubmit={onSubmit}
      {...props}
    />,
  )
  return { onSubmit, onCancel, onDirtyChange, user: userEvent.setup() }
}

describe('AdventureEditor', () => {
  it('opens on the adventure’s own values with the title focused', () => {
    setup()
    expect(screen.getByLabelText('Title')).toHaveValue('Find the heir')
    expect(screen.getByLabelText('Title')).toHaveFocus()
    expect(screen.getByLabelText(/^Next step/)).toHaveValue('Ask')
    expect(screen.getByLabelText(/^Reference/)).toHaveValue('The Gilded Stag')
    expect(screen.getByLabelText(/^Description/)).toHaveValue('Somebody knows.')
    expect(screen.getByRole('radio', { name: 'Personal' })).toBeChecked()
  })

  it('saves normalized values against the version it was opened on', async () => {
    const { onSubmit, user } = setup()
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), '  New title ')
    await user.click(screen.getByRole('radio', { name: 'Side' }))
    await user.click(screen.getByRole('button', { name: 'Save adventure' }))
    expect(onSubmit).toHaveBeenCalledWith(
      {
        title: 'New title',
        type: 'side',
        description: 'Somebody knows.',
        next_step: 'Ask',
        reference: 'The Gilded Stag',
      },
      base,
    )
  })

  it('offers no type choice for a main adventure', () => {
    setup({ adventure: adventure({ type: 'main', visibility: 'campaign', participants: [] }) })
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('refuses a blank title and an over-long description, naming the field', async () => {
    const { onSubmit, user } = setup()
    await user.clear(screen.getByLabelText('Title'))
    await user.click(screen.getByRole('button', { name: 'Save adventure' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Title')).toHaveAccessibleDescription(
      'Enter a title of up to 120 characters on one line.',
    )
    expect(screen.getByLabelText('Title')).toHaveFocus()
  })

  it('shows a counter near the description limit', () => {
    setup({ adventure: adventure({ description: 'x'.repeat(3900) }) })
    expect(screen.getByText('100 characters left')).toBeVisible()
  })

  it('reports unsaved changes against the saved version', async () => {
    const { onDirtyChange, user } = setup()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    await user.type(screen.getByLabelText('Title'), '!')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    await user.type(screen.getByLabelText('Title'), '{Backspace}')
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('on a conflict keeps the text, then saves mine anyway against the latest version', async () => {
    const latest = adventure({ ...base, title: 'Someone else', updated_at: '2026-11-16T11:00:00Z' })
    const { onSubmit, user } = setup()
    onSubmit.mockResolvedValueOnce({ ok: false, reason: 'conflict', latest })
    await user.type(screen.getByLabelText('Title'), '!')
    await user.click(screen.getByRole('button', { name: 'Save adventure' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This adventure changed while you were editing. Your text is still here.',
    )
    expect(screen.getByLabelText('Title')).toHaveValue('Find the heir!')
    expect(screen.queryByRole('button', { name: 'Save adventure' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save mine anyway' }))
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Find the heir!' }),
      latest,
    )
  })

  it('on a conflict loads the latest only after confirming, and can keep the text', async () => {
    const latest = adventure({ ...base, title: 'Someone else', updated_at: '2026-11-16T11:00:00Z' })
    const { onSubmit, user } = setup()
    onSubmit.mockResolvedValueOnce({ ok: false, reason: 'conflict', latest })
    await user.type(screen.getByLabelText('Title'), '!')
    await user.click(screen.getByRole('button', { name: 'Save adventure' }))
    await user.click(await screen.findByRole('button', { name: 'Load latest' }))
    expect(screen.getByRole('group', { name: 'Confirm loading the latest version' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Keep my text' }))
    expect(screen.getByLabelText('Title')).toHaveValue('Find the heir!')

    await user.click(screen.getByRole('button', { name: 'Load latest' }))
    await user.click(screen.getByRole('button', { name: 'Yes, load latest' }))
    expect(screen.getByLabelText('Title')).toHaveValue('Someone else')
    expect(screen.getByLabelText('Title')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Save adventure' })).toBeVisible()
  })

  it('keeps the text on screen when the adventure has gone', async () => {
    const { onSubmit, onCancel, user } = setup()
    onSubmit.mockResolvedValueOnce({ ok: false, reason: 'unavailable' })
    await user.type(screen.getByLabelText('Title'), '!')
    await user.click(screen.getByRole('button', { name: 'Save adventure' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer available/)
    expect(screen.getByLabelText('Title')).toHaveValue('Find the heir!')
    expect(screen.getByRole('button', { name: 'Save adventure' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Back to adventures' }))
    expect(onCancel).toHaveBeenCalledWith('gone')
  })

  it('shows another failure’s copy and disables the form while saving', () => {
    setup({ error: 'This adventure is archived. Restore it to make changes.' })
    expect(screen.getByRole('alert')).toHaveTextContent(/archived/)
    cleanup()
    setup({ isPending: true })
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByLabelText('Title')).toBeDisabled()
  })
})
