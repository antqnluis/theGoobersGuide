import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CharacterSheet, type SheetActions } from './CharacterSheet'
import { listCharacterImports } from './characterImportService'
import { downloadMarkdown } from './characterMarkdownDownload'
import { getCharacterSheet } from './characterService'
import { character, item, sheet, userId } from './characterTestData'
import { defaultSheetBody } from './characterValidation'
import { listCharacterItems } from './inventoryService'

vi.mock('./characterImportService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterImportService')>()),
  listCharacterImports: vi.fn(),
}))

vi.mock('./characterMarkdownDownload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterMarkdownDownload')>()),
  downloadMarkdown: vi.fn(),
}))

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

/** Opens the import and export tools tab (owners and read-only viewers name it differently). */
async function openTools(user: ReturnType<typeof userEvent.setup>, owner: boolean) {
  await user.click(
    await screen.findByRole('button', { name: owner ? 'Import and export' : 'Export and history' }),
  )
}

const fullSheet = () =>
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
          damage: '1d12+4',
          notes: 'Heavy',
        },
      ],
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
    expect(body.attacks).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
        name: 'Sword',
        bonus: '',
        damage: '',
        notes: '',
      },
    ])
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
    // The only controls on a read-only sheet switch views and fold sections away, besides the
    // roll buttons on your own sheet.
    const controls = screen
      .getAllByRole('button')
      .filter((button) => !button.classList.contains('roll-button'))
    expect(controls.map((button) => button.textContent)).toEqual([
      'Sheet',
      'Export and history',
      'Collapse features and notes',
      'Collapse inventory',
    ])
    expect(screen.getByText('12 / 30')).toBeInTheDocument()
    expect(screen.getByText('30 ft.')).toBeInTheDocument()
    expect(screen.getByText('Greataxe')).toBeInTheDocument()
    expect(screen.getByText('Rage')).toBeInTheDocument()
    expect(screen.getByText('CN')).toBeInTheDocument()
    expect(screen.getByText('300')).toBeInTheDocument()
    expect(screen.getByText(/Athletics/).closest('li')).toHaveTextContent(/\+6\s*proficient/)
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

describe('CharacterSheet spells', () => {
  const withSpells = () =>
    sheet({
      sheet: {
        ...defaultSheetBody(),
        spells: 'Cantrips: Light\n1st level (2 slots): Shield, Magic Missile',
      },
    })

  it('shows the spells as a spell book in the display view', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(withSpells())
    renderSheet({ readOnly: true })
    const slots = await screen.findByRole('region', { name: '1st level' })
    expect(within(slots).getByText('2 slots')).toBeInTheDocument()
    expect(within(slots).getByText('Magic Missile')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cantrips' })).toBeInTheDocument()
  })

  it('explains the format while editing and previews it', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(withSpells())
    const { user } = renderSheet()
    const field = await screen.findByRole('textbox', { name: 'Spells' })
    expect(field).toHaveAccessibleDescription(/one group per line/i)
    await user.click(screen.getByText('Preview'))
    expect(screen.getByRole('region', { name: '1st level' })).toBeInTheDocument()
    await user.clear(field)
    expect(screen.queryByText('Preview')).not.toBeInTheDocument()
  })
})

describe('CharacterSheet export and history', () => {
  it('exports the saved character as Markdown and says so', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(fullSheet())
    vi.mocked(listCharacterItems).mockResolvedValue([item({ name: 'Rope' })])
    const onNotice = vi.fn()
    const { user } = renderSheet({ readOnly: true, onNotice })
    await openTools(user, false)
    const button = await screen.findByRole('button', { name: 'Export Markdown' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)

    expect(downloadMarkdown).toHaveBeenCalledTimes(1)
    const [filename, text] = vi.mocked(downloadMarkdown).mock.calls[0]
    expect(filename).toBe('brand.md')
    expect(text).toContain('# Brand')
    expect(text).toContain('Greataxe')
    expect(text).toContain('Rope')
    expect(onNotice).toHaveBeenCalledWith('Markdown downloaded.')
  })

  it('is disabled while there are unsaved edits, and explains why', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(fullSheet())
    const { user } = renderSheet()
    await user.type(await screen.findByLabelText('Notes and backstory'), ' more')
    await openTools(user, true)
    const button = await screen.findByRole('button', { name: 'Export Markdown' })
    expect(button).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Import updates' })).toBeDisabled()
    // One explanation beside each of the two buttons.
    expect(screen.getAllByText('Save or cancel your edits first.')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(button).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Import updates' })).toBeEnabled()
  })

  it('offers Import updates to the owner only, and opens the review', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(fullSheet())
    vi.mocked(listCharacterItems).mockResolvedValue([item({ name: 'Rope' })])
    const { user } = renderSheet()
    await openTools(user, true)
    const button = await screen.findByRole('button', { name: 'Import updates' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    expect(screen.getByRole('dialog', { name: 'Import updates' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Import updates' })).not.toBeInTheDocument(),
    )
    cleanup()

    vi.mocked(getCharacterSheet).mockResolvedValue(fullSheet())
    const reader = renderSheet({ readOnly: true })
    await openTools(reader.user, false)
    await screen.findByRole('button', { name: 'Export Markdown' })
    expect(screen.queryByRole('button', { name: 'Import updates' })).not.toBeInTheDocument()
  })

  it('swaps the sheet for the tools and back, keeping unsaved edits', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(fullSheet())
    const { user } = renderSheet()
    await user.type(await screen.findByLabelText('Notes and backstory'), ' more')
    const tools = screen.getByRole('button', { name: 'Import and export' })
    expect(tools).toHaveAttribute('aria-pressed', 'false')
    await user.click(tools)
    expect(tools).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Export and history' })).toBeInTheDocument()
    expect(screen.getByLabelText('Notes and backstory')).not.toBeVisible()
    expect(screen.getByText('Unsaved sheet changes')).toBeInTheDocument()
    // A section tab brings the sheet back, with the edit still there.
    await user.click(screen.getByRole('button', { name: 'Attacks' }))
    expect(tools).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('heading', { name: 'Export and history' })).not.toBeInTheDocument()
    expect((screen.getByLabelText('Notes and backstory') as HTMLTextAreaElement).value).toContain(
      ' more',
    )
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Attacks' })).toHaveFocus())
  })

  it('reports a download that fails', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(fullSheet())
    vi.mocked(downloadMarkdown).mockImplementation(() => {
      throw new Error('blocked')
    })
    const { user } = renderSheet({ readOnly: true })
    await openTools(user, false)
    const button = await screen.findByRole('button', { name: 'Export Markdown' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be downloaded')
  })

  it('shows the import history only once it is opened', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(fullSheet())
    vi.mocked(listCharacterImports).mockResolvedValue([
      {
        id: '1',
        kind: 'new',
        source_label: 'arlen.md',
        change_count: 4,
        imported_at: '2026-11-15T10:00:00+00:00',
      },
    ])
    const { user } = renderSheet({ readOnly: true })
    await screen.findByRole('heading', { name: 'Vitals' })
    expect(listCharacterImports).not.toHaveBeenCalled()
    await openTools(user, false)
    expect(listCharacterImports).not.toHaveBeenCalled()
    await user.click(screen.getByText('Import history'))
    expect(await screen.findByText('Imported as new')).toBeInTheDocument()
    expect(screen.getByText(/arlen\.md/)).toBeInTheDocument()
  })
})

describe('CharacterSheet folding sections', () => {
  it('folds the inventory and the notes away and back, keeping their headings', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(fullSheet())
    vi.mocked(listCharacterItems).mockResolvedValue([item({ name: 'Rope' })])
    const { user } = renderSheet({ readOnly: true })
    const inventory = await screen.findByRole('button', { name: 'Collapse inventory' })
    const notes = screen.getByRole('button', { name: 'Collapse features and notes' })
    expect(inventory).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('Rope')).toBeVisible()
    expect(screen.getByText('Rage')).toBeVisible()

    await user.click(inventory)
    expect(screen.getByRole('button', { name: 'Expand inventory' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.getByText('Rope')).not.toBeVisible()
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeVisible()
    expect(screen.getByText('Rage')).toBeVisible()

    await user.click(notes)
    expect(screen.getByText('Rage')).not.toBeVisible()
    expect(screen.getByRole('heading', { name: 'Features and notes' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Expand inventory' }))
    await user.click(screen.getByRole('button', { name: 'Expand features and notes' }))
    expect(screen.getByText('Rope')).toBeVisible()
    expect(screen.getByText('Rage')).toBeVisible()
  })

  it('ties each button to the body it folds', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(fullSheet())
    const { user } = renderSheet({ readOnly: true })
    const button = await screen.findByRole('button', { name: 'Collapse features and notes' })
    const body = document.getElementById(button.getAttribute('aria-controls')!)!
    expect(body).toContainElement(screen.getByText('Rage'))
    await user.click(button)
    expect(body).toHaveAttribute('hidden')
  })

  it('keeps unsaved edits in a folded section, still unsaved and still blocking export', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(fullSheet())
    const { user } = renderSheet()
    const notes = await screen.findByLabelText('Notes and backstory')
    await user.type(notes, ' more')
    await user.click(screen.getByRole('button', { name: 'Collapse features and notes' }))
    expect(notes).not.toBeVisible()
    expect(screen.getByText('Unsaved sheet changes')).toBeInTheDocument()
    await openTools(user, true)
    expect(screen.getByRole('button', { name: 'Export Markdown' })).toBeDisabled()
    // The Notes tab brings the sheet back and opens the folded section.
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    expect((screen.getByLabelText('Notes and backstory') as HTMLTextAreaElement).value).toContain(
      ' more',
    )
  })

  it('opens a folded section when its tab is chosen', async () => {
    vi.mocked(getCharacterSheet).mockResolvedValue(fullSheet())
    vi.mocked(listCharacterItems).mockResolvedValue([item({ name: 'Rope' })])
    const { user } = renderSheet()
    await user.click(await screen.findByRole('button', { name: 'Collapse inventory' }))
    expect(screen.queryByText('Rope')).not.toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Inventory' }))
    expect(screen.getByRole('button', { name: 'Collapse inventory' })).toBeInTheDocument()
    expect(screen.getByText('Rope')).toBeVisible()
  })
})
