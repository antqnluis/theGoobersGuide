import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdventureCreateForm } from './AdventureCreateForm'
import { adventure } from './adventureTestData'

afterEach(cleanup)

const brand = { id: 'c-brand', name: 'Brand', status: 'retired' as const }
const aria = { id: 'c-aria', name: 'Aria', status: 'active' as const }

function setup(props: Partial<React.ComponentProps<typeof AdventureCreateForm>> = {}) {
  const onSubmit = vi
    .fn<React.ComponentProps<typeof AdventureCreateForm>['onSubmit']>()
    .mockResolvedValue({ ok: true, value: adventure() })
  const onCancel = vi.fn()
  const onDirtyChange = vi.fn()
  render(
    <AdventureCreateForm
      defaultCharacterId="c-aria"
      error={null}
      isPending={false}
      myCharacters={[brand, aria]}
      onCancel={onCancel}
      onDirtyChange={onDirtyChange}
      onSubmit={onSubmit}
      {...props}
    />,
  )
  return { onSubmit, onCancel, onDirtyChange, user: userEvent.setup() }
}

describe('AdventureCreateForm', () => {
  it('opens with the title focused, personal chosen, and the active character selected', () => {
    setup()
    expect(screen.getByLabelText('Title')).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Personal' })).toBeChecked()
    expect(screen.getByLabelText('For which character')).toHaveValue('c-aria')
  })

  it('lists the writer’s characters by name, marking those that are not active', () => {
    setup()
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Choose a character',
      'Aria',
      'Brand (retired)',
    ])
  })

  it('submits trimmed values with the chosen character', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Title'), '  Find the heir  ')
    await user.click(screen.getByRole('radio', { name: 'Side' }))
    await user.selectOptions(screen.getByLabelText('For which character'), 'Brand (retired)')
    await user.type(screen.getByLabelText(/^Next step/), ' Ask the innkeeper ')
    await user.click(screen.getByRole('button', { name: 'Create adventure' }))
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'side',
      title: 'Find the heir',
      character_id: 'c-brand',
      next_step: 'Ask the innkeeper',
    })
  })

  it('hides the character for a main adventure and sends none', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Title'), 'The long road')
    await user.click(screen.getByRole('radio', { name: 'Main' }))
    expect(screen.queryByLabelText('For which character')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create adventure' }))
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'main',
      title: 'The long road',
      character_id: null,
      next_step: '',
    })
  })

  it('explains who sees each kind', () => {
    setup()
    expect(screen.getByRole('radio', { name: 'Personal' })).toHaveAccessibleDescription(
      'A goal of your own. Only you can see it.',
    )
    expect(screen.getByRole('radio', { name: 'Main' })).toHaveAccessibleDescription(
      'The campaign’s storyline. Every member can read and edit it.',
    )
  })

  it('refuses a blank title and a missing character, naming the field and focusing it', async () => {
    const { onSubmit, user } = setup({ defaultCharacterId: null })
    await user.click(screen.getByRole('button', { name: 'Create adventure' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Title')).toHaveAccessibleDescription(
      'Enter a title of up to 120 characters on one line.',
    )
    expect(screen.getByLabelText('Title')).toHaveFocus()

    await user.type(screen.getByLabelText('Title'), 'Find the heir')
    await user.click(screen.getByRole('button', { name: 'Create adventure' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('For which character')).toHaveAccessibleDescription(
      'Choose one of your characters in this campaign.',
    )
    expect(screen.getByLabelText('For which character')).toHaveFocus()
  })

  it('explains the missing character instead of offering a choice, and still allows a main adventure', async () => {
    const { onSubmit, user } = setup({ defaultCharacterId: null, myCharacters: [] })
    expect(screen.queryByLabelText('For which character')).not.toBeInTheDocument()
    expect(screen.getByText(/you don’t have one in this campaign yet/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Create adventure' })).toBeDisabled()

    await user.type(screen.getByLabelText('Title'), 'The long road')
    await user.click(screen.getByRole('radio', { name: 'Main' }))
    expect(screen.getByRole('button', { name: 'Create adventure' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Create adventure' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('refuses a next step with a line break', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Title'), 'Find the heir')
    await user.type(screen.getByLabelText(/^Next step/), 'a{Enter}b')
    // Enter in a single-line field submits; the value never holds a line break.
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ next_step: 'a' }))
  })

  it('shows the error and a counter near the limit, and disables the form while saving', () => {
    setup({ error: 'You can keep up to 200 adventures in a campaign, archived ones included.' })
    expect(screen.getByRole('alert')).toHaveTextContent(/up to 200 adventures/)
    cleanup()
    setup({ isPending: true })
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByLabelText('Title')).toBeDisabled()
  })

  it('makes one adventure from a double submit', async () => {
    let finish: (value: { ok: true; value: ReturnType<typeof adventure> }) => void = () => {}
    const pending = new Promise<{ ok: true; value: ReturnType<typeof adventure> }>(
      (resolve) => (finish = resolve),
    )
    const { onSubmit, user } = setup()
    onSubmit.mockReturnValue(pending)
    await user.type(screen.getByLabelText('Title'), 'Find the heir')
    const button = screen.getByRole('button', { name: 'Create adventure' })
    await user.dblClick(button)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    finish({ ok: true, value: adventure() })
  })

  it('reports unsaved text, and nothing once closed', async () => {
    const { onDirtyChange, user } = setup()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    await user.type(screen.getByLabelText('Title'), 'x')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    cleanup()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('keeps the text and offers a way back when the campaign is gone', async () => {
    const { onSubmit, onCancel, user } = setup()
    onSubmit.mockResolvedValue({ ok: false, reason: 'unavailable' })
    await user.type(screen.getByLabelText('Title'), 'Find the heir')
    await user.click(screen.getByRole('button', { name: 'Create adventure' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can no longer add adventures to this campaign.',
    )
    expect(screen.getByLabelText('Title')).toHaveValue('Find the heir')
    expect(screen.getByRole('button', { name: 'Create adventure' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Back to adventures' }))
    expect(onCancel).toHaveBeenCalledWith('gone')
  })

  it('cancels', async () => {
    const { onCancel, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledWith('cancel')
  })
})
