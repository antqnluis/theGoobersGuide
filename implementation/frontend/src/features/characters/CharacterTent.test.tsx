import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { countCharacterAdventures } from '../adventures/adventureService'
import { importCharacter } from './characterImportService'
import { getCharacterSheet } from './characterService'
import { campaignId, character, sheet, userId } from './characterTestData'
import type { CharacterSummary } from './characterTypes'
import type { CharacterConfirmation } from './CharacterStatusControls'
import { CharacterTent, type TentView } from './CharacterTent'

vi.mock('./characterImportService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterImportService')>()),
  importCharacter: vi.fn(),
}))

vi.mock('../adventures/adventureService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../adventures/adventureService')>()),
  countCharacterAdventures: vi.fn(),
}))

vi.mock('./characterService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterService')>()),
  getCharacterSheet: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCharacterSheet).mockResolvedValue(sheet())
  vi.mocked(countCharacterAdventures).mockResolvedValue(0)
})

function makeActions(overrides: Record<string, unknown> = {}) {
  return {
    error: null as string | null,
    clearError: vi.fn(),
    pendingAction: null as string | null,
    pendingCharacterId: null as string | null,
    create: vi.fn().mockResolvedValue(true),
    saveDetails: vi.fn().mockResolvedValue(true),
    changeStatus: vi.fn().mockResolvedValue(true),
    changeParty: vi.fn().mockResolvedValue(true),
    changeVisibility: vi.fn().mockResolvedValue(true),
    saveVitals: vi.fn().mockResolvedValue(true),
    saveSheet: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

function Harness({
  characters,
  status = 'success',
  actions,
  initialView = { type: 'list' },
  onNotice,
  onRetry = vi.fn(),
  onDirtyChange,
}: {
  characters: CharacterSummary[]
  status?: 'pending' | 'error' | 'success'
  actions: ReturnType<typeof makeActions>
  initialView?: TentView
  onNotice: (notice: string | null) => void
  onRetry?: () => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [view, setView] = useState<TentView>(initialView)
  const [confirmation, setConfirmation] = useState<CharacterConfirmation | null>(null)
  return (
    <CharacterTent
      actions={actions as never}
      campaignId={campaignId}
      characters={characters}
      confirmation={confirmation}
      onConfirmationChange={setConfirmation}
      onDirtyChange={onDirtyChange}
      onNotice={onNotice}
      onRetry={onRetry}
      onViewChange={setView}
      status={status}
      userId={userId}
      view={view}
    />
  )
}

function setup(props: Partial<React.ComponentProps<typeof Harness>> = {}) {
  const actions = props.actions ?? makeActions()
  const onNotice = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Harness actions={actions} characters={[]} onNotice={onNotice} {...props} />
    </QueryClientProvider>,
  )
  return { actions, onNotice, user: userEvent.setup() }
}

const retired = character({
  id: 'retired-1',
  name: 'Old Pip',
  status: 'retired',
  in_party: false,
  status_changed_at: '2024-03-12T10:00:00+00:00',
})
const other = character({ id: 'other-1', owner_id: 'someone-else', name: 'Not Mine' })

describe('CharacterTent list', () => {
  it('shows a loading status', () => {
    setup({ status: 'pending' })
    expect(screen.getByRole('status')).toHaveTextContent('Loading your characters…')
    expect(screen.queryByRole('button', { name: 'Create a character' })).not.toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    const onRetry = vi.fn()
    const { user } = setup({ status: 'error', onRetry })
    expect(screen.getByRole('alert')).toHaveTextContent('Your characters could not be loaded.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state with a create button', () => {
    setup()
    expect(screen.getByText('You have no character in this campaign yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create a character' })).toBeInTheDocument()
  })

  it('shows only the player’s own characters, never other members’', () => {
    setup({ characters: [other] })
    expect(screen.queryByText('Not Mine')).not.toBeInTheDocument()
    expect(screen.getByText('You have no character in this campaign yet.')).toBeInTheDocument()
  })

  it('shows the active character and withholds creation until it is retired', () => {
    setup({ characters: [character(), retired] })
    expect(screen.getByRole('heading', { name: 'Brand' })).toBeInTheDocument()
    const active = screen.getByRole('region', { name: 'Brand' })
    expect(within(active).getByText('Level 3 Elf Fighter')).toBeInTheDocument()
    // Lifecycle and party membership are separate badges.
    const standing = within(active).getByRole('list', { name: 'Character standing' })
    expect(within(standing).getByText('Active')).toBeInTheDocument()
    expect(within(standing).getByText('In the party')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create a character' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Import a character' })).not.toBeInTheDocument()
    expect(
      screen.getByText(/Retire or mark Brand deceased before creating or importing another/),
    ).toBeInTheDocument()
  })

  it('points to Import updates on the active character instead of importing a new one', async () => {
    const { user } = setup({ characters: [character()] })
    expect(screen.queryByRole('dialog', { name: 'Import a character' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Import updates' }))
    // The link opens the character's sheet, where Import updates lives under its tab.
    expect(await screen.findByLabelText('Current HP')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Import and export' }))
    expect(await screen.findByRole('button', { name: 'Import updates' })).toBeInTheDocument()
  })

  it('lists previous characters with status and date', () => {
    setup({ characters: [retired] })
    const history = screen.getByRole('region', { name: 'Previous characters' })
    expect(within(history).getByText('Old Pip')).toBeInTheDocument()
    expect(within(history).getByText('Retired 12 Mar 2024')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create a character' })).toBeInTheDocument()
  })

  it('surfaces an action error as an alert', () => {
    setup({ actions: makeActions({ error: 'You already have an active character here.' }) })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You already have an active character here.',
    )
  })
})

describe('CharacterTent create', () => {
  it('creates with the party checkbox ticked, announces it, and returns to the list', async () => {
    const { actions, onNotice, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create a character' }))
    expect(screen.getByLabelText('Name')).toHaveFocus()

    await user.type(screen.getByLabelText('Name'), 'Brand')
    await user.click(screen.getByRole('button', { name: 'Create character' }))

    expect(actions.create).toHaveBeenCalledWith(
      {
        name: 'Brand',
        species: null,
        class_name: null,
        subclass: null,
        background: null,
        level: 1,
      },
      true,
    )
    expect(onNotice).toHaveBeenLastCalledWith('Character created.')
    expect(screen.getByRole('button', { name: 'Create a character' })).toBeInTheDocument()
  })

  it('stays on the form with its input when the create fails', async () => {
    const actions = makeActions({ create: vi.fn().mockResolvedValue(false) })
    const { onNotice, user } = setup({ actions })
    await user.click(screen.getByRole('button', { name: 'Create a character' }))
    await user.type(screen.getByLabelText('Name'), 'Brand')
    await user.click(screen.getByRole('button', { name: 'Create character' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Brand')
    expect(onNotice).not.toHaveBeenCalledWith('Character created.')
  })

  it('cancels back to the list', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create a character' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Create a character' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My characters' })).toHaveFocus()
  })

  it('shows the creating label while the create runs', async () => {
    const actions = makeActions({ pendingAction: 'create' })
    const { user } = setup({ actions, initialView: { type: 'create' } })
    expect(screen.getByRole('button', { name: 'Creating character…' })).toBeDisabled()
    expect(user).toBeDefined()
  })
})

describe('CharacterTent unsaved edits', () => {
  async function openSheetAndEdit() {
    const out = setup({ characters: [character()] })
    await out.user.click(screen.getByRole('button', { name: 'Open Brand' }))
    await out.user.click(screen.getByRole('button', { name: 'Edit character' }))
    await out.user.type(await screen.findByLabelText('Features and traits'), 'Second Wind')
    return out
  }

  it('reports edits so the camp can guard closing', async () => {
    const onDirtyChange = vi.fn()
    const { user } = setup({ characters: [character()], onDirtyChange })
    await user.click(screen.getByRole('button', { name: 'Open Brand' }))
    await user.click(screen.getByRole('button', { name: 'Edit character' }))
    await user.type(await screen.findByLabelText('Features and traits'), 'x')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('asks before going back with unsaved edits, and keeps them if told to', async () => {
    const { user } = await openSheetAndEdit()
    await user.click(screen.getByRole('button', { name: 'Back to character sheet' }))
    const prompt = screen.getByRole('alertdialog', { name: 'Leave without saving?' })
    await user.click(within(prompt).getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Features and traits')).toHaveValue('Second Wind')
  })

  it('discards the edits and goes back when told to', async () => {
    const { user } = await openSheetAndEdit()
    await user.click(screen.getByRole('button', { name: 'Back to character sheet' }))
    await user.click(screen.getByRole('button', { name: 'Discard and go back' }))
    expect(screen.getByRole('button', { name: 'Edit character' })).toBeInTheDocument()
  })

  it('goes back without a question when nothing changed', async () => {
    const { user } = setup({ characters: [character()] })
    await user.click(screen.getByRole('button', { name: 'Open Brand' }))
    await screen.findByLabelText('Current HP')
    await user.click(screen.getByRole('button', { name: 'Back to my characters' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('asks before cancelling a form that has been filled in', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create a character' }))
    await user.type(screen.getByLabelText('Name'), 'Dra')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('does not ask once a save has gone through', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create a character' }))
    await user.type(screen.getByLabelText('Name'), 'Brand')
    await user.click(screen.getByRole('button', { name: 'Create character' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create a character' })).toBeInTheDocument()
  })
})

describe('CharacterTent sheet display and editor', () => {
  it('shows the sheet read-only, with current and temporary HP as its only quick edits', async () => {
    const { actions, user } = setup({ characters: [character()] })
    await user.click(screen.getByRole('button', { name: 'Open Brand' }))
    const hp = await screen.findByLabelText('Current HP')
    expect(hp).toHaveValue(12)
    expect(screen.queryByLabelText('Maximum HP')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Strength score')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Features and traits')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save sheet' })).not.toBeInTheDocument()

    await user.clear(hp)
    await user.type(hp, '9')
    await user.clear(screen.getByLabelText('Temporary HP'))
    await user.type(screen.getByLabelText('Temporary HP'), '4')
    await user.click(screen.getByRole('button', { name: 'Save stats' }))
    expect(actions.saveVitals).toHaveBeenCalledWith(character().id, { current_hp: 9, temp_hp: 4 })
  })

  it('opens one editor for details and sheet, and comes back', async () => {
    const { user } = setup({ characters: [character()] })
    await user.click(screen.getByRole('button', { name: 'Open Brand' }))
    await user.click(screen.getByRole('button', { name: 'Edit character' }))
    expect(screen.getByRole('heading', { name: 'Edit Brand' })).toHaveFocus()
    expect(screen.getByLabelText('Name')).toHaveValue('Brand')
    expect(await screen.findByLabelText('Strength score')).toBeInTheDocument()
    expect(screen.getByLabelText('Maximum HP')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to character sheet' }))
    expect(screen.getByRole('button', { name: 'Edit character' })).toBeInTheDocument()
  })
})

describe('CharacterTent detail', () => {
  it('opens a character with its sheet, controls, and a way back', async () => {
    const { user } = setup({ characters: [character()] })
    await user.click(screen.getByRole('button', { name: 'Open Brand' }))
    expect(screen.getByRole('heading', { name: 'Brand' })).toHaveFocus()
    const standing = screen.getByRole('list', { name: 'Character standing' })
    expect(within(standing).getByText('Active')).toBeInTheDocument()
    expect(within(standing).getByText('In the party')).toBeInTheDocument()
    expect(within(standing).getByText('Sheet private')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Vitals' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to my characters' }))
    expect(screen.getByRole('button', { name: 'Open Brand' })).toBeInTheDocument()
  })

  it('edits details on the same screen as the sheet, and stays there', async () => {
    const { actions, onNotice, user } = setup({ characters: [character()] })
    await user.click(screen.getByRole('button', { name: 'Open Brand' }))
    await user.click(screen.getByRole('button', { name: 'Edit character' }))
    expect(screen.getByRole('heading', { name: 'Edit Brand' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Strength score')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Brand the Bold')
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    expect(actions.saveDetails).toHaveBeenCalledWith(
      character().id,
      expect.objectContaining({ name: 'Brand the Bold', species: 'Elf', class_name: 'Fighter' }),
    )
    expect(onNotice).toHaveBeenLastCalledWith('Character saved.')
    expect(screen.getByRole('heading', { name: 'Edit Brand' })).toBeInTheDocument()
  })

  it.each([
    ['Retire', 'Yes, retire', 'retired', 'Brand retired.'],
    ['Mark deceased', 'Yes, mark deceased', 'deceased', 'Brand is marked deceased.'],
  ])('%s asks first, then announces', async (trigger, yes, status, notice) => {
    const { actions, onNotice, user } = setup({ characters: [character()] })
    await user.click(screen.getByRole('button', { name: 'Open Brand' }))
    await user.click(screen.getByRole('button', { name: trigger }))
    expect(actions.changeStatus).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: yes }))
    expect(actions.changeStatus).toHaveBeenCalledWith(character().id, status)
    expect(onNotice).toHaveBeenLastCalledWith(notice)
    // The confirmation is gone (the coin log's <details> also has the group role).
    expect(screen.queryByRole('group', { name: /^Confirm/ })).not.toBeInTheDocument()
  })

  it('keeps the confirmation open when the status change fails', async () => {
    const actions = makeActions({ changeStatus: vi.fn().mockResolvedValue(false) })
    const { user } = setup({ actions, characters: [character()] })
    await user.click(screen.getByRole('button', { name: 'Open Brand' }))
    await user.click(screen.getByRole('button', { name: 'Retire' }))
    await user.click(screen.getByRole('button', { name: 'Yes, retire' }))
    expect(screen.getByRole('group', { name: 'Confirm: Retire' })).toBeInTheDocument()
  })

  it('announces joining and leaving the party and sharing', async () => {
    const { actions, onNotice, user } = setup({ characters: [character()] })
    await user.click(screen.getByRole('button', { name: 'Open Brand' }))
    await user.click(screen.getByRole('button', { name: 'Leave the party' }))
    expect(actions.changeParty).toHaveBeenCalledWith(character().id, false)
    expect(onNotice).toHaveBeenLastCalledWith('Brand left the party.')

    await user.click(screen.getByLabelText('Share sheet with campaign members'))
    expect(actions.changeVisibility).toHaveBeenCalledWith(character().id, 'campaign')
    expect(onNotice).toHaveBeenLastCalledWith("Brand's sheet is shared with campaign members.")
  })

  it('deletes after confirmation and returns to the list', async () => {
    const { actions, onNotice, user } = setup({ characters: [character()] })
    await user.click(screen.getByRole('button', { name: 'Open Brand' }))
    await user.click(screen.getByRole('button', { name: 'Delete character' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete character' }))
    expect(actions.remove).toHaveBeenCalledWith(character().id, null)
    expect(onNotice).toHaveBeenLastCalledWith('Character deleted.')
    expect(screen.getByText('Open Brand', { exact: false, selector: 'button' })).toBeInTheDocument()
  })

  it('tells the player how many adventures deleting the character takes with it', async () => {
    vi.mocked(countCharacterAdventures).mockResolvedValue(2)
    const { user } = setup({ characters: [character()] })
    await user.click(screen.getByRole('button', { name: 'Open Brand' }))
    expect(countCharacterAdventures).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete character' }))
    expect(
      await screen.findByText(/Its 2 adventures will be deleted too\./, { exact: false }),
    ).toBeVisible()
    expect(countCharacterAdventures).toHaveBeenCalledWith(character().id)
  })

  it('still confirms the delete when the adventure count cannot be read', async () => {
    vi.mocked(countCharacterAdventures).mockRejectedValue(new Error('network down'))
    const { user } = setup({ characters: [character()] })
    await user.click(screen.getByRole('button', { name: 'Open Brand' }))
    await user.click(screen.getByRole('button', { name: 'Delete character' }))
    const group = screen.getByRole('group', { name: 'Confirm character deletion' })
    expect(group).not.toHaveTextContent('adventure')
    expect(screen.getByRole('button', { name: 'Yes, delete character' })).toBeEnabled()
  })

  it('falls back to the list when the open character is gone', () => {
    setup({ characters: [], initialView: { type: 'character', id: 'vanished' } })
    expect(screen.getByRole('button', { name: 'Create a character' })).toBeInTheDocument()
  })

  it('opens a retired character from history with a return-to-active control', async () => {
    const { user } = setup({ characters: [retired] })
    await user.click(screen.getByRole('button', { name: 'Open Old Pip' }))
    expect(screen.getByRole('heading', { name: 'Old Pip' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return to active' })).toBeInTheDocument()
    const standing = screen.getByRole('list', { name: 'Character standing' })
    expect(within(standing).getByText('Retired 12 Mar 2024')).toBeInTheDocument()
    expect(within(standing).getByText('Not in the party')).toBeInTheDocument()
    expect(within(standing).getByText('Sheet private')).toBeInTheDocument()
  })

  it('disables navigation while an action runs', async () => {
    const actions = makeActions({ pendingAction: 'status', pendingCharacterId: character().id })
    setup({
      actions,
      characters: [character()],
      initialView: { type: 'character', id: character().id },
    })
    expect(screen.getByRole('button', { name: 'Back to my characters' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit character' })).toBeDisabled()
  })
})

describe('CharacterTent import', () => {
  const newId = '00000000-0000-4000-8000-0000000000aa'
  const imported = character({
    id: newId,
    name: 'Arlen Vale',
    status: 'retired',
    in_party: false,
    status_changed_at: '2024-04-01T10:00:00+00:00',
  })
  const document = JSON.stringify({
    format: 'the-goobers-guide-character',
    version: 3,
    character: { name: 'Arlen Vale' },
  })

  it('offers import next to create when there is no character yet', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Create a character' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import a character' })).toBeInTheDocument()
  })

  it('offers import next to create when the last character has gone', () => {
    setup({ characters: [retired] })
    expect(screen.getByRole('button', { name: 'Import a character' })).toBeInTheDocument()
  })

  it('does not offer import while a character is active, and says why', () => {
    setup({ characters: [character()] })
    expect(screen.queryByRole('button', { name: 'Import a character' })).not.toBeInTheDocument()
    expect(screen.getByText(/before creating or importing another character/)).toBeInTheDocument()
  })

  it('does not offer import while the characters are loading or failed', () => {
    setup({ status: 'pending' })
    expect(screen.queryByRole('button', { name: 'Import a character' })).not.toBeInTheDocument()
  })

  it('opens and closes the import dialog without changing the view', async () => {
    const { user, onNotice } = setup({ characters: [retired] })
    await user.click(screen.getByRole('button', { name: 'Import a character' }))
    expect(screen.getByRole('dialog', { name: 'Import a character' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import a character' })).toBeInTheDocument()
    expect(onNotice).not.toHaveBeenCalled()
  })

  it('opens the new character’s sheet and announces the import', async () => {
    vi.mocked(importCharacter).mockResolvedValue(newId)
    const { user, onNotice } = setup({ characters: [retired, imported] })
    await user.click(screen.getByRole('button', { name: 'Import a character' }))
    await user.click(screen.getByLabelText('Character document (JSON)'))
    await user.paste(document)
    await user.click(screen.getByRole('button', { name: 'Create character' }))

    expect(await screen.findByRole('heading', { name: 'Arlen Vale' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to my characters' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onNotice).toHaveBeenCalledWith('Character imported.')
    expect(importCharacter).toHaveBeenCalledTimes(1)
  })
})
