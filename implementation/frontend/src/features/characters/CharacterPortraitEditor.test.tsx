import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CharacterPortraitEditor } from './CharacterPortraitEditor'
import { character } from './characterTestData'
import { portraitMaxBytes } from './characterValidation'
import type { CharacterSummary } from './characterTypes'

vi.mock('./characterService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterService')>()),
  getCharacterPortraitUrl: vi.fn().mockResolvedValue('https://example.test/p.png'),
}))

afterEach(cleanup)

function setup(subject: CharacterSummary = character(), pendingAction: string | null = null) {
  const actions = {
    setPortrait: vi.fn().mockResolvedValue(true),
    clearPortrait: vi.fn().mockResolvedValue(true),
    pendingAction,
    pendingCharacterId: pendingAction ? subject.id : null,
  }
  const onNotice = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CharacterPortraitEditor actions={actions as never} character={subject} onNotice={onNotice} />
    </QueryClientProvider>,
  )
  return { actions, onNotice, user: userEvent.setup({ applyAccept: false }) }
}

const png = (size = 10) => new File([new Uint8Array(size)], 'me.png', { type: 'image/png' })

describe('CharacterPortraitEditor', () => {
  it('offers an upload, and no removal, without a picture', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Upload picture' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove picture' })).not.toBeInTheDocument()
  })

  it('saves a chosen picture and announces it', async () => {
    const { actions, onNotice, user } = setup()
    const file = png()
    await user.upload(screen.getByLabelText('Portrait file'), file)
    expect(actions.setPortrait).toHaveBeenCalledWith(character().id, file, null)
    expect(onNotice).toHaveBeenCalledWith('Portrait updated.')
  })

  it('passes the old picture along when replacing', async () => {
    const subject = character({ portrait_path: `${character().id}/old.png` })
    const { actions, user } = setup(subject)
    await user.upload(screen.getByLabelText('Portrait file'), png())
    expect(actions.setPortrait).toHaveBeenCalledWith(
      subject.id,
      expect.any(File),
      subject.portrait_path,
    )
    expect(screen.getByRole('button', { name: 'Change picture' })).toBeInTheDocument()
  })

  it('rejects the wrong type or an oversized file before uploading', async () => {
    const { actions, user } = setup()
    await user.upload(
      screen.getByLabelText('Portrait file'),
      new File(['x'], 'a.gif', { type: 'image/gif' }),
      // The file input's accept filter would hide it in a browser; the check is the backstop.
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a PNG, JPEG, or WebP picture.')
    expect(actions.setPortrait).not.toHaveBeenCalled()

    await user.upload(screen.getByLabelText('Portrait file'), png(portraitMaxBytes + 1))
    expect(screen.getByRole('alert')).toHaveTextContent('2 MB or less')
    expect(actions.setPortrait).not.toHaveBeenCalled()
  })

  it('removes a picture', async () => {
    const subject = character({ portrait_path: `${character().id}/old.png` })
    const { actions, onNotice, user } = setup(subject)
    await user.click(screen.getByRole('button', { name: 'Remove picture' }))
    expect(actions.clearPortrait).toHaveBeenCalledWith(subject.id, subject.portrait_path)
    expect(onNotice).toHaveBeenCalledWith('Portrait removed.')
  })

  it('locks the buttons and says so while saving', () => {
    setup(character(), 'portrait')
    expect(screen.getByRole('button', { name: 'Saving picture…' })).toBeDisabled()
  })
})
