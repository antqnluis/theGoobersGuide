import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppearanceDrawer } from './AppearanceDrawer'
import type { AdventurerAppearance } from './adventurerAppearance'

afterEach(cleanup)

const defaultLook: AdventurerAppearance = { cloak: 0, skin: 0, headwear: 'hood', pack: 'satchel' }

function setup(overrides: Partial<Parameters<typeof AppearanceDrawer>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(true)
  const onReset = vi.fn().mockResolvedValue(true)
  render(
    <AppearanceDrawer
      defaultLook={defaultLook}
      error={null}
      onClearError={vi.fn()}
      onReset={onReset}
      onSave={onSave}
      pending={null}
      saved={null}
      {...overrides}
    />,
  )
  return { onSave, onReset, user: userEvent.setup() }
}

describe('AppearanceDrawer', () => {
  it('starts collapsed behind a tab and opens and closes from it', async () => {
    const { user } = setup()
    const tab = screen.getByRole('button', { name: 'Appearance' })
    expect(tab).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('heading', { name: 'Your look at the fire' })).toBeNull()

    await user.click(tab)
    expect(tab).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('heading', { name: 'Your look at the fire' })).toBeVisible()

    await user.click(tab)
    expect(tab).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('heading', { name: 'Your look at the fire' })).toBeNull()
  })

  it('offers every cloak, skin tone, headwear, and pack, with the current look chosen', async () => {
    const { user } = setup({ saved: { cloak: 3, skin: 2, headwear: 'cap', pack: 'quiver' } })
    await user.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(screen.getAllByRole('radio', { name: /cloak$/ })).toHaveLength(8)
    expect(screen.getAllByRole('radio', { name: /^Skin tone/ })).toHaveLength(5)
    expect(screen.getByRole('radio', { name: 'Violet cloak' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Skin tone 3' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Cap' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Quiver' })).toBeChecked()
  })

  it('saves the chosen look only once something changed', async () => {
    const { user, onSave } = setup()
    await user.click(screen.getByRole('button', { name: 'Appearance' }))
    const save = screen.getByRole('button', { name: 'Save look' })
    expect(save).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'Blue cloak' }))
    await user.click(screen.getByRole('radio', { name: 'Skin tone 5' }))
    await user.click(screen.getByRole('radio', { name: 'Bare' }))
    await user.click(screen.getByRole('radio', { name: 'None' }))
    expect(save).toBeEnabled()
    await user.click(save)
    expect(onSave).toHaveBeenCalledWith({ cloak: 1, skin: 4, headwear: 'bare', pack: 'none' })
  })

  it('resets only when a look is saved', async () => {
    const first = setup()
    await first.user.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled()
    cleanup()

    const second = setup({ saved: { cloak: 2, skin: 1, headwear: 'hat', pack: 'none' } })
    await second.user.click(screen.getByRole('button', { name: 'Appearance' }))
    await second.user.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(second.onReset).toHaveBeenCalledTimes(1)
  })

  it('shows pending labels, locks the choices, and shows a failure', async () => {
    const { user } = setup({ pending: 'save', error: "We couldn't save your look." })
    await user.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Blue cloak' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't save your look.")
  })
})
