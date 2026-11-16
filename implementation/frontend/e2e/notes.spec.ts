import { expect, type Page, test } from '@playwright/test'
import {
  accountId,
  mockCampaignApi,
  mockCharacter,
  mockCharacters,
  mockNote,
  mockNotes,
  mockRoster,
  mockSheet,
  openCamp,
  ownerId,
  partyRoster,
  redHand,
  type CharacterFailure,
  type NoteState,
} from './support/campMocks.ts'

// M03.4 notes (Phase 4): the notebook at the journal crates, against mocked API routes. The
// database rules are covered by local-supabase-notes.spec.ts.

const gameMaster = partyRoster(3)[0].profile_id
const brand = mockCharacter({ name: 'Brand' })

async function openNotes(
  page: Page,
  state: NoteState = { notes: [] },
  options: {
    member?: boolean
    fail?: (method: string) => CharacterFailure
    hold?: () => Promise<void> | undefined
  } = {},
) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockCampaignApi(
    page,
    [options.member ? { ...redHand, owner_id: ownerId } : redHand],
    options.member ? { memberMode: true } : {},
  )
  await mockRoster(page, () => partyRoster(3))
  await mockCharacters(page, { characters: [brand], sheets: [mockSheet(brand.id)] })
  state.characterIds ??= [brand.id]
  const mock = await mockNotes(page, state, { fail: options.fail, hold: options.hold })
  const camp = await openCamp(page)
  await notesEntry(page).click()
  const dialog = page.getByRole('dialog', { name: 'Campaign notes' })
  await expect(dialog).toBeVisible()
  return { camp, dialog, state, mock }
}

/** Whether closing the tab would ask: a cancelable `beforeunload` that something cancels. */
const tabAsks = (page: Page) => () =>
  page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })

const notesEntry = (page: Page) =>
  page.getByRole('list', { name: 'Camp places' }).getByRole('button', { name: /^Notes/ })

test('the crates open an empty notebook for an owner', async ({ page }) => {
  const { dialog } = await openNotes(page)
  await expect(dialog.getByText('No notes yet. Write the first one.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'New note' })).toBeVisible()
  await expect(dialog.getByLabel('Filter by title')).toHaveCount(0)
})

test('the crates open an empty notebook for a member', async ({ page }) => {
  const { dialog } = await openNotes(page, { notes: [] }, { member: true })
  await expect(dialog.getByText('No notes yet. Write the first one.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'New note' })).toBeVisible()
})

test('writes, links, shares, hides, and deletes notes, and keeps them across a reload', async ({
  page,
}) => {
  const state: NoteState = { notes: [] }
  const { dialog } = await openNotes(page, state)

  // A private note, then an edit that links a character.
  await dialog.getByRole('button', { name: 'New note' }).click()
  await expect(dialog.getByLabel('Title', { exact: true })).toBeFocused()
  await dialog.getByLabel('Title', { exact: true }).fill('Clues')
  await dialog.getByLabel(/^Note/).fill('The innkeeper lied.\nHe was nervous.')
  await dialog.getByRole('button', { name: 'Create note' }).click()
  const heading = dialog.getByRole('heading', { name: 'Clues' })
  await expect(heading).toBeFocused()
  await expect(dialog.getByText('Note created.')).toBeVisible()
  await expect(dialog.getByText('Only you')).toBeVisible()
  await expect(dialog.locator('.note-body')).toHaveText('The innkeeper lied.\nHe was nervous.')
  // Line breaks are shown as typed.
  expect(await dialog.locator('.note-body').evaluate((el) => getComputedStyle(el).whiteSpace)).toBe(
    'pre-wrap',
  )

  await dialog.getByRole('button', { name: 'Edit note' }).click()
  await dialog.getByLabel(/About a character/).selectOption({ label: 'Brand' })
  await dialog.getByRole('button', { name: 'Save note' }).click()
  await expect(dialog.getByText('Note saved.')).toBeVisible()
  await expect(dialog.getByText('About Brand')).toBeVisible()
  expect(state.notes[0]).toMatchObject({ title: 'Clues', character_id: brand.id })

  // A shared note appears in its own group.
  await dialog.getByRole('button', { name: 'Back to notes' }).click()
  await expect(dialog.getByRole('button', { name: 'Clues' })).toBeFocused()
  await dialog.getByRole('button', { name: 'New note' }).click()
  await dialog.getByLabel('Title', { exact: true }).fill('Party plan')
  await dialog.getByRole('radio', { name: 'Shared with the campaign' }).check()
  await dialog.getByRole('button', { name: 'Create note' }).click()
  await expect(dialog.getByText('Shared with the campaign').first()).toBeVisible()
  await dialog.getByRole('button', { name: 'Back to notes' }).click()
  await expect(
    dialog.getByRole('region', { name: 'Shared with the campaign' }).getByRole('button'),
  ).toHaveText(['Party plan'])
  await expect(dialog.getByRole('region', { name: 'Only you' }).getByRole('button')).toHaveText([
    'Clues',
  ])

  // Making it private asks first, and says what members lose.
  await dialog.getByRole('button', { name: 'Party plan' }).click()
  await dialog.getByRole('button', { name: 'Make private' }).click()
  await expect(
    dialog.getByRole('group', { name: /Confirm making Party plan private/ }),
  ).toContainText('Members will no longer see Party plan, including their edits.')
  await dialog.getByRole('button', { name: 'Keep shared' }).click()
  await expect(dialog.getByRole('button', { name: 'Make private' })).toBeFocused()
  expect(state.notes.find((row) => row.title === 'Party plan')?.visibility).toBe('campaign')
  await dialog.getByRole('button', { name: 'Make private' }).click()
  await dialog.getByRole('button', { name: 'Yes, make private' }).click()
  await expect(dialog.getByText('Note is now private.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Share with the campaign' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Share with the campaign' }).click()
  await expect(dialog.getByText('Note shared with the campaign.')).toBeVisible()

  // Deleting asks first.
  await dialog.getByRole('button', { name: 'Back to notes' }).click()
  await dialog.getByRole('button', { name: 'Clues' }).click()
  await dialog.getByRole('button', { name: 'Delete note' }).click()
  await dialog.getByRole('button', { name: 'Keep note' }).click()
  expect(state.notes).toHaveLength(2)
  await dialog.getByRole('button', { name: 'Delete note' }).click()
  await dialog.getByRole('button', { name: 'Yes, delete note' }).click()
  await expect(dialog.getByText('Note deleted.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'New note' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Clues' })).toHaveCount(0)
  expect(state.notes.map((row) => row.title)).toEqual(['Party plan'])

  // The mocked database kept the rest across a reload.
  await page.reload()
  await expect(page.locator('.camp')).toHaveAttribute('data-camp-ready', 'true')
  await notesEntry(page).click()
  await expect(page.getByRole('dialog', { name: 'Campaign notes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Party plan' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Clues' })).toHaveCount(0)
})

test('filters the list by title', async ({ page }) => {
  const { dialog } = await openNotes(page, {
    notes: [mockNote({ title: 'Map of Landfall' }), mockNote({ title: 'Thorin’s debts' })],
  })
  await dialog.getByLabel('Filter by title').fill('thor')
  await expect(dialog.getByRole('button', { name: 'Thorin’s debts' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Map of Landfall' })).toHaveCount(0)
  await dialog.getByLabel('Filter by title').fill('zzz')
  await expect(dialog.getByText('No notes match “zzz”.')).toBeVisible()
})

test('a stale save keeps the text and offers the latest version or saving anyway', async ({
  page,
}) => {
  const shared = mockNote({ title: 'Plan', body: 'v1', visibility: 'campaign' })
  const state: NoteState = { notes: [shared] }
  const { dialog } = await openNotes(page, state)
  await dialog.getByRole('button', { name: 'Plan' }).click()
  await dialog.getByRole('button', { name: 'Edit note' }).click()
  await dialog.getByLabel(/^Note/).fill('my version')

  // Someone else saves first.
  Object.assign(state.notes[0], {
    body: 'their version',
    updated_by: gameMaster,
    updated_at: new Date().toISOString(),
  })
  await dialog.getByRole('button', { name: 'Save note' }).click()
  const banner = dialog
    .getByRole('alert')
    .filter({ hasText: 'This note changed while you were editing' })
  await expect(banner).toBeVisible()
  await expect(dialog.getByLabel(/^Note/)).toHaveValue('my version')
  expect(state.notes[0].body).toBe('their version')

  // Load latest asks first, and keeping the text changes nothing.
  await dialog.getByRole('button', { name: 'Load latest' }).click()
  await dialog.getByRole('button', { name: 'Keep my text' }).click()
  await expect(dialog.getByLabel(/^Note/)).toHaveValue('my version')
  await dialog.getByRole('button', { name: 'Load latest' }).click()
  await dialog.getByRole('button', { name: 'Yes, load latest' }).click()
  await expect(dialog.getByLabel(/^Note/)).toHaveValue('their version')
  await expect(banner).toHaveCount(0)

  // Another round, this time saving mine anyway.
  await dialog.getByLabel(/^Note/).fill('mine, again')
  Object.assign(state.notes[0], { body: 'theirs, again', updated_at: new Date().toISOString() })
  await dialog.getByRole('button', { name: 'Save note' }).click()
  await dialog.getByRole('button', { name: 'Save mine anyway' }).click()
  await expect(dialog.getByText('Note saved.')).toBeVisible()
  expect(state.notes[0]).toMatchObject({ body: 'mine, again', updated_by: accountId })
  await expect(dialog.locator('.note-body')).toHaveText('mine, again')
})

test('a note made private or deleted elsewhere keeps the writer’s text', async ({ page }) => {
  const shared = mockNote({
    title: 'Plan',
    body: 'v1',
    visibility: 'campaign',
    author_id: gameMaster,
  })
  const state: NoteState = { notes: [shared] }
  const { dialog } = await openNotes(page, state)
  await dialog.getByRole('button', { name: 'Plan' }).click()
  await dialog.getByRole('button', { name: 'Edit note' }).click()
  await dialog.getByLabel(/^Note/).fill('v1 plus my edits')

  state.notes.splice(0, 1)
  await dialog.getByRole('button', { name: 'Save note' }).click()
  await expect(
    dialog.getByRole('alert').filter({ hasText: 'This note is no longer available' }),
  ).toBeVisible()
  await expect(dialog.getByLabel(/^Note/)).toHaveValue('v1 plus my edits')
  await expect(dialog.getByRole('button', { name: 'Save note' })).toBeDisabled()

  // Back to notes asks about the text, and the list no longer has the note.
  await dialog.getByRole('button', { name: 'Back to notes' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard and go back' }).click()
  await expect(dialog.getByText('No notes yet. Write the first one.')).toBeVisible()
})

test('a failing load or save shows an alert, and the text is kept', async ({ page }) => {
  let failing: 'get' | 'patch' | null = 'get'
  const state: NoteState = { notes: [mockNote({ title: 'Clues', body: 'text' })] }
  const { dialog } = await openNotes(page, state, {
    fail: (method) =>
      (failing === 'get' && method === 'GET') || (failing === 'patch' && method === 'PATCH')
        ? { status: 500, message: 'boom' }
        : null,
  })
  await expect(dialog.getByRole('alert')).toContainText('The notes could not be loaded.')
  failing = null
  await dialog.getByRole('button', { name: 'Try again' }).click()
  await dialog.getByRole('button', { name: 'Clues' }).click()
  await dialog.getByRole('button', { name: 'Edit note' }).click()
  await dialog.getByLabel(/^Note/).fill('changed')

  failing = 'patch'
  await dialog.getByRole('button', { name: 'Save note' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    "We couldn't save this note. Check your connection and try again.",
  )
  await expect(dialog.getByLabel(/^Note/)).toHaveValue('changed')
  failing = null
  await dialog.getByRole('button', { name: 'Save note' }).click()
  await expect(dialog.getByText('Note saved.')).toBeVisible()
})

test('the 500-note cap is explained', async ({ page }) => {
  const state: NoteState = {
    notes: Array.from({ length: 500 }, (_, index) => mockNote({ title: `Note ${index}` })),
  }
  const { dialog } = await openNotes(page, state)
  await dialog.getByRole('button', { name: 'New note' }).click()
  await dialog.getByLabel('Title', { exact: true }).fill('One too many')
  await dialog.getByRole('button', { name: 'Create note' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'You can keep up to 500 notes in a campaign. Delete one to add another.',
  )
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('One too many')
})

test('a member sees a shared note, edits it, and has no visibility or delete controls', async ({
  page,
}) => {
  const state: NoteState = {
    notes: [
      mockNote({
        title: 'Camp rules',
        body: 'No fires after dark.',
        visibility: 'campaign',
        author_id: gameMaster,
        updated_by: gameMaster,
      }),
      mockNote({ title: 'GM secret', author_id: gameMaster }),
    ],
  }
  const { dialog } = await openNotes(page, state, { member: true })
  // Another player’s private note is never listed.
  await expect(dialog.getByRole('button', { name: 'GM secret' })).toHaveCount(0)
  const row = dialog.getByRole('button', { name: 'Camp rules' }).locator('xpath=..')
  await expect(row).toContainText('game_master')

  await dialog.getByRole('button', { name: 'Camp rules' }).click()
  await expect(dialog.getByText(/Written by game_master/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Edit note' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Make private|Share with/ })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Delete note' })).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Edit note' }).click()
  await expect(dialog.getByRole('radio')).toHaveCount(0)
  await dialog.getByLabel(/^Note/).fill('No fires after dark. Lanterns only.')
  await dialog.getByRole('button', { name: 'Save note' }).click()
  await expect(dialog.getByText('Note saved.')).toBeVisible()
  await expect(dialog.getByText(/Edited by you/)).toBeVisible()
  expect(state.notes[0]).toMatchObject({ author_id: gameMaster, updated_by: accountId })
})

test('an unsaved note asks before the journal closes and before the tab does', async ({ page }) => {
  const { camp, dialog } = await openNotes(page)
  await dialog.getByRole('button', { name: 'New note' }).click()
  await dialog.getByLabel('Title', { exact: true }).fill('Draft')

  // The tab asks too.
  await expect.poll(tabAsks(page)).toBe(true)

  await page.getByRole('button', { name: 'Back to camp' }).click()
  const prompt = page.getByRole('alertdialog', { name: 'Leave without saving?' })
  await expect(prompt).toContainText('Leaving the journal now will discard them')
  await prompt.getByRole('button', { name: 'Keep editing' }).click()
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Draft')

  // Escape inside the question means keep editing, not close the journal.
  await page.getByRole('button', { name: 'Back to camp' }).click()
  await page.keyboard.press('Escape')
  await expect(prompt).toBeHidden()
  await expect(dialog).toBeVisible()

  await page.getByRole('button', { name: 'Back to camp' }).click()
  await prompt.getByRole('button', { name: 'Discard and leave' }).click()
  await expect(dialog).toBeHidden()
  await expect(camp).toHaveAttribute('data-camp-state', 'idle')
  await expect(notesEntry(page)).toBeFocused()

  // Reopening starts from the list, and the tab no longer asks.
  await notesEntry(page).click()
  await expect(dialog.getByRole('button', { name: 'New note' })).toBeVisible()
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveCount(0)
  await expect.poll(tabAsks(page)).toBe(false)
})

test('can be used from the keyboard alone', async ({ page }) => {
  const state: NoteState = { notes: [] }
  await openNotes(page, state)
  await page.getByRole('button', { name: 'Back to camp' }).click()
  await notesEntry(page).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Back to camp' })).toBeFocused()

  // Tab to New note, open it, type, and submit with Enter from the title.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'New note' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused()
  await page.keyboard.type('From the keyboard')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'From the keyboard' })).toBeFocused()
  expect(state.notes.map((row) => row.title)).toEqual(['From the keyboard'])

  // Escape closes the journal and returns to the crates' entry.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(notesEntry(page)).toBeFocused()
})

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['tablet', 820, 1180],
  ['desktop', 1440, 900],
] as const) {
  test(`the notebook fits a ${name} without sideways scrolling`, async ({ page }, testInfo) => {
    const longTitle =
      'A very long title that keeps going well past the width of a narrow phone screen'
    const state: NoteState = {
      notes: [
        mockNote({ title: longTitle, body: 'x'.repeat(400), visibility: 'campaign' }),
        mockNote({ title: 'Short' }),
      ],
    }
    const { dialog } = await openNotes(page, state)
    await page.setViewportSize({ width, height })
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
    const dialogOverflow = () => dialog.evaluate((el) => el.scrollWidth - el.clientWidth)

    // The list, a note, and the editor each fit, with touch-sized controls.
    expect(await overflow()).toBe(0)
    expect(await dialogOverflow()).toBeLessThanOrEqual(0)
    for (const control of await dialog.getByRole('button').all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44 - 1)
    }
    await page.screenshot({ path: testInfo.outputPath(`notes-list-${name}.png`) })

    await dialog.getByRole('button', { name: longTitle }).click()
    await expect(dialog.getByRole('heading', { name: longTitle })).toBeVisible()
    expect(await dialogOverflow()).toBeLessThanOrEqual(0)
    await page.screenshot({ path: testInfo.outputPath(`notes-note-${name}.png`) })

    await dialog.getByRole('button', { name: 'Edit note' }).click()
    await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue(longTitle)
    expect(await dialogOverflow()).toBeLessThanOrEqual(0)
    expect(await overflow()).toBe(0)
    for (const field of [dialog.getByLabel('Title', { exact: true }), dialog.getByLabel(/^Note/)]) {
      const box = (await field.boundingBox())!
      const panel = (await dialog.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width + 1)
    }
    await page.screenshot({ path: testInfo.outputPath(`notes-editor-${name}.png`) })
  })
}
