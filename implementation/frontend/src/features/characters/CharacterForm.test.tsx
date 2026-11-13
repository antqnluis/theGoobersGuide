import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CharacterForm } from './CharacterForm'

afterEach(cleanup)

function setup(props: Partial<React.ComponentProps<typeof CharacterForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(true)
  const onCancel = vi.fn()
  render(
    <CharacterForm
      isPending={false}
      mode="create"
      onCancel={onCancel}
      onSubmit={onSubmit}
      {...props}
    />,
  )
  return { onSubmit, onCancel, user: userEvent.setup() }
}

describe('CharacterForm (create)', () => {
  it('labels every field and ticks "Join the party" by default', () => {
    setup()
    for (const label of ['Name', /Species/, /Class/, /Subclass/, /Background/, 'Level']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.getByLabelText('Join the party')).toBeChecked()
    expect(screen.getByLabelText('Level')).toHaveValue(1)
    expect(screen.getByRole('button', { name: 'Create character' })).toBeEnabled()
  })

  it('submits trimmed details with nulls for empty optionals and the party choice', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Name'), '  Brand ')
    await user.type(screen.getByLabelText(/Species/), 'Elf')
    await user.clear(screen.getByLabelText('Level'))
    await user.type(screen.getByLabelText('Level'), '4')
    await user.click(screen.getByLabelText('Join the party'))
    await user.click(screen.getByRole('button', { name: 'Create character' }))

    expect(onSubmit).toHaveBeenCalledWith(
      {
        name: 'Brand',
        species: 'Elf',
        class_name: null,
        subclass: null,
        background: null,
        level: 4,
      },
      false,
    )
  })

  it('validates on submit, focuses the first invalid field, and describes the error', async () => {
    const { onSubmit, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create character' }))

    const name = screen.getByLabelText('Name')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(name).toHaveFocus()
    expect(name).toBeInvalid()
    expect(name).toHaveAccessibleDescription('Enter a name of up to 80 characters.')

    await user.type(name, 'B')
    expect(name).not.toBeInvalid()
  })

  it('rejects an out-of-range level and an over-long detail', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Name'), 'Brand')
    await user.type(screen.getByLabelText(/Species/), 'x'.repeat(61))
    await user.clear(screen.getByLabelText('Level'))
    await user.type(screen.getByLabelText('Level'), '21')
    await user.click(screen.getByRole('button', { name: 'Create character' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Species/)).toHaveAccessibleDescription(
      'Species, class, subclass, and background can be up to 60 characters.',
    )
    expect(screen.getByLabelText('Level')).toHaveAccessibleDescription(
      'Level must be between 1 and 20.',
    )
  })

  it('treats an empty level as invalid', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Name'), 'Brand')
    await user.clear(screen.getByLabelText('Level'))
    await user.click(screen.getByRole('button', { name: 'Create character' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Level')).toBeInvalid()
  })

  it('shows the pending label, disables the fields, and keeps cancel off', () => {
    setup({ isPending: true })
    expect(screen.getByRole('button', { name: 'Creating character…' })).toBeDisabled()
    expect(screen.getByLabelText('Name')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('ignores a second submit while the first is still running', async () => {
    let finish: (ok: boolean) => void = () => {}
    const onSubmit = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)))
    const { user } = setup({ onSubmit })
    await user.type(screen.getByLabelText('Name'), 'Brand')
    await user.click(screen.getByRole('button', { name: 'Create character' }))
    await user.click(screen.getByRole('button', { name: 'Create character' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    finish(true)
  })

  it('cancels', async () => {
    const { onCancel, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('CharacterForm (edit)', () => {
  const initial = {
    name: 'Brand',
    species: 'Elf',
    class_name: '',
    subclass: '',
    background: 'Sage',
    level: 5,
  }

  it('starts from the character, has no party checkbox, and says Save details', () => {
    setup({ mode: 'edit', initial })
    expect(screen.getByLabelText('Name')).toHaveValue('Brand')
    expect(screen.getByLabelText(/Species/)).toHaveValue('Elf')
    expect(screen.getByLabelText('Level')).toHaveValue(5)
    expect(screen.queryByLabelText('Join the party')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save details' })).toBeInTheDocument()
  })

  it('submits the edited details', async () => {
    const { onSubmit, user } = setup({ mode: 'edit', initial })
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Brand the Bold')
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    expect(onSubmit).toHaveBeenCalledWith(
      {
        name: 'Brand the Bold',
        species: 'Elf',
        class_name: null,
        subclass: null,
        background: 'Sage',
        level: 5,
      },
      true,
    )
  })

  it('shows the saving label while pending', () => {
    setup({ mode: 'edit', initial, isPending: true })
    expect(screen.getByRole('button', { name: 'Saving character…' })).toBeDisabled()
  })
})
