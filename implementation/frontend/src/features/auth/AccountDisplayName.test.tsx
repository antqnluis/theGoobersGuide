import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountDisplayName } from './AccountDisplayName'
import { getOwnDisplayName, updateOwnDisplayName } from './profileService'

vi.mock('./profileService', () => ({
  getOwnDisplayName: vi.fn(),
  updateOwnDisplayName: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

function setup(stored: string | null = null) {
  vi.mocked(getOwnDisplayName).mockResolvedValue(stored)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['campaigns', 'roster', 'c1', 'u1'], 'cached')
  render(
    <QueryClientProvider client={queryClient}>
      <AccountDisplayName fallbackName="player_one" userId="u1" />
    </QueryClientProvider>,
  )
  return { queryClient, user: userEvent.setup() }
}

const trigger = () => screen.getByRole('button', { name: /player_one|Aria/ })

describe('AccountDisplayName', () => {
  it('shows the username until a display name is set, then the display name', async () => {
    setup('Aria the Bold')
    expect(await screen.findByRole('button', { name: /Aria the Bold/ })).toBeVisible()
  })

  it('opens with the current value focused and Escape closes it back to the button', async () => {
    const { user } = setup('Aria')
    await screen.findByRole('button', { name: /Aria/ })
    await user.click(trigger())
    const input = screen.getByLabelText('Display name', { selector: 'input' })
    expect(input).toHaveValue('Aria')
    expect(input).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('Display name', { selector: 'input' })).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('saves a trimmed name, announces it, refreshes rosters, and closes', async () => {
    vi.mocked(updateOwnDisplayName).mockResolvedValue(undefined)
    const { user, queryClient } = setup()
    await user.click(trigger())
    await user.type(screen.getByLabelText('Display name', { selector: 'input' }), '  Aria  ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateOwnDisplayName).toHaveBeenCalledWith('u1', 'Aria')
    expect(await screen.findByRole('button', { name: /Aria/ })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Display name saved.')
    expect(queryClient.getQueryState(['campaigns', 'roster', 'c1', 'u1'])?.isInvalidated).toBe(true)
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('clears the name when the field is left blank', async () => {
    vi.mocked(updateOwnDisplayName).mockResolvedValue(undefined)
    const { user } = setup('Aria')
    await screen.findByRole('button', { name: /Aria/ })
    await user.click(trigger())
    await user.clear(screen.getByLabelText('Display name', { selector: 'input' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateOwnDisplayName).toHaveBeenCalledWith('u1', null)
    expect(await screen.findByRole('button', { name: /player_one/ })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Display name cleared.')
  })

  it('rejects a name over 40 characters without calling the service', async () => {
    const { user } = setup()
    await user.click(trigger())
    await user.type(screen.getByLabelText('Display name', { selector: 'input' }), 'x'.repeat(41))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateOwnDisplayName).not.toHaveBeenCalled()
    expect(screen.getByText('Use 40 characters or fewer.')).toBeVisible()
    expect(screen.getByLabelText('Display name', { selector: 'input' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('keeps the form open with a safe alert when saving fails, and can retry', async () => {
    vi.mocked(updateOwnDisplayName).mockRejectedValueOnce(new Error('offline'))
    vi.mocked(updateOwnDisplayName).mockResolvedValueOnce(undefined)
    const { user } = setup()
    await user.click(trigger())
    await user.type(screen.getByLabelText('Display name', { selector: 'input' }), 'Aria')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't save your display name. Check your connection and try again.",
    )
    expect(screen.getByLabelText('Display name', { selector: 'input' })).toHaveValue('Aria')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: /Aria/ })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
