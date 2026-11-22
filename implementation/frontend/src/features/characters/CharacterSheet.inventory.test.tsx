import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CharacterSheet, type SheetActions } from './CharacterSheet'
import { getCharacterSheet } from './characterService'
import { character, item, sheet, userId } from './characterTestData'
import { defaultSheetBody } from './characterValidation'
import { listCharacterItems } from './inventoryService'

vi.mock('./characterService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterService')>()),
  getCharacterSheet: vi.fn(),
}))
vi.mock('./inventoryService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./inventoryService')>()),
  listCharacterItems: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCharacterSheet).mockResolvedValue(sheet({ cp: 4, sp: 5, gp: 60 }))
  vi.mocked(listCharacterItems).mockResolvedValue([item({ id: 'rope', name: 'Rope' })])
})

function actions(overrides: Partial<SheetActions> = {}): SheetActions {
  return {
    saveVitals: vi.fn().mockResolvedValue(true),
    saveSheet: vi.fn().mockResolvedValue(true),
    adjustCurrency: vi.fn().mockResolvedValue(true),
    addItem: vi.fn().mockResolvedValue(true),
    editItem: vi.fn().mockResolvedValue(true),
    changeItemFlag: vi.fn().mockResolvedValue(true),
    changeItemQuantity: vi.fn().mockResolvedValue(true),
    removeItem: vi.fn().mockResolvedValue(true),
    pendingAction: null,
    pendingCharacterId: null,
    pendingItemId: null,
    ...overrides,
  }
}

function renderSheet({
  readOnly,
  quickHp = false,
  sheetActions = actions(),
  withActions = true,
  onDirtyChange,
}: {
  readOnly: boolean
  quickHp?: boolean
  sheetActions?: SheetActions
  withActions?: boolean
  onDirtyChange?: (dirty: boolean) => void
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CharacterSheet
        actions={withActions ? sheetActions : undefined}
        character={character()}
        onDirtyChange={onDirtyChange}
        quickHp={quickHp}
        readOnly={readOnly}
        userId={userId}
      />
    </QueryClientProvider>,
  )
  return { sheetActions, user: userEvent.setup() }
}

describe('Coins and Inventory sections', () => {
  it('adds Spells, Coins, and Inventory tabs after Attacks, in both owner views', async () => {
    for (const props of [{ readOnly: false }, { readOnly: true, quickHp: true }]) {
      renderSheet(props)
      const nav = await screen.findByRole('navigation', { name: 'Sheet sections' })
      expect(
        within(nav)
          .getAllByRole('button')
          .map((tab) => tab.textContent),
      ).toEqual([
        'Vitals',
        'Abilities',
        'Skills',
        'Attacks',
        'Spells',
        'Coins',
        'Inventory',
        'Notes',
        'Import and export',
      ])
      cleanup()
    }
  })

  it('jumps to a section and focuses its heading', async () => {
    const { user } = renderSheet({ readOnly: false })
    await user.click(await screen.findByRole('button', { name: 'Coins' }))
    expect(screen.getByRole('heading', { name: 'Coins' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Inventory' }))
    expect(screen.getByRole('heading', { name: 'Inventory' })).toHaveFocus()
  })

  it.each([
    ['the display view', { readOnly: true, quickHp: true }],
    ['the edit view', { readOnly: false }],
  ])('is interactive for the owner in %s', async (_name, props) => {
    renderSheet(props)
    expect(await screen.findByRole('form', { name: 'Add or spend coins' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Add one Rope' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument()
  })

  it('shows the purse from the sheet', async () => {
    renderSheet({ readOnly: false })
    await screen.findByRole('heading', { name: 'Coins' })
    expect(document.querySelector('[data-coin="gp"]')).toHaveTextContent('60 gp')
    expect(document.querySelector('[data-coin="sp"]')).toHaveTextContent('5 sp')
    expect(document.querySelector('[data-coin="cp"]')).toHaveTextContent('4 cp')
  })

  it('is read-only for someone else’s shared sheet', async () => {
    renderSheet({ readOnly: true, withActions: false })
    expect(await screen.findByText('Rope')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Coins' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeInTheDocument()
    expect(document.querySelector('[data-coin="gp"]')).toHaveTextContent('60 gp')
    expect(screen.queryByRole('form', { name: 'Add or spend coins' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add one Rope' })).not.toBeInTheDocument()
  })

  it('does not ask for items when the sheet is hidden', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(null)
    renderSheet({ readOnly: true, withActions: false })
    expect(await screen.findByText('This sheet is no longer available.')).toBeInTheDocument()
    expect(listCharacterItems).not.toHaveBeenCalled()
  })

  it('shows the carrying capacity from Strength', async () => {
    renderSheet({ readOnly: true, withActions: false })
    expect(await screen.findByText(/of 150 lb/)).toBeInTheDocument()
  })
})

describe('Spells section', () => {
  it('is its own section, apart from features and notes', async () => {
    renderSheet({ readOnly: false })
    expect(await screen.findByRole('heading', { name: 'Spells' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Features and notes' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Features, spells/ })).not.toBeInTheDocument()
    const spells = screen.getByRole('textbox', { name: 'Spells' })
    expect(spells.closest('section')).toHaveAccessibleName('Spells')
    expect(screen.getByLabelText('Features and traits').closest('section')).toHaveAccessibleName(
      'Features and notes',
    )
    expect(screen.getByLabelText('Notes and backstory').closest('section')).toBe(
      screen.getByLabelText('Features and traits').closest('section'),
    )
  })

  it('jumps from its tab to the heading', async () => {
    const { user } = renderSheet({ readOnly: false })
    await user.click(await screen.findByRole('button', { name: 'Spells' }))
    expect(screen.getByRole('heading', { name: 'Spells' })).toHaveFocus()
  })

  it('shows the spells text read-only, or that nothing is recorded', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(
      sheet({ sheet: { ...defaultSheetBody(), spells: 'Light, Mage Hand' } }),
    )
    renderSheet({ readOnly: true, withActions: false })
    expect(await screen.findByText('Light, Mage Hand')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Spells' })).not.toBeInTheDocument()
  })
})

describe('Coins and Inventory saving', () => {
  it('saves coins immediately, without touching the save bar', async () => {
    const { sheetActions, user } = renderSheet({ readOnly: false })
    await user.type(await screen.findByLabelText(/Gold/), '3')
    await user.click(screen.getByRole('button', { name: 'Add coins' }))
    expect(sheetActions.adjustCurrency).toHaveBeenCalledWith(character().id, {
      cp: 0,
      sp: 0,
      gp: 3,
    })
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
  })

  it('does not lock the sheet fields while a coin or item change saves', async () => {
    renderSheet({
      readOnly: false,
      sheetActions: actions({
        pendingAction: 'currency',
        pendingCharacterId: character().id,
      }),
    })
    expect(await screen.findByLabelText('Maximum HP')).toBeEnabled()
    expect(screen.getByLabelText('Strength score')).toBeEnabled()
  })

  it('still locks the sheet fields while the sheet itself saves', async () => {
    renderSheet({
      readOnly: false,
      sheetActions: actions({ pendingAction: 'sheet', pendingCharacterId: character().id }),
    })
    expect(await screen.findByLabelText('Maximum HP')).toBeDisabled()
  })

  it('keeps a body draft when a coin change updates the sheet', async () => {
    const { user } = renderSheet({ readOnly: false })
    const notes = await screen.findByLabelText('Notes and backstory')
    await user.type(notes, 'Kept')
    await user.type(screen.getByLabelText(/Silver/), '1')
    await user.click(screen.getByRole('button', { name: 'Add coins' }))
    expect(screen.getByLabelText('Notes and backstory')).toHaveValue('Kept')
  })

  it('counts an open item form with input as unsaved, and a clean sheet otherwise', async () => {
    const onDirtyChange = vi.fn()
    const { user } = renderSheet({ readOnly: false, onDirtyChange })
    await user.click(await screen.findByRole('button', { name: 'Add item' }))
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    await user.type(screen.getByLabelText('Name'), 'Lantern')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    // The save bar itself still reads clean: the item form is not part of it.
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('does not ask for items in the dirty state for read-only viewers', async () => {
    const onDirtyChange = vi.fn()
    renderSheet({ readOnly: true, withActions: false, onDirtyChange })
    await screen.findByText('Rope')
    expect(onDirtyChange).not.toHaveBeenCalledWith(true)
  })
})
