import { expect, type Page, test } from '@playwright/test'
import {
  accountId,
  mockAdventure,
  mockAdventures,
  mockCampaignApi,
  mockCharacter,
  mockCharacters,
  mockRoster,
  mockSheet,
  openCamp,
  ownerId,
  partyRoster,
  redHand,
  type AdventureState,
  type MockCharacter,
} from './support/campMocks.ts'

// M03.5 adventures (Phase 4): the board at the map table, against mocked API routes. The
// database rules are covered by local-supabase-adventures.spec.ts.

const gameMaster = partyRoster(3)[0].profile_id
const brand = mockCharacter({ name: 'Brand' })

async function openAdventures(
  page: Page,
  state: AdventureState = { adventures: [] },
  options: {
    member?: boolean
    width?: number
    height?: number
    /** Other players' characters the signed-in player may see. */
    others?: MockCharacter[]
  } = {},
) {
  await page.setViewportSize({ width: options.width ?? 1440, height: options.height ?? 900 })
  await mockCampaignApi(
    page,
    [options.member ? { ...redHand, owner_id: ownerId } : redHand],
    options.member ? { memberMode: true } : {},
  )
  await mockRoster(page, () => partyRoster(3))
  await mockCharacters(page, {
    characters: [brand, ...(options.others ?? [])],
    sheets: [brand, ...(options.others ?? [])].map((character) => mockSheet(character.id)),
  })
  state.characterIds ??= [brand.id]
  const mock = await mockAdventures(page, state)
  const camp = await openCamp(page)
  await adventuresEntry(page).click()
  const dialog = page.getByRole('dialog', { name: 'Adventures' })
  await expect(dialog).toBeVisible()
  return { camp, dialog, state, mock }
}

const adventuresEntry = (page: Page) =>
  page.getByRole('list', { name: 'Camp places' }).getByRole('button', { name: /^Adventures/ })

test('the map table opens an empty board for an owner', async ({ page }) => {
  const { dialog } = await openAdventures(page)
  await expect(dialog.getByText('No adventures yet. Start one.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'New adventure' })).toBeVisible()
  await expect(dialog.getByLabel('Filter by title')).toHaveCount(0)
})

test('the map table opens an empty board for a member', async ({ page }) => {
  const { dialog } = await openAdventures(page, { adventures: [] }, { member: true })
  await expect(dialog.getByText('No adventures yet. Start one.')).toBeVisible()
})

test('creates a personal and a main adventure, works one through, and keeps them across a reload', async ({
  page,
}) => {
  const state: AdventureState = { adventures: [] }
  const { dialog } = await openAdventures(page, state)

  // A personal adventure, for the active character by default.
  await dialog.getByRole('button', { name: 'New adventure' }).click()
  await expect(dialog.getByLabel('Title', { exact: true })).toBeFocused()
  await dialog.getByLabel('Title', { exact: true }).fill('Find the heir')
  await dialog.getByLabel(/^Next step/).fill('Ask the innkeeper')
  await dialog.getByRole('button', { name: 'Create adventure' }).click()
  const heading = dialog.getByRole('heading', { level: 3, name: 'Find the heir' })
  await expect(heading).toBeFocused()
  await expect(dialog.getByText('Adventure created.')).toBeVisible()
  await expect(dialog.getByRole('list', { name: 'About this adventure' })).toContainText('Only you')
  await expect(dialog.getByRole('list', { name: 'About this adventure' })).toContainText('Brand')
  expect(state.adventures[0]).toMatchObject({ title: 'Find the heir', participantIds: [brand.id] })

  // Details, with line breaks kept as typed.
  await dialog.getByRole('button', { name: 'Edit details' }).click()
  await dialog.getByLabel(/^Description/).fill('Somebody knows.\nAsk around.')
  await dialog.getByLabel(/^Reference/).fill('The Gilded Stag')
  await dialog.getByRole('radio', { name: 'Side' }).check()
  await dialog.getByRole('button', { name: 'Save adventure' }).click()
  await expect(dialog.getByText('Adventure saved.')).toBeVisible()
  await expect(dialog.getByText('The Gilded Stag')).toBeVisible()
  expect(
    await dialog
      .locator('.adventure-description')
      .evaluate((el) => getComputedStyle(el).whiteSpace),
  ).toBe('pre-wrap')
  expect(state.adventures[0]).toMatchObject({ type: 'side', reference: 'The Gilded Stag' })

  // Status, objectives, and updates.
  await dialog.getByLabel('Status').selectOption('in_progress')
  await expect(dialog.getByText(/Set to in progress by you/)).toBeVisible()
  await dialog.getByLabel('Add an objective').fill('Search the cellar')
  await dialog.getByRole('button', { name: 'Add objective' }).click()
  await expect(dialog.getByLabel('Add an objective')).toBeFocused()
  // The tick shows once the write is done, so click and then look.
  await dialog.getByRole('checkbox', { name: 'Search the cellar' }).click()
  await expect(dialog.getByText(/Done by you/)).toBeVisible()
  await expect(dialog.getByRole('heading', { name: /Objectives/ })).toContainText('1 of 1 done')
  await dialog.getByLabel('Write an update').fill('The cellar was empty.')
  await dialog.getByRole('button', { name: 'Post update' }).click()
  await expect(dialog.locator('.update-row')).toContainText('The cellar was empty.')

  // A main adventure.
  await dialog.getByRole('button', { name: 'Back to adventures' }).click()
  await dialog.getByRole('button', { name: 'New adventure' }).click()
  await dialog.getByLabel('Title', { exact: true }).fill('The long road')
  await dialog.getByRole('radio', { name: 'Main' }).check()
  await expect(dialog.getByLabel('For which character')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Create adventure' }).click()
  await expect(dialog.getByRole('list', { name: 'About this adventure' })).toContainText(
    'Every member',
  )
  await dialog.getByRole('button', { name: 'Back to adventures' }).click()
  await expect(dialog.getByRole('region', { name: 'Main story' }).getByRole('button')).toHaveText([
    'The long road',
  ])
  await expect(
    dialog.getByRole('region', { name: 'Your adventures' }).getByRole('button'),
  ).toHaveText(['Find the heir'])

  // The mocked database kept it all across a reload.
  await page.reload()
  await expect(page.locator('.camp')).toHaveAttribute('data-camp-ready', 'true')
  await adventuresEntry(page).click()
  await expect(page.getByRole('button', { name: 'Find the heir' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'The long road' })).toBeVisible()
})

test('completing an adventure moves it to Completed', async ({ page }) => {
  const { dialog } = await openAdventures(page, {
    adventures: [mockAdventure({ title: 'Find the heir', participantIds: [brand.id] })],
  })
  await dialog.getByRole('button', { name: 'Find the heir' }).click()
  await dialog.getByLabel('Status').selectOption('completed')
  await expect(dialog.getByText(/Completed by you/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Back to adventures' }).click()
  await expect(dialog.getByRole('region', { name: 'Completed' }).getByRole('button')).toHaveText([
    'Find the heir',
  ])
})

test('archiving asks first, hides the adventure in Archived, and restoring brings it back', async ({
  page,
}) => {
  const state: AdventureState = {
    adventures: [mockAdventure({ title: 'Find the heir', participantIds: [brand.id] })],
  }
  const { dialog } = await openAdventures(page, state)
  await dialog.getByRole('button', { name: 'Find the heir' }).click()
  await dialog.getByRole('button', { name: 'Archive adventure' }).click()
  await expect(
    dialog.getByRole('group', { name: 'Confirm archiving Find the heir' }),
  ).toContainText('It moves to your Archived list')
  await dialog.getByRole('button', { name: 'Keep adventure' }).click()
  await expect(dialog.getByRole('button', { name: 'Archive adventure' })).toBeFocused()
  expect(state.adventures[0].archived_at).toBeNull()

  await dialog.getByRole('button', { name: 'Archive adventure' }).click()
  await dialog.getByRole('button', { name: 'Yes, archive' }).click()
  await expect(dialog.getByText('Adventure archived.')).toBeVisible()
  await expect(dialog.getByText('Archived (1)')).toBeVisible()
  expect(state.adventures[0].archived_at).not.toBeNull()

  // Archived is read-only until restored.
  await dialog.getByText('Archived (1)').click()
  await dialog.getByRole('button', { name: 'Find the heir' }).click()
  await expect(
    dialog.getByText('This adventure is archived. Restore it to make changes.'),
  ).toBeVisible()
  await expect(dialog.getByLabel('Status')).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Edit details' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Restore adventure' }).click()
  await expect(dialog.getByText('Adventure restored.')).toBeVisible()
  await expect(dialog.getByLabel('Status')).toBeEnabled()
  expect(state.adventures[0].archived_at).toBeNull()
})

test('a stale save keeps the text and offers the latest version or saving anyway', async ({
  page,
}) => {
  const state: AdventureState = {
    adventures: [
      mockAdventure({
        title: 'The long road',
        type: 'main',
        created_by: gameMaster,
        description: 'v1',
      }),
    ],
  }
  const { dialog } = await openAdventures(page, state)
  await dialog.getByRole('button', { name: 'The long road' }).click()
  await dialog.getByRole('button', { name: 'Edit details' }).click()
  await dialog.getByLabel(/^Description/).fill('my version')

  // Someone else saves first.
  Object.assign(state.adventures[0], {
    description: 'their version',
    updated_by: gameMaster,
    updated_at: new Date().toISOString(),
  })
  await dialog.getByRole('button', { name: 'Save adventure' }).click()
  const banner = dialog
    .getByRole('alert')
    .filter({ hasText: 'This adventure changed while you were editing' })
  await expect(banner).toBeVisible()
  await expect(dialog.getByLabel(/^Description/)).toHaveValue('my version')
  expect(state.adventures[0].description).toBe('their version')

  await dialog.getByRole('button', { name: 'Load latest' }).click()
  await dialog.getByRole('button', { name: 'Keep my text' }).click()
  await expect(dialog.getByLabel(/^Description/)).toHaveValue('my version')
  await dialog.getByRole('button', { name: 'Save mine anyway' }).click()
  await expect(dialog.getByText('Adventure saved.')).toBeVisible()
  expect(state.adventures[0].description).toBe('my version')
})

test('a member sees the main story and not another player’s personal adventure, and ticks an objective', async ({
  page,
}) => {
  const state: AdventureState = {
    adventures: [
      mockAdventure({
        title: 'The long road',
        type: 'main',
        created_by: gameMaster,
        objectives: [
          {
            id: 'o-1',
            adventure_id: 'x',
            title: 'Reach the pass',
            done: false,
            created_by: gameMaster,
            completed_by: null,
            completed_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      }),
      mockAdventure({ title: 'Secret grudge', created_by: gameMaster, participantIds: ['other'] }),
    ],
  }
  state.adventures[0].objectives[0].adventure_id = state.adventures[0].id
  const { dialog } = await openAdventures(page, state, { member: true })
  await expect(dialog.getByRole('button', { name: 'The long road' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Secret grudge' })).toHaveCount(0)
  await expect(dialog.getByText('Secret grudge')).toHaveCount(0)

  await dialog.getByRole('button', { name: 'The long road' }).click()
  // A member edits a main adventure but does not archive it.
  await expect(dialog.getByRole('button', { name: 'Edit details' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Archive adventure' })).toHaveCount(0)
  await dialog.getByRole('checkbox', { name: 'Reach the pass' }).click()
  await expect(dialog.getByText(/Done by you/)).toBeVisible()
  expect(state.adventures[0].objectives[0].completed_by).toBe(accountId)
})

test('asks before discarding an unsaved form, by the map table’s name when leaving the camp', async ({
  page,
}) => {
  const { dialog } = await openAdventures(page)
  await dialog.getByRole('button', { name: 'New adventure' }).click()
  await dialog.getByLabel('Title', { exact: true }).fill('Half written')

  // Back to the list asks, and keeping goes on editing.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog.getByText(/You have edits that haven't been saved/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Keep editing' }).click()
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Half written')

  // Back to camp asks too, in the map table's words.
  await page.getByRole('button', { name: 'Back to camp' }).click()
  await expect(page.getByText(/Leaving the map table now will discard them/)).toBeVisible()
  await page.getByRole('button', { name: 'Discard and leave' }).click()
  await expect(page.getByRole('dialog', { name: 'Adventures' })).toHaveCount(0)
})

test('the board works by keyboard alone and fits phone, tablet, and desktop widths', async ({
  page,
}) => {
  const state: AdventureState = {
    adventures: [mockAdventure({ title: 'Find the heir', participantIds: [brand.id] })],
  }
  const { dialog } = await openAdventures(page, state, { width: 390, height: 844 })
  for (const [width, height] of [
    [390, 844],
    [820, 1180],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await expect(dialog.getByRole('button', { name: 'New adventure' })).toBeVisible()
  }

  // Create with the keyboard: open the form, type, and submit with Enter.
  await dialog.getByRole('button', { name: 'New adventure' }).focus()
  await page.keyboard.press('Enter')
  await expect(dialog.getByLabel('Title', { exact: true })).toBeFocused()
  await page.keyboard.type('By keyboard')
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('heading', { level: 3, name: 'By keyboard' })).toBeFocused()

  // Escape closes the journal and returns to the map table's entry.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Adventures' })).toHaveCount(0)
})

test('an adventure archived elsewhere reads as no longer available, and the list refreshes', async ({
  page,
}) => {
  const state: AdventureState = {
    adventures: [mockAdventure({ title: 'Find the heir', participantIds: [brand.id] })],
  }
  const { dialog } = await openAdventures(page, state)
  await dialog.getByRole('button', { name: 'Find the heir' }).click()
  await expect(dialog.getByRole('heading', { level: 3, name: 'Find the heir' })).toBeVisible()

  // Another device archives it as someone else would see it: it is gone for this reader.
  state.adventures[0].created_by = gameMaster
  state.adventures[0].archived_at = new Date().toISOString()
  await dialog.getByLabel('Status').selectOption('on_hold')
  await expect(
    dialog.getByRole('alert').filter({ hasText: 'This adventure is no longer available' }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Back to adventures' }).click()
  await expect(dialog.getByRole('button', { name: 'Find the heir' })).toHaveCount(0)
})

// --- M03.6 collaboration (Phase 3): invitations, participants, and leaving ---------------------

const mira = partyRoster(3)[2].profile_id
const tess = mockCharacter({ name: 'Tess', owner_id: mira, in_party: true })

const hostRow = (adventureId: string) => ({
  id: `${adventureId}-host`,
  character_id: tess.id,
  profile_id: mira,
  status: 'accepted' as const,
  approvals: [] as string[],
  share_consent: false,
})
const myRow = (adventureId: string) => ({
  id: `${adventureId}-me`,
  character_id: brand.id,
  profile_id: accountId,
  status: 'accepted' as const,
  approvals: [] as string[],
  share_consent: false,
})

const invitationTo = (title: string) => ({
  participant_id: 'invite-1',
  adventure_id: '00000000-0000-4000-8000-000000009001',
  title,
  type: 'side' as const,
  character_id: brand.id,
  invited_by: mira,
  invited_at: new Date(Date.now() - 3_600_000).toISOString(),
  shared_with_party: false,
})

test('an invitation waits at the top of the board and in the Places entry, and accepting opens the adventure', async ({
  page,
}) => {
  const state: AdventureState = {
    adventures: [],
    invitations: [invitationTo('The long road')],
    characterOwners: { [tess.id]: mira },
  }
  const { dialog } = await openAdventures(page, state, { others: [tess] })
  await expect(dialog.getByRole('region', { name: 'Waiting for you' })).toContainText(
    'The long road',
  )
  await expect(dialog.getByRole('region', { name: 'Waiting for you' })).toContainText('For Brand')
  // The invitee is told the title and who invited them, and nothing else.
  await expect(dialog.getByRole('region', { name: 'Waiting for you' })).not.toContainText(
    'Description',
  )

  await dialog.getByRole('button', { name: 'Accept the invitation to The long road' }).click()
  await expect(dialog.getByText('You joined the adventure.')).toBeVisible()
  await expect(dialog.getByRole('heading', { level: 3, name: 'The long road' })).toBeVisible()
  await expect(
    dialog.getByRole('region', { name: 'Participants' }).getByRole('listitem'),
  ).toHaveCount(2)
  expect(state.invitations).toEqual([])
})

test('declining asks first, and the card and the count go', async ({ page }) => {
  const state: AdventureState = { adventures: [], invitations: [invitationTo('The long road')] }
  const { dialog } = await openAdventures(page, state, { others: [tess] })
  const decline = dialog.getByRole('button', { name: 'Decline the invitation to The long road' })
  await decline.click()
  await expect(dialog.getByRole('button', { name: 'Yes, decline' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Keep invitation' }).click()
  await expect(decline).toBeFocused()

  await decline.click()
  await dialog.getByRole('button', { name: 'Yes, decline' }).click()
  await expect(dialog.getByText('Invitation declined.')).toBeVisible()
  await expect(dialog.getByRole('region', { name: 'Waiting for you' })).toHaveCount(0)
  expect(state.invitations).toEqual([])
})

test('the Places entry says how many requests wait', async ({ page }) => {
  const state: AdventureState = { adventures: [], invitations: [invitationTo('The long road')] }
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockCampaignApi(page, [redHand])
  await mockRoster(page, () => partyRoster(3))
  await mockCharacters(page, { characters: [brand], sheets: [mockSheet(brand.id)] })
  await mockAdventures(page, state)
  await openCamp(page)
  await expect(
    page
      .getByRole('list', { name: 'Camp places' })
      .getByRole('button', { name: 'Adventures, 1 waiting' }),
  ).toContainText('Adventures (1)')
})

test('proposing a character asks the others first', async ({ page }) => {
  const adventure = mockAdventure({
    title: 'The heist',
    type: 'side',
    created_by: accountId,
    participantRows: [],
  })
  adventure.participantRows = [myRow(adventure.id), hostRow(adventure.id)]
  const cass = mockCharacter({ name: 'Cass', owner_id: partyRoster(3)[1].profile_id })
  const state: AdventureState = {
    adventures: [adventure],
    characterOwners: { [cass.id]: cass.owner_id },
  }
  const { dialog } = await openAdventures(page, state, { others: [tess, cass] })
  await dialog.getByRole('button', { name: 'The heist' }).click()
  const people = dialog.getByRole('region', { name: 'Participants' })
  await expect(people).toContainText('Brand')
  await expect(people).toContainText('Tess')

  await people.getByLabel('Invite a character').selectOption(cass.id)
  await people.getByRole('button', { name: 'Invite' }).click()
  await expect(dialog.getByRole('button', { name: 'Ask for approval' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Ask for approval' }).click()
  await expect(dialog.getByText('Invitation proposed.')).toBeVisible()
  await expect(people.getByRole('listitem').filter({ hasText: 'Cass' })).toContainText(
    'Waiting for 1 approval',
  )

  // Tess had not approved: the proposal waits for her, not for the viewer.
  expect(adventure.participantRows!.find((p) => p.character_id === cass.id)?.status).toBe(
    'proposed',
  )
})

test('a proposal waiting for the viewer is approved or rejected from the adventure', async ({
  page,
}) => {
  const adventure = mockAdventure({ title: 'The heist', type: 'side', participantRows: [] })
  const cass = mockCharacter({ name: 'Cass', owner_id: partyRoster(3)[1].profile_id })
  adventure.participantRows = [
    myRow(adventure.id),
    hostRow(adventure.id),
    {
      id: 'proposal-cass',
      character_id: cass.id,
      profile_id: cass.owner_id,
      status: 'proposed',
      approvals: [mira],
      share_consent: false,
    },
  ]
  const state: AdventureState = { adventures: [adventure] }
  const { dialog } = await openAdventures(page, state, { others: [tess, cass] })
  // It is waiting for the viewer, so the board says so.
  await expect(dialog.getByRole('region', { name: 'Waiting for you' })).toContainText(
    'Approve Cass joining',
  )
  await dialog.getByRole('button', { name: 'The heist' }).click()
  await dialog.getByRole('button', { name: 'Approve Cass joining' }).click()
  await expect(
    dialog
      .getByRole('region', { name: 'Participants' })
      .getByRole('listitem')
      .filter({ hasText: 'Cass' }),
  ).toContainText('Waiting for')
  expect(adventure.participantRows!.find((p) => p.id === 'proposal-cass')?.status).toBe('invited')

  // Withdrawing asks first.
  await dialog.getByRole('button', { name: 'Withdraw the invitation to Cass' }).click()
  await expect(dialog.getByRole('button', { name: 'Yes, withdraw' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Yes, withdraw' }).click()
  await expect(dialog.getByRole('region', { name: 'Participants' })).not.toContainText('Cass')
})

test('leaving asks first, then returns to a board without the adventure', async ({ page }) => {
  const adventure = mockAdventure({ title: 'The heist', type: 'side', participantRows: [] })
  adventure.participantRows = [myRow(adventure.id), hostRow(adventure.id)]
  const state: AdventureState = { adventures: [adventure] }
  const { dialog } = await openAdventures(page, state, { others: [tess] })
  await dialog.getByRole('button', { name: 'The heist' }).click()
  await dialog.getByRole('button', { name: 'Leave adventure' }).click()
  await expect(dialog.getByRole('button', { name: 'Yes, leave' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Yes, leave' }).click()
  await expect(dialog.getByText('You left the adventure.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'The heist' })).toHaveCount(0)
  expect(adventure.participantRows!.find((p) => p.profile_id === accountId)?.status).toBe('left')
})

// --- M03.6 collaboration (Phase 4): sharing with the party and its read-only view -------------

test('sharing needs everyone: one agreement is a request, the second shares it, Stop sharing ends it', async ({
  page,
}) => {
  const adventure = mockAdventure({ title: 'The heist', type: 'side', participantRows: [] })
  adventure.participantRows = [myRow(adventure.id), hostRow(adventure.id)]
  const state: AdventureState = { adventures: [adventure] }
  const { dialog } = await openAdventures(page, state, { others: [tess] })
  await dialog.getByRole('button', { name: 'The heist' }).click()

  const sharing = dialog.getByRole('region', { name: 'Sharing' })
  await expect(sharing).toContainText('Only the people in this adventure can see it.')
  await sharing.getByRole('button', { name: 'Share with party' }).click()
  await expect(dialog.getByRole('button', { name: 'Yes, share' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Yes, share' }).click()
  await expect(dialog.getByText('Your agreement was saved.')).toBeVisible()
  await expect(sharing).toContainText('Waiting for Mira')
  expect(adventure.visibility).toBe('participants')

  await sharing.getByRole('button', { name: 'Cancel the request' }).click()
  await expect(sharing).toContainText('Only the people in this adventure can see it.')
  expect(adventure.participantRows!.some((p) => p.share_consent)).toBe(false)
})

test('a share request waits in "Waiting for you", and Agree completes the share', async ({
  page,
}) => {
  const adventure = mockAdventure({ title: 'The heist', type: 'side', participantRows: [] })
  adventure.participantRows = [
    myRow(adventure.id),
    { ...hostRow(adventure.id), share_consent: true },
  ]
  const state: AdventureState = { adventures: [adventure] }
  const { dialog } = await openAdventures(page, state, { others: [tess] })
  await expect(dialog.getByRole('region', { name: 'Waiting for you' })).toContainText(
    'Mira wants to share this with the party',
  )
  await dialog.getByRole('button', { name: 'The heist' }).click()
  const sharing = dialog.getByRole('region', { name: 'Sharing' })
  await sharing.getByRole('button', { name: 'Agree' }).click()
  await dialog.getByRole('button', { name: 'Yes, share' }).click()
  await expect(sharing).toContainText('Shared with the party.')
  expect(adventure.visibility).toBe('party')

  await sharing.getByRole('button', { name: 'Stop sharing' }).click()
  await expect(dialog.getByRole('button', { name: 'Yes, stop sharing' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Yes, stop sharing' }).click()
  await expect(sharing).toContainText('Only the people in this adventure can see it.')
  expect(adventure.visibility).toBe('participants')
  expect(adventure.participantRows!.some((p) => p.share_consent)).toBe(false)
})

test('Not now clears the request without sharing', async ({ page }) => {
  const adventure = mockAdventure({ title: 'The heist', type: 'side', participantRows: [] })
  adventure.participantRows = [
    myRow(adventure.id),
    { ...hostRow(adventure.id), share_consent: true },
  ]
  const { dialog } = await openAdventures(page, { adventures: [adventure] }, { others: [tess] })
  await dialog.getByRole('button', { name: 'The heist' }).click()
  await dialog.getByRole('button', { name: 'Not now' }).click()
  await expect(dialog.getByRole('region', { name: 'Sharing' })).toContainText(
    'Only the people in this adventure can see it.',
  )
  expect(adventure.participantRows!.some((p) => p.share_consent)).toBe(false)
})

test('the party reads a shared adventure in its own group, with nothing to change', async ({
  page,
}) => {
  const adventure = mockAdventure({
    title: 'The lantern job',
    type: 'side',
    visibility: 'party',
    created_by: mira,
    participantRows: [],
    objectives: [
      {
        id: 'lantern-1',
        adventure_id: 'x',
        title: 'Light the lantern',
        done: true,
        created_by: mira,
        completed_by: mira,
        completed_at: '2026-11-16T10:00:00.000Z',
        created_at: '2026-11-16T09:00:00.000Z',
        updated_at: '2026-11-16T10:00:00.000Z',
      },
    ],
  })
  adventure.participantRows = [{ ...hostRow(adventure.id), share_consent: true }]
  const state: AdventureState = { adventures: [adventure], partyViewer: true }
  const { dialog } = await openAdventures(page, state, { others: [tess] })

  const shared = dialog.getByRole('region', { name: 'Shared with the party' })
  await expect(shared).toContainText('The lantern job')
  await expect(shared).toContainText('Read-only')
  await expect(dialog.getByRole('region', { name: 'Your adventures' })).not.toContainText(
    'The lantern job',
  )

  await shared.getByRole('button', { name: 'The lantern job' }).click()
  await expect(dialog.getByText(/Shared with the party by .*Only the people in it/)).toBeVisible()
  await expect(dialog.getByText('Light the lantern')).toBeVisible()
  await expect(dialog.getByText('(done)')).toBeVisible()
  for (const name of ['Edit details', 'Archive adventure', 'Stop sharing', 'Leave adventure']) {
    await expect(dialog.getByRole('button', { name })).toHaveCount(0)
  }
  await expect(dialog.getByRole('checkbox')).toHaveCount(0)
  await expect(dialog.getByRole('combobox')).toHaveCount(0)
})

test('a member outside the party does not see a shared adventure', async ({ page }) => {
  const adventure = mockAdventure({
    title: 'The lantern job',
    type: 'side',
    visibility: 'party',
    created_by: mira,
    participantRows: [],
  })
  adventure.participantRows = [{ ...hostRow(adventure.id), share_consent: true }]
  const { dialog } = await openAdventures(
    page,
    { adventures: [adventure], partyViewer: false },
    { others: [tess] },
  )
  await expect(dialog.getByRole('button', { name: 'The lantern job' })).toHaveCount(0)
  await expect(dialog.getByRole('region', { name: 'Shared with the party' })).toHaveCount(0)
})
