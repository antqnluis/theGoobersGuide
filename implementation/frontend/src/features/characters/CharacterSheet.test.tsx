import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CharacterSheet, type SheetActions } from './CharacterSheet'
import { getCharacterSheet } from './characterService'
import { character, sheet, userId } from './characterTestData'
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
  vi.mocked(listCharacterItems).mockResolvedValue([])
})

function actions(overrides: Partial<SheetActions> = {}) {
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
  } satisfies SheetActions
}

function renderSheet({
  readOnly = false,
  sheetActions = actions(),
  onNotice = vi.fn(),
}: { readOnly?: boolean; sheetActions?: SheetActions; onNotice?: (n: string) => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CharacterSheet
        actions={sheetActions}
        character={character()}
        onNotice={onNotice}
        readOnly={readOnly}
        userId={userId}
      />
    </QueryClientProvider>,
  )
  return { sheetActions, onNotice, user: userEvent.setup() }
}

const fullSheet = () =>
  sheet({
    sheet: {
      ...defaultSheetBody(),
      abilities: { str: 18, dex: 14, con: 12, int: 8, wis: 13, cha: 10 },
      saving_throws: ['str'],
      skills: { athletics: 'proficient', stealth: 'expertise' },
      attacks: [{ name: 'Greataxe', bonus: '+6', damage: '1d12+4', notes: 'Heavy' }],
      features: 'Rage',
      alignment: 'CN',
      experience: 300,
    },
  })

describe('CharacterSheet states', () => {
  it('shows a loading status, then the sheet', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    renderSheet()
    expect(screen.getByRole('status')).toHaveTextContent('Loading character sheet…')
    expect(await screen.findByRole('heading', { name: 'Vitals' })).toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    vi.mocked(getCharacterSheet).mockRejectedValueOnce(new Error('network'))
    const { user } = renderSheet()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The character sheet could not be loaded.',
    )
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Vitals' })).toBeInTheDocument()
  })

  it('says so when the sheet is hidden or gone', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(null)
    renderSheet()
    expect(await screen.findByText('This sheet is no longer available.')).toBeInTheDocument()
  })
})

describe('CharacterSheet (owner)', () => {
  it('shows vitals, derived values, and every ability with modifier and save', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(fullSheet())
    renderSheet()
    expect(await screen.findByLabelText('Current HP')).toHaveValue(12)
    expect(screen.getByLabelText('Maximum HP')).toHaveValue(30)
    expect(screen.getByLabelText('Armor class')).toHaveValue(15)
    // Level 3: +2 proficiency; Dex 14 initiative +2; Wis 13 passive Perception 11.
    expect(screen.getByText('Proficiency bonus').nextSibling).toHaveTextContent('+2')
    expect(screen.getByText('Initiative').nextSibling).toHaveTextContent('+2')
    expect(screen.getByText('Passive Perception').nextSibling).toHaveTextContent('11')
    expect(screen.getByLabelText('Strength score')).toHaveValue(18)
    const strength = screen.getByRole('heading', { name: 'Strength' }).closest('li')!
    expect(within(strength).getByText('+4')).toBeInTheDocument()
    expect(within(strength).getByText('+6')).toBeInTheDocument()
    expect(screen.getByLabelText('Strength saving throw proficiency')).toBeChecked()
    expect(screen.getByLabelText('Dexterity saving throw proficiency')).not.toBeChecked()
  })

  it('shows "Not set" placeholders for unset vitals', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(
      sheet({ max_hp: null, current_hp: null, armor_class: null, speed: null }),
    )
    renderSheet()
    expect(await screen.findByLabelText('Current HP')).toHaveValue(null)
    expect(screen.getByLabelText('Current HP')).toHaveAttribute('placeholder', 'Not set')
  })

  it('saves only the changed vitals', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    const { sheetActions, onNotice, user } = renderSheet()
    const saveButton = await screen.findByRole('button', { name: 'Save stats' })
    expect(saveButton).toBeDisabled()

    await user.clear(screen.getByLabelText('Current HP'))
    await user.type(screen.getByLabelText('Current HP'), '5')
    await user.click(saveButton)
    expect(sheetActions.saveVitals).toHaveBeenCalledWith(character().id, { current_hp: 5 })
    expect(onNotice).toHaveBeenCalledWith('Stats saved.')
  })

  it('refuses current HP above maximum and explains why', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    const { sheetActions, user } = renderSheet()
    await user.clear(await screen.findByLabelText('Current HP'))
    await user.type(screen.getByLabelText('Current HP'), '31')
    await user.click(screen.getByRole('button', { name: 'Save stats' }))
    expect(sheetActions.saveVitals).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Current HP can’t be higher than maximum HP.',
    )
  })

  it('treats a cleared temporary HP as zero and clears an optional vital to null', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet({ temp_hp: 4 }))
    const { sheetActions, user } = renderSheet()
    await user.clear(await screen.findByLabelText('Temporary HP'))
    await user.clear(screen.getByLabelText('Speed'))
    await user.click(screen.getByRole('button', { name: 'Save stats' }))
    expect(sheetActions.saveVitals).toHaveBeenCalledWith(character().id, {
      temp_hp: 0,
      speed: null,
    })
  })

  it('edits abilities, saves, skills, and attacks, then saves the body against the stamp', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    const { sheetActions, onNotice, user } = renderSheet()
    const save = await screen.findByRole('button', { name: 'Save sheet' })
    expect(save).toBeDisabled()

    const strength = screen.getByLabelText('Strength score')
    await user.clear(strength)
    await user.type(strength, '16')
    await user.click(screen.getByLabelText('Constitution saving throw proficiency'))
    await user.selectOptions(screen.getByLabelText('Stealth proficiency'), 'expertise')
    await user.click(screen.getByRole('button', { name: 'Add attack' }))
    await user.type(screen.getByLabelText('Attack 1 name'), 'Sword')
    await user.type(screen.getByLabelText('Features and traits'), 'Second Wind')
    expect(save).toBeEnabled()

    await user.click(save)
    expect(sheetActions.saveSheet).toHaveBeenCalledTimes(1)
    const [id, body, stamp] = vi.mocked(sheetActions.saveSheet).mock.calls[0]
    expect(id).toBe(character().id)
    expect(stamp).toBe('2026-11-13T10:05:00+00:00')
    expect(body.abilities.str).toBe(16)
    expect(body.saving_throws).toEqual(['con'])
    expect(body.skills).toEqual({ stealth: 'expertise' })
    expect(body.attacks).toEqual([{ name: 'Sword', bonus: '', damage: '', notes: '' }])
    expect(body.features).toBe('Second Wind')
    expect(onNotice).toHaveBeenCalledWith('Character sheet saved.')
  })

  it('refuses an invalid body and lists the problems', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    const { sheetActions, user } = renderSheet()
    const strength = await screen.findByLabelText('Strength score')
    await user.clear(strength)
    await user.type(strength, '31')
    await user.click(screen.getByRole('button', { name: 'Save sheet' }))
    expect(sheetActions.saveSheet).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ability scores must be whole numbers between 1 and 30.',
    )
  })

  it('discards unsaved edits', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    const { user } = renderSheet()
    const features = await screen.findByLabelText('Features and traits')
    await user.type(features, 'Draft')
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(features).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save sheet' })).toBeDisabled()
  })

  it('keeps the draft when the body save fails', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    const sheetActions = actions({ saveSheet: vi.fn().mockResolvedValue(false) })
    const { onNotice, user } = renderSheet({ sheetActions })
    const features = await screen.findByLabelText('Features and traits')
    await user.type(features, 'Draft')
    await user.click(screen.getByRole('button', { name: 'Save sheet' }))
    expect(features).toHaveValue('Draft')
    expect(onNotice).not.toHaveBeenCalled()
  })

  it('does not lose a body draft when stats are saved elsewhere on the sheet', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    const { user } = renderSheet()
    await user.type(await screen.findByLabelText('Features and traits'), 'Draft')
    await user.clear(screen.getByLabelText('Speed'))
    await user.type(screen.getByLabelText('Speed'), '25')
    await user.click(screen.getByRole('button', { name: 'Save stats' }))
    expect(screen.getByLabelText('Features and traits')).toHaveValue('Draft')
  })

  it('shows pending labels and disables the controls while saving', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    const id = character().id
    renderSheet({ sheetActions: actions({ pendingAction: 'sheet', pendingCharacterId: id }) })
    expect(await screen.findByRole('button', { name: 'Saving sheet…' })).toBeDisabled()
    expect(screen.getByLabelText('Strength score')).toBeDisabled()
  })

  it('removes and caps attacks', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(fullSheet())
    const { user } = renderSheet()
    await screen.findByLabelText('Attack 1 name')
    await user.click(screen.getByRole('button', { name: 'Remove attack 1' }))
    expect(screen.queryByLabelText('Attack 1 name')).not.toBeInTheDocument()
    expect(screen.getByText('No attacks recorded.')).toBeInTheDocument()
  })
})

describe('CharacterSheet (read-only)', () => {
  it('renders values as text with no inputs or save controls', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(fullSheet())
    renderSheet({ readOnly: true })
    expect(await screen.findByRole('heading', { name: 'Vitals' })).toBeInTheDocument()
    expect(document.querySelector('input, textarea, select')).toBeNull()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('12 / 30')).toBeInTheDocument()
    expect(screen.getByText('30 ft.')).toBeInTheDocument()
    expect(screen.getByText('Greataxe')).toBeInTheDocument()
    expect(screen.getByText('Rage')).toBeInTheDocument()
    expect(screen.getByText('CN')).toBeInTheDocument()
    expect(screen.getByText('300')).toBeInTheDocument()
    expect(screen.getByText(/Athletics/).closest('li')).toHaveTextContent('+6 · proficient')
  })

  it('shows "Not set" and "Nothing recorded." for empty values', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(
      sheet({ max_hp: null, current_hp: null, armor_class: null, speed: null }),
    )
    renderSheet({ readOnly: true })
    expect(await screen.findAllByText('Not set')).not.toHaveLength(0)
    expect(screen.getAllByText('Nothing recorded.')).toHaveLength(3)
    expect(screen.getByText('No attacks recorded.')).toBeInTheDocument()
  })

  it('is read-only whenever no actions are given', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <CharacterSheet character={character()} readOnly={false} userId={userId} />
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('heading', { name: 'Vitals' })).toBeInTheDocument()
    expect(document.querySelector('input')).toBeNull()
  })
})

describe('CharacterSheet save bar and unsaved edits', () => {
  function renderWithDirty(onDirtyChange: (dirty: boolean) => void, dock?: HTMLElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <CharacterSheet
          actions={actions()}
          character={character()}
          dock={dock}
          onDirtyChange={onDirtyChange}
          readOnly={false}
          userId={userId}
        />
      </QueryClientProvider>,
    )
    return userEvent.setup()
  }

  it('enables Save stats only once a stat changes, and says so', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    const onDirtyChange = vi.fn()
    const user = renderWithDirty(onDirtyChange)
    const save = await screen.findByRole('button', { name: 'Save stats' })
    expect(save).toBeDisabled()
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)

    await user.type(screen.getByLabelText('Speed'), '5')
    expect(save).toBeEnabled()
    expect(screen.getByText('Unsaved stats')).toBeInTheDocument()
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    expect(screen.getByRole('button', { name: 'Save sheet' })).toBeDisabled()
  })

  it('discards stat edits as well as sheet edits', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    const user = renderWithDirty(vi.fn())
    await user.type(await screen.findByLabelText('Speed'), '5')
    await user.type(screen.getByRole('textbox', { name: 'Spells' }), 'Light')
    expect(screen.getByText('Unsaved stats and sheet changes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.getByLabelText('Speed')).toHaveValue(30)
    expect(screen.getByRole('textbox', { name: 'Spells' })).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save stats' })).toBeDisabled()
  })

  it('reports clean again when the sheet unmounts', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    const onDirtyChange = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={client}>
        <CharacterSheet
          actions={actions()}
          character={character()}
          onDirtyChange={onDirtyChange}
          readOnly={false}
          userId={userId}
        />
      </QueryClientProvider>,
    )
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: 'Spells' }), 'Light')
    view.unmount()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('places the save bar in a dock when one is given', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    const dock = document.createElement('div')
    document.body.append(dock)
    renderWithDirty(vi.fn(), dock)
    await screen.findByRole('heading', { name: 'Vitals' })
    expect(within(dock).getByRole('button', { name: 'Save stats' })).toBeInTheDocument()
    dock.remove()
  })

  it('offers a jump to each section of the sheet', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
    const user = renderWithDirty(vi.fn())
    const nav = await screen.findByRole('navigation', { name: 'Sheet sections' })
    await user.click(within(nav).getByRole('button', { name: 'Skills' }))
    expect(screen.getByRole('heading', { name: 'Skills' })).toHaveFocus()
  })
})
