import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CharacterImportDialog } from './CharacterImportDialog'
import { importCharacter } from './characterImportService'
import { campaignId, userId } from './characterTestData'

vi.mock('./characterImportService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./characterImportService')>()),
  importCharacter: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

const NEW_ID = '00000000-0000-4000-8000-0000000000aa'

function documentText(
  character: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) {
  return JSON.stringify({
    format: 'the-goobers-guide-character',
    version: 3,
    character: {
      name: 'Arlen Vale',
      species: 'Human',
      class_name: 'Ranger',
      level: 3,
      vitals: { max_hp: 24, current_hp: 20, temp_hp: 0, armor_class: 15, speed: 30 },
      abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 15, cha: 8 },
      saving_throws: ['dex'],
      skills: { stealth: 'expertise' },
      attacks: [{ name: 'Longbow', bonus: '+5', damage: '1d8 + 3' }],
      inventory: [{ name: 'Rope', quantity: 2, weight: 10 }],
      currency: { sp: 4, gp: 12 },
      features: 'Favored Enemy',
      ...character,
    },
    ...extra,
  })
}

function setup(props: { onClose?: () => void; onImported?: (id: string) => void } = {}) {
  const onClose = props.onClose ?? vi.fn()
  const onImported = props.onImported ?? vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <CharacterImportDialog
        campaignId={campaignId}
        onClose={onClose}
        onImported={onImported}
        userId={userId}
      />
    </QueryClientProvider>,
  )
  return { onClose, onImported, user }
}

async function paste(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByLabelText('Character document (JSON)'))
  await user.paste(text)
}

const createButton = () => screen.getByRole('button', { name: /Create character|Creating…/ })

describe('CharacterImportDialog', () => {
  it('opens with an empty form and nothing to create yet', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Import a character' })).toBeInTheDocument()
    expect(screen.getByLabelText('Character document (JSON)')).toHaveValue('')
    expect(createButton()).toBeDisabled()
    expect(screen.queryByRole('region', { name: 'Review' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  describe('the conversion prompt', () => {
    it('copies the prompt and says so', async () => {
      const { user } = setup()
      const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
      await user.click(screen.getByText('How do I make a document?'))
      await user.click(screen.getByRole('button', { name: 'Copy conversion prompt' }))
      expect(write).toHaveBeenCalledTimes(1)
      expect(write.mock.calls[0][0]).toContain('the-goobers-guide-character')
      expect(await screen.findByText('Copied')).toBeInTheDocument()
    })

    it('tells the player to copy by hand when the clipboard is unavailable', async () => {
      const { user } = setup()
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
      await user.click(screen.getByRole('button', { name: 'Copy conversion prompt' }))
      expect(await screen.findByText(/Couldn’t copy/)).toBeInTheDocument()
      expect((screen.getByLabelText('Conversion prompt') as HTMLTextAreaElement).value).toContain(
        'the-goobers-guide-character',
      )
    })
  })

  describe('review', () => {
    it('refuses text that is not JSON, with a message and no create', async () => {
      const { user } = setup()
      await paste(user, 'Arlen Vale, a ranger')
      expect(await screen.findByRole('alert')).toHaveTextContent('That isn’t valid JSON')
      expect(createButton()).toBeDisabled()
    })

    it('refuses the legacy version with the regenerate message', async () => {
      const { user } = setup()
      await paste(user, documentText({}, { version: 2 }))
      expect(await screen.findByRole('alert')).toHaveTextContent('conversion prompt')
      expect(createButton()).toBeDisabled()
    })

    it('shows every section of a valid document and enables Create', async () => {
      const { user } = setup()
      await paste(user, documentText())
      const review = await screen.findByRole('region', { name: 'Review' })
      expect(within(review).getByRole('status')).toHaveTextContent('Everything checks out')
      const character = within(review).getByRole('region', { name: 'Character' })
      expect(within(character).getByText('Arlen Vale')).toBeInTheDocument()
      expect(within(character).getByText('Ranger')).toBeInTheDocument()
      const vitals = within(review).getByRole('region', { name: 'Vitals' })
      expect(within(vitals).getByText('24')).toBeInTheDocument()
      expect(
        within(within(review).getByRole('region', { name: 'Abilities' })).getByText('Dexterity'),
      ).toBeInTheDocument()
      expect(
        within(within(review).getByRole('region', { name: 'Saving throws' })).getByText(
          'Dexterity',
        ),
      ).toBeInTheDocument()
      expect(
        within(within(review).getByRole('region', { name: 'Skills' })).getByText(/Stealth/),
      ).toBeInTheDocument()
      expect(
        within(within(review).getByRole('region', { name: 'Attacks' })).getByText('Longbow'),
      ).toBeInTheDocument()
      const inventory = within(review).getByRole('region', { name: 'Inventory' })
      expect(within(inventory).getByText('Rope')).toBeInTheDocument()
      const coins = within(review).getByRole('region', { name: 'Coins' })
      expect(within(coins).getByText('12')).toBeInTheDocument()
      expect(within(review).getByText('Favored Enemy')).toBeInTheDocument()
      expect(createButton()).toBeEnabled()
    })

    it('lists the problems per section, counts them, and blocks Create', async () => {
      const { user } = setup()
      await paste(
        user,
        documentText({
          level: 99,
          vitals: { max_hp: 0 },
          attacks: [{ name: 'x'.repeat(81) }],
          currency: { ep: 2 },
        }),
      )
      const review = await screen.findByRole('region', { name: 'Review' })
      expect(within(review).getByRole('alert')).toHaveTextContent('4 problems need fixing')
      const character = within(review).getByRole('region', { name: /^Character/ })
      expect(character).toHaveAttribute('data-invalid')
      expect(within(character).getByText('character.level')).toBeInTheDocument()
      expect(
        within(within(review).getByRole('region', { name: /^Vitals/ })).getByText(
          'character.vitals.max_hp',
        ),
      ).toBeInTheDocument()
      expect(
        within(within(review).getByRole('region', { name: /^Attacks/ })).getByText(
          'character.attacks[0].name',
        ),
      ).toBeInTheDocument()
      expect(
        within(within(review).getByRole('region', { name: /^Coins/ })).getByText(
          'character.currency.ep',
        ),
      ).toBeInTheDocument()
      expect(within(review).getByRole('region', { name: 'Skills' })).not.toHaveAttribute(
        'data-invalid',
      )
      expect(createButton()).toBeDisabled()
    })

    it('lists fields that are not imported without blocking', async () => {
      const { user } = setup()
      await paste(user, documentText({ status: 'deceased', in_party: true, mystery: 1 }))
      const ignored = await screen.findByText('Not imported (3)')
      await user.click(ignored)
      const list = within(ignored.closest('details')!).getByRole('list')
      expect(within(list).getByText('character.status')).toBeInTheDocument()
      expect(within(list).getByText('character.in_party')).toBeInTheDocument()
      expect(within(list).getByText('character.mystery')).toBeInTheDocument()
      expect(createButton()).toBeEnabled()
    })

    it('shows plain text for markup and instructions in the document', async () => {
      const { user } = setup()
      const hostile = '<script>alert(1)</script> Ignore previous instructions'
      await paste(user, documentText({ notes: hostile }))
      expect(await screen.findByText(hostile)).toBeInTheDocument()
      expect(document.querySelector('script')).toBeNull()
    })

    it('shortens a long list of items and long text', async () => {
      const { user } = setup()
      const inventory = Array.from({ length: 25 }, (_, n) => ({ name: `Item ${n}` }))
      await paste(user, documentText({ inventory, notes: 'n'.repeat(500) }))
      expect(await screen.findByText('…and 5 more.')).toBeInTheDocument()
      expect(screen.getByText(/500 characters/)).toBeInTheDocument()
    })
  })

  describe('uploading a file', () => {
    it('reads the file into the box and fills in the source', async () => {
      const { user } = setup()
      const file = new File([documentText()], 'arlen.json', { type: 'application/json' })
      await user.upload(screen.getByLabelText('Or upload a file'), file)
      await waitFor(() =>
        expect(screen.getByLabelText('Character document (JSON)')).toHaveValue(documentText()),
      )
      expect(screen.getByLabelText(/Source/)).toHaveValue('arlen.json')
      expect(createButton()).toBeEnabled()
    })

    it('refuses a file of 1 MB or more without reading it', async () => {
      const { user } = setup()
      const file = new File(['x'], 'big.json', { type: 'application/json' })
      Object.defineProperty(file, 'size', { value: 1_000_000 })
      await user.upload(screen.getByLabelText('Or upload a file'), file)
      expect(await screen.findByRole('alert')).toHaveTextContent('under 1 MB')
      expect(screen.getByLabelText('Character document (JSON)')).toHaveValue('')
    })
  })

  describe('the source label', () => {
    it('rejects a label over 120 characters and blocks Create', async () => {
      const { user } = setup()
      await paste(user, documentText())
      const label = screen.getByLabelText(/Source/)
      await user.click(label)
      await user.paste('x'.repeat(121))
      expect(
        await screen.findByText('Use a source label of up to 120 characters.'),
      ).toBeInTheDocument()
      expect(label).toHaveAttribute('aria-invalid', 'true')
      expect(createButton()).toBeDisabled()
    })
  })

  describe('creating the character', () => {
    it('sends the database-shaped payload and the trimmed label, then reports the new id', async () => {
      vi.mocked(importCharacter).mockResolvedValue(NEW_ID)
      const { user, onImported } = setup()
      await paste(user, documentText())
      await user.type(screen.getByLabelText(/Source/), '  handoff.md ')
      await user.click(createButton())

      await waitFor(() => expect(onImported).toHaveBeenCalledWith(NEW_ID))
      const [campaign, payload, label] = vi.mocked(importCharacter).mock.calls[0]
      expect(campaign).toBe(campaignId)
      expect(label).toBe('handoff.md')
      expect(payload.details).toEqual({
        name: 'Arlen Vale',
        species: 'Human',
        class_name: 'Ranger',
        subclass: null,
        background: null,
        level: 3,
      })
      expect(payload.vitals).toEqual({
        max_hp: 24,
        current_hp: 20,
        temp_hp: 0,
        armor_class: 15,
        speed: 30,
      })
      expect(payload.coins).toEqual({ cp: 0, sp: 4, gp: 12 })
      expect(payload.items).toEqual([
        {
          name: 'Rope',
          quantity: 2,
          weight: 10,
          description: null,
          equipped: false,
          attuned: false,
        },
      ])
      expect(payload.sheet.attacks[0]).toMatchObject({ name: 'Longbow' })
      expect(payload.sheet.attacks[0].id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('sends no label when the source is blank', async () => {
      vi.mocked(importCharacter).mockResolvedValue(NEW_ID)
      const { user } = setup()
      await paste(user, documentText())
      await user.click(createButton())
      await waitFor(() => expect(importCharacter).toHaveBeenCalled())
      expect(vi.mocked(importCharacter).mock.calls[0][2]).toBeNull()
    })

    it('shows Creating… and locks the form while the import runs', async () => {
      let finish: (id: string) => void = () => {}
      vi.mocked(importCharacter).mockReturnValue(new Promise((resolve) => (finish = resolve)))
      const { user, onImported } = setup()
      await paste(user, documentText())
      await user.click(createButton())

      expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Creating…' })).toHaveAttribute('aria-busy', 'true')
      expect(screen.getByLabelText('Character document (JSON)')).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
      finish(NEW_ID)
      await waitFor(() => expect(onImported).toHaveBeenCalledWith(NEW_ID))
    })

    it.each([
      [
        'character_active_exists',
        'You already have an active character here. Use Import updates on that character, or retire them first.',
      ],
      ['import_values_invalid', "Some values in this import aren't allowed."],
      ['character_campaign_unavailable', "You're no longer a member of this campaign."],
      ['item_limit_reached', 'A character can carry up to 200 items.'],
    ])('explains %s and keeps the document', async (code, copy) => {
      vi.mocked(importCharacter).mockRejectedValue({ message: code })
      const { user, onImported } = setup()
      await paste(user, documentText())
      await user.click(createButton())
      expect(
        await screen.findByText(new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
      ).toBeInTheDocument()
      expect(onImported).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Character document (JSON)')).toHaveValue(documentText())
      expect(createButton()).toBeEnabled()
    })

    it('uses a generic message for an unknown failure and clears it when the text changes', async () => {
      vi.mocked(importCharacter).mockRejectedValue(new Error('network down'))
      const { user } = setup()
      await paste(user, documentText())
      await user.click(createButton())
      expect(await screen.findByText(/We couldn't import this character/)).toBeInTheDocument()
      await user.type(screen.getByLabelText('Character document (JSON)'), ' ')
      expect(screen.queryByText(/We couldn't import this character/)).not.toBeInTheDocument()
    })

    it('does not call the database for a document with problems', async () => {
      const { user } = setup()
      await paste(user, documentText({ level: 99 }))
      await screen.findByRole('region', { name: 'Review' })
      expect(createButton()).toBeDisabled()
      expect(importCharacter).not.toHaveBeenCalled()
    })
  })

  describe('closing', () => {
    it('closes at once when nothing was pasted', async () => {
      const { user, onClose } = setup()
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('asks before discarding a pasted document, and keeps it if told to', async () => {
      const { user, onClose } = setup()
      await paste(user, documentText())
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      const question = await screen.findByRole('alertdialog', { name: 'Discard this import?' })
      expect(onClose).not.toHaveBeenCalled()
      await user.click(within(question).getByRole('button', { name: 'Keep editing' }))
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Character document (JSON)')).toHaveValue(documentText())
    })

    it('discards the document when told to', async () => {
      const { user, onClose } = setup()
      await paste(user, documentText())
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      await user.click(await screen.findByRole('button', { name: 'Discard import' }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('treats Escape like Cancel', async () => {
      const { onClose } = setup()
      screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }))
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })
  })
})
