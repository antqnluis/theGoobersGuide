import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppearanceDrawer } from './AppearanceDrawer'
import type { AdventurerAppearance } from './adventurerAppearance'
import { spritePrompt } from './customSprite'

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
      customSprite={null}
      onUploadSprite={vi.fn().mockResolvedValue(true)}
      onRemoveSprite={vi.fn().mockResolvedValue(true)}
      spritePending={null}
      spriteError={null}
      onClearSpriteError={vi.fn()}
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

  describe('tabs', () => {
    it('shows the look controls first and the sprite steps on the Sprite tab', async () => {
      const { user } = setup()
      await user.click(screen.getByRole('button', { name: 'Appearance' }))
      expect(screen.getByRole('tab', { name: 'Look' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('button', { name: 'Save look' })).toBeVisible()
      expect(screen.queryByRole('button', { name: 'Upload sprite' })).toBeNull()

      await user.click(screen.getByRole('tab', { name: 'Sprite' }))
      expect(screen.getByRole('button', { name: 'Upload sprite' })).toBeVisible()
      expect(screen.queryByRole('button', { name: 'Save look' })).toBeNull()
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
    })

    it('moves between tabs with the arrow keys', async () => {
      const { user } = setup()
      await user.click(screen.getByRole('button', { name: 'Appearance' }))
      // Opening moves focus to the heading on the next frame; wait for that before tabbing.
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Your look at the fire' })).toHaveFocus(),
      )
      screen.getByRole('tab', { name: 'Look' }).focus()
      await user.keyboard('{ArrowRight}')
      expect(screen.getByRole('tab', { name: 'Sprite' })).toHaveFocus()
      expect(screen.getByRole('tab', { name: 'Sprite' })).toHaveAttribute('aria-selected', 'true')
      await user.keyboard('{ArrowRight}')
      expect(screen.getByRole('tab', { name: 'Look' })).toHaveFocus()
    })

    it('keeps an unsaved look when switching tabs, and says what the camp shows', async () => {
      const { user } = setup({ customSprite: 'A'.repeat(1366) + '==' })
      await user.click(screen.getByRole('button', { name: 'Appearance' }))
      expect(screen.getByText('At the fire now: your sprite.')).toBeVisible()
      await user.click(screen.getByRole('radio', { name: 'Blue cloak' }))
      await user.click(screen.getByRole('tab', { name: 'Sprite' }))
      await user.click(screen.getByRole('tab', { name: 'Look' }))
      expect(screen.getByRole('radio', { name: 'Blue cloak' })).toBeChecked()
    })
  })

  describe('custom sprite', () => {
    const sprite = 'A'.repeat(1366) + '=='

    it('uploads the chosen file and clears an old error first', async () => {
      const onUploadSprite = vi.fn().mockResolvedValue(true)
      const onClearSpriteError = vi.fn()
      const { user } = setup({ onUploadSprite, onClearSpriteError })
      await user.click(screen.getByRole('button', { name: 'Appearance' }))
      await user.click(screen.getByRole('tab', { name: 'Sprite' }))
      const file = new File([new Uint8Array(8)], 'me.png', { type: 'image/png' })
      await user.upload(screen.getByLabelText('Sprite PNG file'), file)
      expect(onUploadSprite).toHaveBeenCalledWith(file)
    })

    it('removes a sprite only when one is set', async () => {
      const first = setup()
      await first.user.click(screen.getByRole('button', { name: 'Appearance' }))
      await first.user.click(screen.getByRole('tab', { name: 'Sprite' }))
      expect(screen.getByRole('button', { name: 'Upload sprite' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Remove sprite' })).toBeDisabled()
      cleanup()

      const onRemoveSprite = vi.fn().mockResolvedValue(true)
      const second = setup({ customSprite: sprite, onRemoveSprite })
      await second.user.click(screen.getByRole('button', { name: 'Appearance' }))
      await second.user.click(screen.getByRole('tab', { name: 'Sprite' }))
      expect(screen.getByRole('button', { name: 'Replace sprite' })).toBeEnabled()
      await second.user.click(screen.getByRole('button', { name: 'Remove sprite' }))
      expect(onRemoveSprite).toHaveBeenCalledTimes(1)
    })

    it('offers a prompt for an image generator and copies it', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      const { user } = setup()
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
      await user.click(screen.getByRole('button', { name: 'Appearance' }))
      await user.click(screen.getByRole('tab', { name: 'Sprite' }))
      await user.click(screen.getByText('Get a prompt for an image generator'))
      expect(screen.getByLabelText('Image generator prompt')).toHaveValue(spritePrompt)
      await user.click(screen.getByRole('button', { name: 'Copy prompt' }))
      expect(writeText).toHaveBeenCalledWith(spritePrompt)
      expect(screen.getByRole('status')).toHaveTextContent('Prompt copied.')
    })

    it('says so when the prompt cannot be copied automatically', async () => {
      const { user } = setup()
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
        configurable: true,
      })
      await user.click(screen.getByRole('button', { name: 'Appearance' }))
      await user.click(screen.getByRole('tab', { name: 'Sprite' }))
      await user.click(screen.getByText('Get a prompt for an image generator'))
      await user.click(screen.getByRole('button', { name: 'Copy prompt' }))
      expect(screen.getByRole('status')).toHaveTextContent("Couldn't copy automatically")
    })

    it('shows a sprite failure and locks the buttons while uploading', async () => {
      const { user } = setup({
        spritePending: 'upload',
        spriteError: 'The sprite must be 16 × 16.',
      })
      await user.click(screen.getByRole('button', { name: 'Appearance' }))
      await user.click(screen.getByRole('tab', { name: 'Sprite' }))
      expect(screen.getByRole('button', { name: 'Uploading…' })).toBeDisabled()
      expect(screen.getByRole('alert')).toHaveTextContent('The sprite must be 16 × 16.')
    })
  })
})
