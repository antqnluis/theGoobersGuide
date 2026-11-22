import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CharacterUpdateReview } from './CharacterUpdateReview'
import { applyCharacterUpdate } from './characterImportService'
import { character, item, sheet, userId } from './characterTestData'
import { getCharacterSheet, listCampaignCharacters } from './characterService'
import { defaultSheetBody } from './characterValidation'
import { listCharacterItems } from './inventoryService'
import type { CurrentCharacter } from './characterUpdateDocument'

vi.mock('./characterImportService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterImportService')>()),
  applyCharacterUpdate: vi.fn(),
}))
vi.mock('./characterService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterService')>()),
  getCharacterSheet: vi.fn(),
  listCampaignCharacters: vi.fn(),
}))
vi.mock('./inventoryService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./inventoryService')>()),
  listCharacterItems: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

const ATTACK_ID = '3f1c9a52-8d4e-4b7a-9c61-0a2b5d7e9f10'
const ITEM_ID = '00000000-0000-4000-8000-000000000031'

function currentCharacter(): CurrentCharacter {
  return {
    character: character({ level: 3 }),
    sheet: sheet({
      gp: 5,
      sheet: {
        ...defaultSheetBody(),
        attacks: [{ id: ATTACK_ID, name: 'Greataxe', bonus: '+6', damage: '1d12+4', notes: '' }],
      },
    }),
    items: [item({ id: ITEM_ID, name: 'Rope', quantity: 1 })],
  }
}

function update(changes: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: 'the-goobers-guide-character-update',
    version: 2,
    changes,
    ...extra,
  })
}

const goodChanges = {
  details: { set: { level: 4 } },
  vitals: { set: { max_hp: 40 } },
  attacks: [{ op: 'update', id: ATTACK_ID, set: { bonus: '+7' } }],
  inventory: [{ op: 'update', id: ITEM_ID, set: { quantity: 3 } }],
  currency: { set: { gp: 20 } },
}

function setup(props: { onClose?: () => void; onApplied?: (count: number) => void } = {}) {
  const onClose = props.onClose ?? vi.fn()
  const onApplied = props.onApplied ?? vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  const current = currentCharacter()
  render(
    <QueryClientProvider client={client}>
      <CharacterUpdateReview
        current={current}
        onApplied={onApplied}
        onClose={onClose}
        userId={userId}
      />
    </QueryClientProvider>,
  )
  return { current, onApplied, onClose, user }
}

async function paste(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByLabelText('Update document (JSON)'))
  await user.paste(text)
}

const applyButton = () => screen.getByRole('button', { name: /^Apply|^Applying/ })

describe('CharacterUpdateReview', () => {
  it('opens empty with nothing to apply', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Import updates' })).toBeInTheDocument()
    expect(applyButton()).toBeDisabled()
    expect(screen.queryByRole('region', { name: 'Review' })).not.toBeInTheDocument()
  })

  it('copies a prompt that carries the current sheet and its ids', async () => {
    const { user } = setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await user.click(screen.getByText('How do I make an update?'))
    await user.click(screen.getByRole('button', { name: 'Copy update prompt' }))
    expect(write).toHaveBeenCalledTimes(1)
    const prompt = write.mock.calls[0][0]
    expect(prompt).toContain(ATTACK_ID)
    expect(prompt).toContain(ITEM_ID)
    expect(prompt).toContain('the-goobers-guide-character-update')
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('tells the player to copy by hand when the clipboard is unavailable', async () => {
    const { user } = setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    await user.click(screen.getByRole('button', { name: 'Copy update prompt' }))
    expect(await screen.findByText(/Couldn’t copy/)).toBeInTheDocument()
    expect((screen.getByLabelText('Update prompt') as HTMLTextAreaElement).value).toContain(
      ATTACK_ID,
    )
  })

  it('refuses text that is not JSON and the legacy version', async () => {
    const { user } = setup()
    await paste(user, 'Brand levelled up')
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t valid JSON')
    await user.clear(screen.getByLabelText('Update document (JSON)'))
    await paste(user, update({}, { version: 1 }))
    expect(await screen.findByRole('alert')).toHaveTextContent('update prompt')
    expect(applyButton()).toBeDisabled()
  })

  it('blocks the whole document when the assistant reported problems', async () => {
    const { user } = setup()
    await paste(user, update(goodChanges, { issues: ['Is it the axe or the sword?'] }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Is it the axe or the sword?')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(applyButton()).toBeDisabled()
  })

  it('blocks the whole document when it names an attack that is not on the sheet', async () => {
    const { user } = setup()
    const unknown = '11111111-1111-4111-8111-111111111111'
    await paste(user, update({ attacks: [{ op: 'remove', id: unknown }] }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('lists each change with its current and new value, unselected', async () => {
    const { user } = setup()
    await paste(user, update(goodChanges))
    const review = await screen.findByRole('region', { name: 'Review' })
    expect(within(review).getAllByRole('checkbox')).toHaveLength(5)
    for (const box of within(review).getAllByRole('checkbox')) expect(box).not.toBeChecked()
    expect(within(review).getByRole('status')).toHaveTextContent('0 of 5 changes selected.')

    const level = within(review).getByRole('checkbox', { name: 'Level' })
    expect(level.closest('li')).toHaveTextContent('3')
    expect(level.closest('li')).toHaveTextContent('4')
    const bonus = within(review).getByRole('checkbox', { name: 'Attack “Greataxe”: Bonus' })
    expect(bonus.closest('li')).toHaveTextContent('+6')
    expect(bonus.closest('li')).toHaveTextContent('+7')
    expect(within(review).getByRole('checkbox', { name: 'Gold' }).closest('li')).toHaveTextContent(
      '20',
    )
    expect(applyButton()).toBeDisabled()
  })

  it('selects all valid changes, then clears the selection', async () => {
    const { user } = setup()
    await paste(user, update(goodChanges))
    await screen.findByRole('region', { name: 'Review' })
    await user.click(screen.getByRole('button', { name: 'Select all valid' }))
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeChecked()
    expect(applyButton()).toHaveTextContent('Apply 5 changes')
    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked()
    expect(applyButton()).toBeDisabled()
  })

  it('disables a change with an invalid value but leaves the others selectable', async () => {
    const { user } = setup()
    await paste(user, update({ details: { set: { level: 25 } }, vitals: { set: { max_hp: 40 } } }))
    await screen.findByRole('region', { name: 'Review' })
    const level = screen.getByRole('checkbox', { name: 'Level' })
    expect(level).toBeDisabled()
    expect(level.closest('li')).toHaveTextContent(/between 1 and 20/)
    expect(
      within(screen.getByRole('region', { name: 'Review' })).getByRole('status'),
    ).toHaveTextContent('1 can’t be applied.')
    await user.click(screen.getByRole('button', { name: 'Select all valid' }))
    expect(level).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Maximum HP' })).toBeChecked()
  })

  it('says so when nothing differs from the current sheet', async () => {
    const { user } = setup()
    await paste(user, update({ details: { set: { level: 3 } } }))
    const review = await screen.findByRole('region', { name: 'Review' })
    expect(within(review).getByRole('status')).toHaveTextContent('Nothing in this document differs')
    expect(applyButton()).toBeDisabled()
  })

  it('applies only the selected changes with the versions the review was built from', async () => {
    vi.mocked(applyCharacterUpdate).mockResolvedValue('2026-11-16T10:00:00+00:00')
    const onApplied = vi.fn()
    const { current, user } = setup({ onApplied })
    await paste(user, update(goodChanges))
    await screen.findByRole('region', { name: 'Review' })
    await user.click(screen.getByRole('checkbox', { name: 'Level' }))
    await user.click(screen.getByRole('checkbox', { name: 'Gold' }))
    await user.type(screen.getByLabelText(/Source/), 'handoff.json')
    await user.click(applyButton())

    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(2))
    expect(applyCharacterUpdate).toHaveBeenCalledTimes(1)
    const [id, expected, changes, label] = vi.mocked(applyCharacterUpdate).mock.calls[0]
    expect(id).toBe(current.character.id)
    expect(expected).toEqual({
      character_updated_at: current.character.updated_at,
      sheet_updated_at: current.sheet.updated_at,
      items: { [ITEM_ID]: current.items[0].updated_at },
    })
    expect(changes).toEqual({ details: { level: 4 }, coins: { gp: 20 }, change_count: 2 })
    expect(label).toBe('handoff.json')
  })

  it('prefills the source with an uploaded file name and reads its text', async () => {
    const { user } = setup()
    const file = new File([update(goodChanges)], 'session-12.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Or upload a file'), file)
    expect(await screen.findByRole('region', { name: 'Review' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Source/)).toHaveValue('session-12.json')
  })

  it('refuses a file of 1 MB or more without reading it', async () => {
    const { user } = setup()
    const file = new File([new Uint8Array(1024 * 1024)], 'big.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Or upload a file'), file)
    expect(await screen.findByText(/too large/)).toBeInTheDocument()
    expect(screen.getByLabelText('Update document (JSON)')).toHaveValue('')
  })

  it('refuses a source label over 120 characters', async () => {
    const { user } = setup()
    await paste(user, update(goodChanges))
    await screen.findByRole('region', { name: 'Review' })
    await user.click(screen.getByRole('checkbox', { name: 'Level' }))
    await user.click(screen.getByLabelText(/Source/))
    await user.paste('x'.repeat(121))
    expect(screen.getByText('Use a source label of up to 120 characters.')).toBeInTheDocument()
    expect(applyButton()).toBeDisabled()
  })

  it('refuses a selection that is invalid together, without calling the database', async () => {
    const { user } = setup()
    // Current HP 50 is above the stored maximum of 30 until the maximum is also raised.
    await paste(user, update({ vitals: { set: { current_hp: 50 } } }))
    await screen.findByRole('region', { name: 'Review' })
    await user.click(screen.getByRole('checkbox', { name: 'Current HP' }))
    await user.click(applyButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('can’t be applied together')
    expect(applyCharacterUpdate).not.toHaveBeenCalled()
  })

  it('shows the applying state and locks the form while saving', async () => {
    let finish: (stamp: string) => void = () => {}
    vi.mocked(applyCharacterUpdate).mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve
      }),
    )
    const { user } = setup()
    await paste(user, update(goodChanges))
    await screen.findByRole('region', { name: 'Review' })
    await user.click(screen.getByRole('checkbox', { name: 'Level' }))
    await user.click(applyButton())
    expect(await screen.findByRole('button', { name: 'Applying…' })).toBeDisabled()
    expect(screen.getByLabelText('Update document (JSON)')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    finish('2026-11-16T10:00:00+00:00')
  })

  it('reloads the latest character after a conflict and starts the review again', async () => {
    vi.mocked(applyCharacterUpdate).mockRejectedValue({ message: 'import_conflict' })
    const latest = currentCharacter()
    latest.character = character({ level: 5, updated_at: '2026-11-16T09:00:00+00:00' })
    latest.sheet = { ...latest.sheet, updated_at: '2026-11-16T09:00:00+00:00', gp: 99 }
    vi.mocked(listCampaignCharacters).mockResolvedValue([latest.character])
    vi.mocked(getCharacterSheet).mockResolvedValue(latest.sheet)
    vi.mocked(listCharacterItems).mockResolvedValue(latest.items)

    const onApplied = vi.fn()
    const { user } = setup({ onApplied })
    await paste(user, update(goodChanges))
    await screen.findByRole('region', { name: 'Review' })
    await user.click(screen.getByRole('checkbox', { name: 'Level' }))
    await user.click(applyButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('changed while you were reviewing')
    expect(onApplied).not.toHaveBeenCalled()
    // The change list is rebuilt against the latest values, with nothing selected.
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Gold' }).closest('li')).toHaveTextContent('99'),
    )
    expect(screen.getByRole('checkbox', { name: 'Level' }).closest('li')).toHaveTextContent('5')
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked()
    expect(applyButton()).toBeDisabled()

    // A second attempt uses the new versions.
    vi.mocked(applyCharacterUpdate).mockResolvedValue('2026-11-16T10:00:00+00:00')
    await user.click(screen.getByRole('checkbox', { name: 'Level' }))
    await user.click(applyButton())
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(1))
    const expected = vi.mocked(applyCharacterUpdate).mock.calls[1][1]
    expect(expected.character_updated_at).toBe('2026-11-16T09:00:00+00:00')
    expect(expected.sheet_updated_at).toBe('2026-11-16T09:00:00+00:00')
  })

  it('shows safe copy for other failures and keeps the review', async () => {
    vi.mocked(applyCharacterUpdate).mockRejectedValue({ message: 'import_values_invalid' })
    const { user } = setup()
    await paste(user, update(goodChanges))
    await screen.findByRole('region', { name: 'Review' })
    await user.click(screen.getByRole('checkbox', { name: 'Level' }))
    await user.click(applyButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Some values in this import')
    expect(screen.getByRole('checkbox', { name: 'Level' })).toBeChecked()
    expect(screen.getByLabelText('Update document (JSON)')).not.toHaveValue('')
  })

  it('uses the generic copy for an unknown failure', async () => {
    vi.mocked(applyCharacterUpdate).mockRejectedValue(new Error('network'))
    const { user } = setup()
    await paste(user, update(goodChanges))
    await screen.findByRole('region', { name: 'Review' })
    await user.click(screen.getByRole('checkbox', { name: 'Level' }))
    await user.click(applyButton())
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't apply this update")
  })

  it('closes at once with nothing pasted, and asks before discarding a pasted update', async () => {
    const first = setup()
    await first.user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(first.onClose).toHaveBeenCalledTimes(1)
    cleanup()

    const { onClose, user } = setup()
    await paste(user, update(goodChanges))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    const question = await screen.findByRole('alertdialog', { name: 'Discard this update?' })
    expect(onClose).not.toHaveBeenCalled()
    await user.click(within(question).getByRole('button', { name: /Keep|Go back|Cancel/ }))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Discard this update?' })).getByRole(
        'button',
        { name: 'Discard update' },
      ),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('lists parts of the document that are not part of the format', async () => {
    const { user } = setup()
    await paste(user, update(goodChanges, { note: 'hello' }))
    const review = await screen.findByRole('region', { name: 'Review' })
    await user.click(within(review).getByText('Not imported (1)'))
    expect(within(review).getByText('note')).toBeInTheDocument()
  })
})
