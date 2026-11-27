import { expect, type Page, type Route, test } from '@playwright/test'
import {
  daggerVision,
  oilVision,
  packText,
  visionsDocument,
  type MockVisions,
} from './support/craftingFixtures.ts'
import {
  corsHeaders,
  mockCampaignApi,
  mockCharacter,
  mockCharacters,
  mockRoster,
  mockSheet,
  openCamp,
  ownerId,
  partyRoster,
  redHand,
} from './support/campMocks.ts'

// M04 Phase 5: the Maker's Visions at the shrine stone, against mocked API routes. The database
// rules (who may read what, the rest, matching) are covered by local-supabase-crafting.spec.ts.

const brand = mockCharacter({ name: 'Brand' })

type Library = {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

type CraftingState = {
  /** What `get_character_visions` returns for the signed-in player's character. */
  visions: MockVisions
  libraries: Library[]
  enabled: string[]
  lastRest: { called_at: string; character_count: number } | null
  saved: string[]
  calls: string[]
  /** Makes the next `call_long_rest` answer that the party has only just rested. */
  restTooSoon?: boolean
}

const library = (overrides: Partial<Library> = {}): Library => ({
  id: 'library-1',
  name: 'Wyvern Components',
  description: null,
  created_at: '2026-11-27T10:00:00Z',
  updated_at: '2026-11-27T10:00:00Z',
  ...overrides,
})

/** The crafting tables and functions, layered over the camp mocks (later routes win). */
async function mockCrafting(page: Page, state: CraftingState) {
  await page.route('**/rest/v1/**', async (route: Route) => {
    const request = route.request()
    const method = request.method()
    const target = new URL(request.url()).pathname.split('/rest/v1/')[1] ?? ''
    const name = target.replace(/^rpc\//, '')
    const headers = corsHeaders()
    const crafting = [
      'get_character_visions',
      'save_vision',
      'unsave_vision',
      'call_long_rest',
      'set_campaign_crafting_library',
      'import_crafting_pack',
      'crafting_rests',
      'crafting_libraries',
      'campaign_crafting_libraries',
      'crafting_items',
      'crafting_recipes',
      'crafting_pack_imports',
    ]
    if (!crafting.includes(name)) return route.fallback()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = method === 'POST' ? (request.postDataJSON() ?? {}) : {}
    const wantsObject = (request.headers().accept ?? '').includes('vnd.pgrst.object')
    const rows = (list: unknown[]) =>
      wantsObject
        ? route.fulfill({ status: list.length === 1 ? 200 : 406, headers, json: list[0] ?? null })
        : route.fulfill({ status: 200, headers, json: list })
    if (method !== 'GET' && method !== 'HEAD') state.calls.push(name)

    switch (name) {
      case 'get_character_visions': {
        const flag = (vision: { recipe_id: string }) => state.saved.includes(vision.recipe_id)
        return route.fulfill({
          status: 200,
          headers,
          json: {
            ...state.visions,
            visions: state.visions.visions.map((vision) => ({ ...vision, saved: flag(vision) })),
          },
        })
      }
      case 'save_vision':
        state.saved.push(body.p_recipe_id)
        return route.fulfill({ status: 204, headers })
      case 'unsave_vision':
        state.saved = state.saved.filter((id) => id !== body.p_recipe_id)
        return route.fulfill({ status: 204, headers })
      case 'call_long_rest': {
        if (state.restTooSoon) {
          state.restTooSoon = false
          return route.fulfill({
            status: 400,
            headers,
            json: { code: 'P0001', message: 'crafting_rest_too_soon' },
          })
        }
        state.lastRest = { called_at: new Date().toISOString(), character_count: 4 }
        return route.fulfill({
          status: 200,
          headers,
          json: {
            rest_id: 'rest-1',
            called_at: state.lastRest.called_at,
            character_count: 4,
            library_count: state.enabled.length,
          },
        })
      }
      case 'crafting_rests':
        return rows(state.lastRest ? [state.lastRest] : [])
      case 'crafting_libraries':
        return rows(state.libraries)
      case 'campaign_crafting_libraries':
        return rows(
          state.enabled.map((id) => ({ library_id: id, enabled_at: '2026-11-27T10:05:00Z' })),
        )
      case 'set_campaign_crafting_library':
        state.enabled = body.p_enabled
          ? [...state.enabled, body.p_library_id]
          : state.enabled.filter((id) => id !== body.p_library_id)
        return route.fulfill({ status: 204, headers })
      case 'crafting_items':
        return rows([])
      case 'crafting_recipes':
        return rows([])
      case 'crafting_pack_imports':
        return rows([])
      case 'import_crafting_pack':
        return route.fulfill({
          status: 200,
          headers,
          json: {
            import_id: 'import-1',
            items_added: 2,
            items_updated: 0,
            recipes_added: 1,
            recipes_updated: 0,
            items_removed: 0,
            recipes_removed: 0,
          },
        })
    }
  })
}

async function openShrine(
  page: Page,
  state: CraftingState,
  options: { owner?: boolean; width?: number; height?: number } = {},
) {
  await page.setViewportSize({ width: options.width ?? 1440, height: options.height ?? 900 })
  await mockCampaignApi(
    page,
    [options.owner ? redHand : { ...redHand, owner_id: ownerId }],
    options.owner ? {} : { memberMode: true },
  )
  await mockRoster(page, () => partyRoster(3))
  await mockCharacters(page, { characters: [brand], sheets: [mockSheet(brand.id)] })
  await mockCrafting(page, state)
  await openCamp(page)
  const entry = shrineEntry(page)
  await entry.click()
  const dialog = page.getByRole('dialog', { name: 'The Maker’s Visions' })
  await expect(dialog).toBeVisible()
  return dialog
}

const shrineEntry = (page: Page) =>
  page.getByRole('list', { name: 'Camp places' }).getByRole('button', { name: /^Visions/ })

const freshState = (overrides: Partial<CraftingState> = {}): CraftingState => ({
  visions: visionsDocument(),
  libraries: [],
  enabled: [],
  lastRest: null,
  saved: [],
  calls: [],
  ...overrides,
})

test('a player with no library, no rest, or a quiet rest gets the matching empty state', async ({
  page,
}) => {
  const state = freshState({
    visions: visionsDocument({ library_count: 0, last_rest_at: null, visions: [], fragments: [] }),
  })
  const dialog = await openShrine(page, state)
  await expect(
    dialog.getByText('Your DM hasn’t added a crafting library to this campaign.'),
  ).toBeVisible()
  // A member never sees the DM's side.
  await expect(dialog.getByRole('button', { name: /DM: libraries/ })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Call a long rest' })).toHaveCount(0)

  state.visions = visionsDocument({ last_rest_at: null, visions: [], fragments: [] })
  await page.reload()
  await shrineEntry(page).click()
  await expect(
    page.getByText('No visions yet. They come when the party takes a long rest.'),
  ).toBeVisible()

  state.visions = visionsDocument({ visions: [], fragments: [] })
  await page.reload()
  await shrineEntry(page).click()
  await expect(
    page.getByText('Nothing stirred in your dreams. Carry new materials into your next rest.'),
  ).toBeVisible()
})

test('shows a vision with its costs, a fragment, and the new count at the shrine', async ({
  page,
}) => {
  const state = freshState()
  const dialog = await openShrine(page, state)
  // Two new: the dagger vision and the fragment. The oil is old.
  await expect(shrineEntry(page)).toHaveAccessibleName('Visions, 2 new')

  await expect(dialog.getByRole('heading', { name: 'Visions (2)' })).toBeVisible()

  // What the rest brought is sealed: only what is behind each seal is named.
  await expect(dialog.getByText('2 things stir from the rest')).toBeVisible()
  await expect(dialog.getByText('Wyvern Fang Dagger')).toHaveCount(0)
  await expect(dialog.locator('.vision-card--fragment')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Break the seal on a vision' }).click()
  // The folio opens itself and totals what is still to pay.
  await expect(dialog.getByText('110 gp still to pay, 1 material missing')).toBeVisible()
  // The card's face already says what is held; the recipe opens to the whole costing.
  const face = dialog.locator('.vision-card', { hasText: 'Wyvern Fang Dagger' })
  await expect(face.locator('.vision-face__line').first()).toContainText('1 of 2')
  await face.getByText('Recipe details').click()
  const fang = dialog.getByRole('row', { name: /Wyvern Fang × 2/ })
  await expect(fang).toContainText('have 1 of 2')
  await expect(dialog.getByRole('row', { name: /^Still to pay/ })).toContainText('110 gp')
  await expect(dialog.getByRole('row', { name: /^Total/ })).toContainText('200 gp')
  await expect(dialog.getByText('Proficiency in Arcana.')).toBeVisible()

  await expect(dialog.getByRole('heading', { name: 'Fragments (1)' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Break the seal on a fragment' }).click()
  await expect(dialog.getByText('Unknown item: ???')).toBeVisible()
  const fragment = dialog.locator('.vision-card--fragment')
  await expect(fragment.locator('.vision-face__line').first()).toContainText('Wyvern Fang')
  await expect(fragment.locator('.vision-face__line').first()).toContainText('held')
  await expect(fragment.getByText('×1')).toBeVisible()
  // Nothing about the recipe leaks beyond what the fragment holds.
  await expect(dialog.getByText('Wyrmfang Blade')).toHaveCount(0)
})

test('saves a vision, keeps it across a reload, and removes it again', async ({ page }) => {
  const state = freshState({ visions: visionsDocument({ visions: [daggerVision, oilVision] }) })
  const dialog = await openShrine(page, state)
  await dialog.locator('summary').filter({ hasText: 'Venom Blade Oil' }).click()
  await dialog.getByRole('button', { name: 'Save this vision (Venom Blade Oil)' }).click()
  await expect(dialog.getByText('Saved', { exact: true })).toBeVisible()
  expect(state.saved).toEqual([oilVision.recipe_id])

  await page.reload()
  await shrineEntry(page).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.locator('summary').filter({ hasText: 'Venom Blade Oil' }).click()
  await page.getByRole('button', { name: 'Remove from saved (Venom Blade Oil)' }).click()
  await expect(page.getByText('Saved', { exact: true })).toHaveCount(0)
  expect(state.saved).toEqual([])
})

test('explains a full row of saved visions without losing the list', async ({ page }) => {
  const state = freshState()
  const dialog = await openShrine(page, state)
  await page.route('**/rest/v1/rpc/save_vision', (route) =>
    route.fulfill({
      status: 400,
      headers: corsHeaders(),
      json: { code: 'P0001', message: 'saved_limit_reached' },
    }),
  )
  await dialog.locator('summary').filter({ hasText: 'Venom Blade Oil' }).click()
  await dialog.getByRole('button', { name: 'Save this vision (Venom Blade Oil)' }).click()
  await expect(dialog.getByRole('alert')).toContainText('up to 200 saved visions')
  await expect(dialog.getByRole('heading', { name: 'Visions (2)' })).toBeVisible()
})

test('the DM imports a pack, turns the library on, and calls a long rest', async ({ page }) => {
  const state = freshState({ libraries: [library()] })
  const dialog = await openShrine(page, state, { owner: true })
  await dialog.getByRole('button', { name: 'DM: libraries and rests' }).click()

  await expect(dialog.getByText('The party has not rested yet.')).toBeVisible()
  // The box follows the database, so it changes once the refetch lands.
  await dialog.getByLabel('Use in this campaign').click()
  await expect(dialog.getByLabel('Use in this campaign')).toBeChecked()
  await expect.poll(() => state.enabled).toEqual(['library-1'])

  await dialog.getByRole('button', { name: 'Import pack' }).click()
  const importer = page.getByRole('dialog', { name: /^Import a pack/ })
  await importer.getByLabel('2. The pack (JSON)').fill(packText)
  await importer.getByRole('button', { name: 'Import pack' }).click()
  await expect(page.getByText(/Imported .* into Wyvern Components/)).toBeVisible()

  // The DM learns only how many characters the rest reached.
  await dialog.getByRole('button', { name: 'Call a long rest' }).click()
  await expect(dialog.getByRole('group', { name: 'Confirm long rest' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Call the rest' }).click()
  await expect(page.getByText('The party rests. Visions come to 4 characters.')).toBeVisible()
  await expect(dialog.getByText(/The party last rested .*, reaching 4 characters\./)).toBeVisible()
  expect(state.calls).toContain('call_long_rest')
})

test('says the party has only just rested when a second rest comes too soon', async ({ page }) => {
  const state = freshState({
    libraries: [library()],
    enabled: ['library-1'],
    restTooSoon: true,
  })
  const dialog = await openShrine(page, state, { owner: true })
  await dialog.getByRole('button', { name: 'DM: libraries and rests' }).click()
  await dialog.getByRole('button', { name: 'Call a long rest' }).click()
  await dialog.getByRole('button', { name: 'Call the rest' }).click()
  await expect(dialog.getByRole('alert')).toContainText('The party has only just rested.')
  expect(state.lastRest).toBeNull()
})

test('works at phone width', async ({ page }) => {
  const state = freshState()
  const dialog = await openShrine(page, state, { width: 390, height: 844 })
  await dialog.getByRole('button', { name: 'Break all seals' }).click()
  // On a phone one card shows and the next peeks in; the arrows scroll the row.
  await expect(dialog.getByRole('button', { name: 'Scroll Visions (2) forward' })).toBeVisible()
  await dialog
    .locator('.vision-card', { hasText: 'Wyvern Fang Dagger' })
    .getByText('Recipe details')
    .click()
  await expect(dialog.getByRole('row', { name: /Wyvern Fang × 2/ })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('replays the reveal on request, and remembers what was opened across a reload', async ({
  page,
}) => {
  const state = freshState()
  const dialog = await openShrine(page, state)
  await dialog.getByRole('button', { name: 'Break all seals' }).click()
  // With nothing left sealed the shrine has nothing waiting.
  await expect(shrineEntry(page)).not.toHaveAccessibleName(/new/)
  await expect(dialog.getByText('Wyvern Fang Dagger', { exact: true })).toBeVisible()
  await expect(dialog.getByText(/stir from the rest/)).toHaveCount(0)

  await page.reload()
  await shrineEntry(page).click()
  await expect(page.getByText('Wyvern Fang Dagger', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Break the seal/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Replay the reveal' }).click()
  await expect(page.getByRole('button', { name: 'Break the seal on a vision' })).toBeVisible()
})

test('shows the cards at once, with no show, when motion is reduced', async ({ page }) => {
  const state = freshState()
  const dialog = await openShrine(page, state)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await dialog.getByRole('button', { name: 'Break the seal on a vision' }).click()
  const card = dialog.locator('.vision-card', { hasText: 'Wyvern Fang Dagger' })
  await expect(card).toBeVisible()
  await expect(card).toHaveCSS('animation-name', 'none')
  await expect(card).toContainText('110 gp still to pay')
})
