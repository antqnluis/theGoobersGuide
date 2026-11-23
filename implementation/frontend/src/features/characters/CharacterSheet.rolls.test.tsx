import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatSpec } from '../dice/diceNotation'
import type { DiceContextValue, RollRequest } from '../dice/diceContext'
import { unavailableDice } from '../dice/diceContext'
import { useDice } from '../dice/useDice'
import { CharacterSheet } from './CharacterSheet'
import { listCharacterImports } from './characterImportService'
import { getCharacterSheet } from './characterService'
import { character, sheet, userId } from './characterTestData'
import { defaultSheetBody } from './characterValidation'
import { listCharacterItems } from './inventoryService'

vi.mock('../dice/useDice', () => ({ useDice: vi.fn(), useDiceScope: vi.fn() }))

vi.mock('./characterImportService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterImportService')>()),
  listCharacterImports: vi.fn(),
}))

vi.mock('./characterService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterService')>()),
  getCharacterSheet: vi.fn(),
}))

vi.mock('./inventoryService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./inventoryService')>()),
  listCharacterItems: vi.fn(),
}))

const rollMock = vi.fn()

function useFakeDice(overrides: Partial<DiceContextValue> = {}) {
  rollMock.mockResolvedValue({ ok: true })
  vi.mocked(useDice).mockReturnValue({
    ...unavailableDice,
    inCampaign: true,
    roll: rollMock,
    ...overrides,
  })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  vi.resetAllMocks()
  rollMock.mockReset()
  vi.mocked(listCharacterItems).mockResolvedValue([])
  vi.mocked(listCharacterImports).mockResolvedValue([])
  vi.mocked(getCharacterSheet).mockResolvedValue(
    sheet({
      sheet: {
        ...defaultSheetBody(),
        abilities: { str: 18, dex: 14, con: 12, int: 8, wis: 13, cha: 10 },
        saving_throws: ['str'],
        skills: { athletics: 'proficient', stealth: 'expertise' },
        attacks: [
          {
            id: '3f1c9a52-8d4e-4b7a-9c61-0a2b5d7e9f10',
            name: 'Greataxe',
            bonus: '+6',
            damage: '1d12+4 slashing',
            notes: '',
          },
          {
            id: '4a2d0b63-9e5f-4c8b-8d72-1b3c6e8f0a21',
            name: 'Dagger',
            bonus: '+6 to hit (finesse)',
            damage: '1d4+2',
            notes: '',
          },
          {
            id: '5b3e1c74-0f60-4d9c-9e83-2c4d7f901b32',
            name: 'Boulder',
            bonus: '',
            damage: 'crushing',
            notes: '',
          },
        ],
      },
    }),
  )
})

function renderSheet({
  readOnly = true,
  owner = userId,
}: { readOnly?: boolean; owner?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CharacterSheet
        actions={{
          saveVitals: vi.fn(),
          saveSheet: vi.fn(),
          adjustCurrency: vi.fn(),
          addItem: vi.fn(),
          editItem: vi.fn(),
          changeItemFlag: vi.fn(),
          changeItemQuantity: vi.fn(),
          removeItem: vi.fn(),
          pendingAction: null,
          pendingCharacterId: null,
          pendingItemId: null,
        }}
        character={character({ owner_id: owner })}
        readOnly={readOnly}
        userId={userId}
      />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const characterId = '00000000-0000-4000-8000-000000000021'

function lastRequest(): RollRequest {
  return rollMock.mock.calls[rollMock.mock.calls.length - 1][0]
}

async function ready() {
  await screen.findByRole('heading', { name: 'Vitals' })
}

describe('roll buttons on your own sheet', () => {
  it('rolls an ability check, a saving throw, a skill, and initiative with the sheet’s modifiers', async () => {
    useFakeDice()
    const user = renderSheet()
    await ready()

    await user.click(screen.getByRole('button', { name: 'Roll Strength check, +4' }))
    expect(lastRequest()).toMatchObject({ label: 'Strength check', source: 'ability', characterId })
    expect(formatSpec(lastRequest().spec!)).toBe('1d20 + 4')

    await user.click(screen.getByRole('button', { name: 'Roll Strength save, +6' }))
    expect(lastRequest()).toMatchObject({ label: 'Strength save', source: 'save', characterId })
    expect(formatSpec(lastRequest().spec!)).toBe('1d20 + 6')

    await user.click(screen.getByRole('button', { name: 'Roll Dexterity save, +2' }))
    expect(formatSpec(lastRequest().spec!)).toBe('1d20 + 2')

    await user.click(screen.getByRole('button', { name: 'Roll Stealth check, +6' }))
    expect(lastRequest()).toMatchObject({ label: 'Stealth check', source: 'skill', characterId })
    expect(formatSpec(lastRequest().spec!)).toBe('1d20 + 6')

    await user.click(screen.getByRole('button', { name: 'Roll Acrobatics check, +2' }))
    expect(formatSpec(lastRequest().spec!)).toBe('1d20 + 2')

    await user.click(screen.getByRole('button', { name: 'Roll initiative, +2' }))
    expect(lastRequest()).toMatchObject({ label: 'Initiative', source: 'initiative', characterId })
    expect(formatSpec(lastRequest().spec!)).toBe('1d20 + 2')
  })

  it('shows a penalty with its sign and rolls a plain d20 for a zero', async () => {
    useFakeDice()
    const user = renderSheet()
    await ready()
    await user.click(screen.getByRole('button', { name: /^Roll Intelligence check/ }))
    expect(formatSpec(lastRequest().spec!)).toBe('1d20 - 1')
    await user.click(screen.getByRole('button', { name: /^Roll Charisma check/ }))
    expect(formatSpec(lastRequest().spec!)).toBe('1d20')
  })

  it('rolls an attack to hit, carrying its damage for a critical, and the damage itself', async () => {
    useFakeDice()
    const user = renderSheet()
    await ready()

    await user.click(screen.getByRole('button', { name: 'Roll Greataxe to hit, +6' }))
    expect(lastRequest()).toMatchObject({
      label: 'Greataxe attack',
      source: 'attack',
      characterId,
      critical: { label: 'Greataxe damage — slashing' },
    })
    expect(formatSpec(lastRequest().spec!)).toBe('1d20 + 6')
    expect(formatSpec(lastRequest().critical!.spec)).toBe('1d12 + 4')

    await user.click(screen.getByRole('button', { name: 'Roll Greataxe damage, 1d12+4 slashing' }))
    expect(lastRequest()).toMatchObject({
      label: 'Greataxe damage — slashing',
      source: 'damage',
      characterId,
    })
    expect(formatSpec(lastRequest().spec!)).toBe('1d12 + 4')
  })

  it('shows plain text where a field cannot be rolled', async () => {
    useFakeDice()
    renderSheet()
    await ready()
    // A bonus with words is not a plain number; the damage still rolls.
    expect(screen.queryByRole('button', { name: /Roll Dagger to hit/ })).not.toBeInTheDocument()
    expect(screen.getByText('+6 to hit (finesse)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Roll Dagger damage, 1d4+2' })).toBeInTheDocument()
    // No dice in the damage and no bonus: nothing to roll.
    expect(screen.queryByRole('button', { name: /Boulder/ })).not.toBeInTheDocument()
    expect(screen.getByText('crushing')).toBeInTheDocument()
  })

  it('rolls with advantage on Shift-click and disadvantage on Alt-click, for a d20 only', async () => {
    useFakeDice()
    renderSheet()
    await ready()
    const stealth = screen.getByRole('button', { name: 'Roll Stealth check, +6' })
    fireEvent.click(stealth, { shiftKey: true })
    expect(lastRequest().mode).toBe('advantage')
    fireEvent.click(stealth, { altKey: true })
    expect(lastRequest().mode).toBe('disadvantage')
    fireEvent.click(stealth)
    expect(lastRequest().mode).toBe('normal')

    fireEvent.click(screen.getByRole('button', { name: /Roll Greataxe damage/ }), {
      shiftKey: true,
    })
    expect(lastRequest().mode).toBe('normal')
  })
})

describe('the roll menu', () => {
  it('opens on right-click with advantage, disadvantage, and private', async () => {
    useFakeDice()
    const user = renderSheet()
    await ready()
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Roll Stealth check, +6' }))
    const menu = screen.getByRole('menu', { name: 'Roll options for Stealth check' })
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Roll with advantage', 'Roll with disadvantage', 'Roll privately'])
    expect(within(menu).getAllByRole('menuitem')[0]).toHaveFocus()

    await user.click(within(menu).getByRole('menuitem', { name: 'Roll privately' }))
    expect(lastRequest()).toMatchObject({ mode: 'normal', visibility: 'self' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Roll Stealth check, +6' })).toHaveFocus()
  })

  it('rolls with the chosen mode', async () => {
    useFakeDice()
    const user = renderSheet()
    await ready()
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Roll initiative, +2' }))
    await user.click(screen.getByRole('menuitem', { name: 'Roll with disadvantage' }))
    expect(lastRequest()).toMatchObject({ mode: 'disadvantage', visibility: 'campaign' })
  })

  it('opens on a long press with touch', async () => {
    useFakeDice()
    renderSheet()
    await ready()
    vi.useFakeTimers()
    const button = screen.getByRole('button', { name: 'Roll Stealth check, +6' })
    fireEvent.pointerDown(button, { pointerType: 'touch' })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    // Letting go after the long press does not also roll.
    fireEvent.pointerUp(button, { pointerType: 'touch' })
    fireEvent.click(button)
    expect(rollMock).not.toHaveBeenCalled()
  })

  it('does not open on a short touch', async () => {
    useFakeDice()
    renderSheet()
    await ready()
    vi.useFakeTimers()
    const button = screen.getByRole('button', { name: 'Roll Stealth check, +6' })
    fireEvent.pointerDown(button, { pointerType: 'touch' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    fireEvent.pointerUp(button, { pointerType: 'touch' })
    fireEvent.click(button)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(rollMock).toHaveBeenCalledTimes(1)
  })

  it('moves with the arrow keys and closes on Escape without reaching the journal', async () => {
    useFakeDice()
    const user = renderSheet()
    await ready()
    const button = screen.getByRole('button', { name: 'Roll Stealth check, +6' })
    fireEvent.contextMenu(button)
    const items = screen.getAllByRole('menuitem')
    await user.keyboard('{ArrowDown}')
    expect(items[1]).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(items[2]).toHaveFocus()

    const reached = vi.fn()
    document.addEventListener('keydown', reached)
    await user.keyboard('{Escape}')
    document.removeEventListener('keydown', reached)
    expect(reached).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
    expect(rollMock).not.toHaveBeenCalled()
  })

  it('closes when you press elsewhere', async () => {
    useFakeDice()
    renderSheet()
    await ready()
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Roll Stealth check, +6' }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('leaves out Roll privately outside a campaign, and has no menu for damage there', async () => {
    useFakeDice({ inCampaign: false })
    renderSheet()
    await ready()
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Roll Stealth check, +6' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Roll with advantage',
      'Roll with disadvantage',
    ])
    fireEvent.pointerDown(document.body)

    fireEvent.contextMenu(screen.getByRole('button', { name: /Roll Greataxe damage/ }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('offers only Roll privately for damage in a campaign', async () => {
    useFakeDice()
    renderSheet()
    await ready()
    fireEvent.contextMenu(screen.getByRole('button', { name: /Roll Greataxe damage/ }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Roll privately',
    ])
  })
})

describe('where roll buttons do not appear', () => {
  it('is absent from another player’s sheet', async () => {
    useFakeDice()
    renderSheet({ owner: '00000000-0000-4000-8000-000000000002' })
    await ready()
    expect(document.querySelector('.roll-button')).toBeNull()
    expect(screen.getByText('Greataxe')).toBeInTheDocument()
  })

  it('turns no dice text into a roll chip on another player’s sheet, but does on your own', async () => {
    useFakeDice()
    const withDice = sheet({
      sheet: {
        ...defaultSheetBody(),
        features: 'Sneak attack adds 3d6.',
        spells: 'Cantrips: Fire Bolt (1d10 fire)',
        attacks: [
          {
            id: '3f1c9a52-8d4e-4b7a-9c61-0a2b5d7e9f10',
            name: 'Dagger',
            bonus: '',
            damage: '',
            notes: 'Poisoned for 1d4 extra.',
          },
        ],
      },
    })
    vi.mocked(getCharacterSheet).mockResolvedValue(withDice)
    renderSheet({ owner: '00000000-0000-4000-8000-000000000002' })
    await ready()
    expect(screen.getByText(/Sneak attack adds 3d6\./)).toBeInTheDocument()
    expect(screen.getByText(/Poisoned for 1d4 extra\./)).toBeInTheDocument()
    expect(document.querySelector('.roll-button')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Roll / })).toBeNull()
    cleanup()

    renderSheet()
    await ready()
    expect(screen.getByRole('button', { name: /^Roll 3d6/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Roll 1d4/ })).toBeInTheDocument()
  })

  it('is absent from the edit view', async () => {
    useFakeDice()
    renderSheet({ readOnly: false })
    await ready()
    expect(document.querySelector('.roll-button')).toBeNull()
  })

  it('does not break when no dice are provided', async () => {
    vi.mocked(useDice).mockReturnValue(unavailableDice)
    const user = renderSheet()
    await ready()
    await user.click(screen.getByRole('button', { name: 'Roll Stealth check, +6' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Vitals' })).toBeInTheDocument())
  })
})
