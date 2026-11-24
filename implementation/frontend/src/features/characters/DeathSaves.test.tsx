import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeathSaves } from './DeathSaves'
import { useDice } from '../dice/useDice'

vi.mock('../dice/useDice', () => ({ useDice: vi.fn() }))

afterEach(cleanup)

const characterId = 'c1'
const roll = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(useDice).mockReturnValue({ roll } as never)
})

const faces = (...values: number[]) => ({
  ok: true as const,
  roll: { dice: [values.map((value, index) => ({ value, kept: index === 0 }))] },
})

function setup(props: Partial<React.ComponentProps<typeof DeathSaves>> = {}) {
  const live = {
    saveDeathSave: vi.fn().mockResolvedValue({}),
    saveStatus: vi.fn().mockResolvedValue({}),
  }
  render(
    <DeathSaves
      characterId={characterId}
      failures={0}
      live={live as never}
      successes={0}
      {...props}
    />,
  )
  return { live, user: userEvent.setup() }
}

describe('rolling', () => {
  it.each([
    [20, 'critical_success'],
    [10, 'success'],
    [9, 'failure'],
    [1, 'critical_failure'],
  ])('a natural %i is recorded as %s', async (natural, result) => {
    roll.mockResolvedValue(faces(natural))
    const { live, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Roll death save' }))
    expect(roll).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Death save', source: 'save', characterId }),
    )
    expect(live.saveDeathSave).toHaveBeenCalledWith(characterId, result)
  })

  it('reads the kept die when the roll had advantage', async () => {
    roll.mockResolvedValue({
      ok: true,
      roll: {
        dice: [
          [
            { value: 3, kept: false },
            { value: 15, kept: true },
          ],
        ],
      },
    })
    const { live, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Roll death save' }))
    expect(live.saveDeathSave).toHaveBeenCalledWith(characterId, 'success')
  })

  it('records nothing and says why when the roll failed', async () => {
    roll.mockResolvedValue({ ok: false, message: 'Too many rolls. Wait a moment.' })
    const { live, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Roll death save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many rolls. Wait a moment.')
    expect(live.saveDeathSave).not.toHaveBeenCalled()
  })

  it('stays quiet when the dock already reported the failure', async () => {
    roll.mockResolvedValue({ ok: false, message: 'Offline', reported: true })
    const { live, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Roll death save' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(live.saveDeathSave).not.toHaveBeenCalled()
  })
})

describe('the track', () => {
  it('fills pips up to the tapped one, and clears the last filled one when tapped again', async () => {
    const { live, user } = setup({ successes: 1 })
    await user.click(screen.getByRole('button', { name: 'Successes 3 of 3' }))
    expect(live.saveStatus).toHaveBeenLastCalledWith(characterId, { death_save_successes: 3 })
    await user.click(screen.getByRole('button', { name: 'Successes 1 of 3' }))
    expect(live.saveStatus).toHaveBeenLastCalledWith(characterId, { death_save_successes: 0 })
    await user.click(screen.getByRole('button', { name: 'Failures 2 of 3' }))
    expect(live.saveStatus).toHaveBeenLastCalledWith(characterId, { death_save_failures: 2 })
  })

  it('shows the count on each pip', () => {
    setup({ successes: 2, failures: 1 })
    expect(screen.getByRole('button', { name: 'Successes 2 of 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Successes 3 of 3' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: 'Failures 1 of 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('points to the deceased control after three failures, and calls three successes stable', () => {
    setup({ failures: 3 })
    expect(screen.getByText(/mark them deceased below/)).toBeInTheDocument()
    cleanup()
    setup({ successes: 3 })
    expect(screen.getByText(/The character is stable/)).toBeInTheDocument()
  })

  it('is display only without live actions', () => {
    render(<DeathSaves characterId={characterId} failures={2} successes={1} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Successes: 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('Failures: 2 of 3')).toBeInTheDocument()
  })
})
