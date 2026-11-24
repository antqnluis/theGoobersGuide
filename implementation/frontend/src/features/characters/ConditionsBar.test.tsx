import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CharacterStatusState } from './characterTypes'
import { ConditionsBar } from './ConditionsBar'

afterEach(cleanup)

const characterId = 'c1'
const quiet: CharacterStatusState = {
  conditions: [],
  exhaustion: 0,
  death_save_successes: 0,
  death_save_failures: 0,
  concentration: null,
  inspiration: false,
}

function setup(status: Partial<CharacterStatusState> = {}, pending = false) {
  const live = {
    saveStatus: vi.fn().mockResolvedValue({}),
    pendingAction: pending
      ? { action: 'status' as const, characterId, resourceId: null }
      : undefined,
  }
  render(
    <ConditionsBar
      characterId={characterId}
      live={live as never}
      status={{ ...quiet, ...status }}
    />,
  )
  return { live, user: userEvent.setup() }
}

describe('display', () => {
  it('shows nothing on a quiet sheet without live actions', () => {
    const { container } = render(<ConditionsBar characterId={characterId} status={quiet} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows what is set, without controls, on another member’s sheet', () => {
    render(
      <ConditionsBar
        characterId={characterId}
        status={{
          ...quiet,
          conditions: ['prone', 'Hexed by the Moon'],
          exhaustion: 2,
          concentration: 'Bless',
          inspiration: true,
        }}
      />,
    )
    const chips = screen.getByRole('list', { name: 'Conditions' })
    expect(chips).toHaveTextContent('Prone')
    expect(chips).toHaveTextContent('Hexed by the Moon')
    expect(screen.getByText('Bless')).toBeInTheDocument()
    expect(screen.getByText(/level 2/)).toBeInTheDocument()
    expect(screen.getByText('Heroic inspiration')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('gives a standard condition its reminder, and a custom one none', () => {
    setup({ conditions: ['prone', 'Hexed by the Moon'] })
    const [prone, custom] = screen.getAllByRole('listitem')
    expect(prone).toHaveTextContent(/Disadvantage on attacks/)
    expect(custom).toHaveTextContent('Hexed by the Moon')
    expect(custom.querySelector('.status-chip__reminder')).toBeNull()
  })
})

describe('conditions', () => {
  it('adds a standard condition by its key, from its label', async () => {
    const { live, user } = setup({ conditions: ['prone'] })
    await user.type(screen.getByLabelText('Add condition'), 'Poisoned')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(live.saveStatus).toHaveBeenCalledWith(characterId, { conditions: ['prone', 'poisoned'] })
  })

  it('adds a custom condition as typed, with Enter', async () => {
    const { live, user } = setup()
    await user.type(screen.getByLabelText('Add condition'), 'Hexed by the Moon{Enter}')
    expect(live.saveStatus).toHaveBeenCalledWith(characterId, {
      conditions: ['Hexed by the Moon'],
    })
  })

  it('refuses a blank, a repeat, and a too-long condition', async () => {
    const { live, user } = setup({ conditions: ['prone'] })
    const input = screen.getByLabelText('Add condition')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a condition.')
    await user.type(input, 'PRONE')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already on the list')
    await user.clear(input)
    await user.type(input, 'x'.repeat(41))
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('up to 40 characters')
    expect(live.saveStatus).not.toHaveBeenCalled()
  })

  it('removes one condition', async () => {
    const { live, user } = setup({ conditions: ['prone', 'stunned'] })
    await user.click(screen.getByRole('button', { name: 'Remove Prone' }))
    expect(live.saveStatus).toHaveBeenCalledWith(characterId, { conditions: ['stunned'] })
  })

  it('disables the controls while a status save is in flight', () => {
    setup({ conditions: ['prone'] }, true)
    expect(screen.getByRole('button', { name: 'Remove Prone' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Raise exhaustion' })).toBeDisabled()
  })
})

describe('exhaustion, inspiration, and concentration', () => {
  it('steps exhaustion within 0 to 6', async () => {
    const { live, user } = setup({ exhaustion: 2 })
    await user.click(screen.getByRole('button', { name: 'Raise exhaustion' }))
    expect(live.saveStatus).toHaveBeenLastCalledWith(characterId, { exhaustion: 3 })
    await user.click(screen.getByRole('button', { name: 'Lower exhaustion' }))
    expect(live.saveStatus).toHaveBeenLastCalledWith(characterId, { exhaustion: 1 })
    cleanup()
    setup({ exhaustion: 0 })
    expect(screen.getByRole('button', { name: 'Lower exhaustion' })).toBeDisabled()
    cleanup()
    setup({ exhaustion: 6 })
    expect(screen.getByRole('button', { name: 'Raise exhaustion' })).toBeDisabled()
  })

  it('toggles heroic inspiration', async () => {
    const { live, user } = setup({ inspiration: true })
    const toggle = screen.getByRole('button', { name: 'Heroic inspiration' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle)
    expect(live.saveStatus).toHaveBeenCalledWith(characterId, { inspiration: false })
  })

  it('starts, replaces, and ends concentration', async () => {
    const { live, user } = setup()
    await user.type(screen.getByLabelText('Concentrating on'), '  Bless ')
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(live.saveStatus).toHaveBeenCalledWith(characterId, { concentration: 'Bless' })
    cleanup()

    const next = setup({ concentration: 'Bless' })
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument()
    await next.user.type(screen.getByLabelText('Concentrating on'), 'Haste')
    await next.user.click(screen.getByRole('button', { name: 'Replace' }))
    expect(next.live.saveStatus).toHaveBeenCalledWith(characterId, { concentration: 'Haste' })
    await next.user.click(screen.getByRole('button', { name: 'End' }))
    expect(next.live.saveStatus).toHaveBeenLastCalledWith(characterId, { concentration: null })
  })

  it('needs a spell name to start', async () => {
    const { live, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the spell')
    await user.type(screen.getByLabelText('Concentrating on'), 'x'.repeat(81))
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('up to 80 characters')
    expect(live.saveStatus).not.toHaveBeenCalled()
  })
})
