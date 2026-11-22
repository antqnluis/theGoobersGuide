import { expect, type Page, test } from '@playwright/test'
import { formatSpec } from '../src/features/dice/diceNotation.ts'
import type { DiceTerm } from '../src/features/dice/diceTypes.ts'
import {
  accountId,
  corsHeaders,
  mockCampaignApi,
  mockCharacter,
  mockCharacters,
  mockNotes,
  mockNote,
  mockRoster,
  mockSheet,
  openCamp,
  partyRoster,
  redHand,
} from './support/campMocks.ts'

// M03.7 dice (Phase 5): the dock, the tray, sheet rolls, and text chips against mocked API routes.
// The server's rules (faces, limits, visibility, retention) are covered by
// local-supabase-dice.spec.ts. The Realtime socket is not mocked, so nothing here depends on it.

type MockRoll = {
  id: string
  campaign_id: string
  roller_id: string
  character_id: string | null
  visibility: string
  source: string
  label: string | null
  expression: string
  terms: DiceTerm[]
  dice: { value: number; kept: boolean }[][]
  total: number
  created_at: string
}

type DiceState = {
  rolls: MockRoll[]
  /** What each `roll_dice` call asked for. */
  calls: Record<string, unknown>[]
  /** The face every die shows. */
  face: number
  /** Refuse the next roll with this status. */
  failNext?: { status: number; code: string; message: string }
}

async function mockDice(page: Page, state: DiceState) {
  await page.route('**/rest/v1/dice_rolls**', async (route) => {
    const headers = corsHeaders()
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    return route.fulfill({ status: 200, headers, json: state.rolls })
  })
  await page.route('**/rest/v1/rpc/roll_dice', async (route) => {
    const headers = corsHeaders()
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = route.request().postDataJSON() as Record<string, unknown>
    state.calls.push(body)
    if (state.failNext) {
      const { status, code, message } = state.failNext
      state.failNext = undefined
      return route.fulfill({ status, headers, json: { code, message } })
    }
    const terms = body.p_terms as DiceTerm[]
    let total = 0
    const dice = terms.map((term) => {
      if (term.kind === 'constant') {
        total += term.sign * term.value
        return []
      }
      const faces = Array.from({ length: term.count }, (_, index) => ({
        value: Math.min(state.face, term.sides),
        kept: !term.keep || index < term.keep.count,
      }))
      total += term.sign * faces.filter((face) => face.kept).reduce((sum, f) => sum + f.value, 0)
      return faces
    })
    const roll: MockRoll = {
      id: crypto.randomUUID(),
      campaign_id: body.p_campaign_id as string,
      roller_id: accountId,
      character_id: (body.p_character_id as string | null) ?? null,
      visibility: (body.p_visibility as string) ?? 'campaign',
      source: (body.p_source as string) ?? 'tray',
      label: (body.p_label as string | null) ?? null,
      expression: formatSpec({ terms }),
      terms,
      dice,
      total,
      created_at: new Date().toISOString(),
    }
    state.rolls.unshift(roll)
    return route.fulfill({ status: 200, headers, json: roll })
  })
}

const stealthSheet = (characterId: string) =>
  mockSheet(characterId, {
    sheet: {
      version: 1,
      abilities: { str: 16, dex: 14, con: 12, int: 10, wis: 10, cha: 8 },
      skills: { stealth: 'expertise' },
      attacks: [
        {
          id: '3f1c9a52-8d4e-4b7a-9c61-0a2b5d7e9f10',
          name: 'Longsword',
          bonus: '+5',
          damage: '1d8+3 slashing',
          notes: '',
        },
      ],
      spells: '1st level (2 slots): Burning Hands (3d6 fire)',
      features: 'Second Wind heals 1d10 + 3.',
    },
  })

async function setup(page: Page, state: DiceState = { rolls: [], calls: [], face: 7 }) {
  await page.setViewportSize({ width: 1440, height: 900 })
  const brand = mockCharacter({ name: 'Brand', level: 3 })
  await mockCampaignApi(page, [redHand])
  await mockRoster(page, () => partyRoster(3))
  await mockCharacters(page, { characters: [brand], sheets: [stealthSheet(brand.id)] })
  await mockNotes(page, {
    notes: [
      mockNote({
        title: 'Cellar trap',
        body: 'The dart trap deals 1d4 + 2 piercing.',
        author_id: accountId,
        visibility: 'private',
      }),
    ],
  })
  await mockDice(page, state)
  const camp = await openCamp(page)
  return { state, camp, brand }
}

const dock = (page: Page) => page.getByRole('button', { name: /^Dice/ })
const tray = (page: Page) => page.getByRole('region', { name: 'Dice tray' })
const places = (page: Page) => page.getByRole('list', { name: 'Camp places' })

test('the dock opens a tray over the camp and rolls a die and a typed roll', async ({ page }) => {
  const { state } = await setup(page)
  await dock(page).click()
  await expect(tray(page)).toBeVisible()
  await expect(tray(page)).toBeFocused()
  await expect(tray(page).getByText('Nothing rolled yet')).toBeVisible()

  await tray(page).getByRole('button', { name: 'd20' }).click()
  await expect(tray(page).locator('.dice-result__total')).toContainText('7')
  expect(state.calls[0]).toMatchObject({ p_visibility: 'campaign', p_source: 'tray' })
  expect(state.calls[0].p_terms).toEqual([{ kind: 'dice', sign: 1, count: 1, sides: 20 }])

  await tray(page).getByRole('textbox', { name: 'Roll' }).fill('2d6 + 3')
  await tray(page).getByRole('button', { name: 'Roll', exact: true }).click()
  await expect(tray(page).locator('.dice-result__total')).toContainText('17')
  await expect(tray(page).getByRole('list', { name: 'Dice rolled' }).first()).toContainText('+')

  // A roll the field cannot read says so before anything is sent.
  await tray(page).getByRole('textbox', { name: 'Roll' }).fill('2x6')
  await tray(page).getByRole('button', { name: 'Roll', exact: true }).click()
  await expect(tray(page).getByRole('alert')).toContainText('Expected')
  expect(state.calls).toHaveLength(2)

  // Escape closes the tray and returns focus to the key; R opens it again.
  await page.keyboard.press('Escape')
  await expect(tray(page)).toHaveCount(0)
  await expect(dock(page)).toBeFocused()
  await page.keyboard.press('r')
  await expect(tray(page)).toBeVisible()
})

test('advantage and private rolls are sent as asked', async ({ page }) => {
  const { state } = await setup(page)
  await dock(page).click()
  await tray(page).getByRole('radio', { name: 'Advantage', exact: true }).check()
  await tray(page).getByRole('checkbox', { name: 'Only I can see my rolls' }).check()
  await tray(page).getByRole('button', { name: 'd20' }).click()
  await expect(tray(page).getByText('Only you').first()).toBeVisible()
  expect(state.calls[0]).toMatchObject({ p_visibility: 'self' })
  expect(state.calls[0].p_terms).toEqual([
    { kind: 'dice', sign: 1, count: 2, sides: 20, keep: { mode: 'high', count: 1 } },
  ])
})

test('a failed roll shows the notice and retries', async ({ page }) => {
  const state: DiceState = {
    rolls: [],
    calls: [],
    face: 7,
    failNext: { status: 400, code: 'P0001', message: 'dice_rate_limited' },
  }
  await setup(page, state)
  await dock(page).click()
  await tray(page).getByRole('button', { name: 'd8' }).click()
  const alert = tray(page).getByRole('alert')
  await expect(alert).toContainText('Slow down — too many rolls at once.')
  await alert.getByRole('button', { name: 'Retry' }).click()
  await expect(alert).toHaveCount(0)
  await expect(tray(page).locator('.dice-result__total')).toContainText('7')
  expect(state.calls).toHaveLength(2)
})

test('the dock stays reachable over an open journal, and Escape closes only the tray', async ({
  page,
}) => {
  const { state } = await setup(page)
  await places(page)
    .getByRole('button', { name: /^Notes/ })
    .click()
  const journal = page.getByRole('dialog', { name: 'Campaign notes' })
  await expect(journal).toBeVisible()

  const key = journal.getByRole('button', { name: /^Dice/ })
  await expect(key).toBeVisible()
  await key.click()
  await expect(journal.getByRole('region', { name: 'Dice tray' })).toBeVisible()
  await journal.getByRole('button', { name: 'd6' }).click()
  await expect(journal.locator('.dice-result__total')).toContainText('7')
  expect(state.calls).toHaveLength(1)

  await page.keyboard.press('Escape')
  await expect(journal.getByRole('region', { name: 'Dice tray' })).toHaveCount(0)
  await expect(journal).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(journal).toBeHidden()
  // Back at the camp, the dock is on the page again.
  await expect(dock(page)).toBeVisible()
})

test('a sheet roll shows a peek, rolls as the character, and offers critical damage on a 20', async ({
  page,
}) => {
  const state: DiceState = { rolls: [], calls: [], face: 20 }
  const { brand } = await setup(page, state)
  await places(page)
    .getByRole('button', { name: /^My characters/ })
    .click()
  const journal = page.getByRole('dialog', { name: 'My characters' })
  await expect(journal.getByRole('heading', { name: 'Brand' })).toBeVisible()

  await journal.getByRole('button', { name: /^Roll Stealth check/ }).click()
  expect(state.calls[0]).toMatchObject({
    p_label: 'Stealth check',
    p_source: 'skill',
    p_character_id: brand.id,
  })
  // The tray is shut, so the result peeks beside the key.
  const peek = journal.locator('.dice-peek__open')
  await expect(peek).toContainText('Stealth check')
  await expect(peek).toContainText('Natural 20')

  // An attack: to-hit on a natural 20 offers doubled damage.
  await journal.getByRole('button', { name: /^Roll Longsword to hit/ }).click()
  expect(state.calls[1]).toMatchObject({ p_label: 'Longsword attack', p_source: 'attack' })
  await journal.getByRole('button', { name: 'Roll critical damage' }).click()
  await expect.poll(() => state.calls.length).toBe(3)
  expect(state.calls[2]).toMatchObject({
    p_source: 'damage',
    p_label: 'Longsword damage — slashing (critical)',
    p_character_id: brand.id,
  })
  expect(state.calls[2].p_terms).toEqual([
    { kind: 'dice', sign: 1, count: 2, sides: 8 },
    { kind: 'constant', sign: 1, value: 3 },
  ])
})

test('the sheet roll menu offers advantage, disadvantage, and private', async ({ page }) => {
  const { state } = await setup(page)
  await places(page)
    .getByRole('button', { name: /^My characters/ })
    .click()
  const journal = page.getByRole('dialog', { name: 'My characters' })
  await journal.getByRole('button', { name: /^Roll initiative/ }).click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Roll options for Initiative' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Roll with advantage',
    'Roll with disadvantage',
    'Roll privately',
  ])
  await menu.getByRole('menuitem', { name: 'Roll with disadvantage' }).click()
  expect(state.calls[0].p_terms).toEqual([
    { kind: 'dice', sign: 1, count: 2, sides: 20, keep: { mode: 'low', count: 1 } },
    { kind: 'constant', sign: 1, value: 2 },
  ])
})

test('dice written in spells, features, and notes become chips that roll', async ({ page }) => {
  const { state } = await setup(page)
  await places(page)
    .getByRole('button', { name: /^My characters/ })
    .click()
  const sheet = page.getByRole('dialog', { name: 'My characters' })
  await sheet.getByRole('button', { name: 'Roll 3d6 for Burning Hands' }).click()
  expect(state.calls[0]).toMatchObject({ p_label: 'Burning Hands — 3d6', p_source: 'text' })
  await sheet.getByRole('button', { name: /^Roll 1d10 \+ 3/ }).click()
  expect(state.calls[1]).toMatchObject({ p_label: '1d10 + 3', p_source: 'text' })
  // The words themselves are unchanged.
  await expect(sheet.getByText(/Second Wind heals/)).toHaveText('Second Wind heals 1d10 + 3.')

  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await places(page)
    .getByRole('button', { name: /^Notes/ })
    .click()
  const notes = page.getByRole('dialog', { name: 'Campaign notes' })
  await notes.getByRole('button', { name: /Cellar trap/ }).click()
  await notes.getByRole('button', { name: 'Roll 1d4 + 2 for Cellar trap' }).click()
  expect(state.calls[2]).toMatchObject({ p_label: 'Cellar trap — 1d4 + 2', p_source: 'text' })
  await expect(notes.locator('.note-body')).toHaveText('The dart trap deals 1d4 + 2 piercing.')
})

test('the dock fits a phone and the tray becomes a bottom sheet', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 375, height: 760 })
  await dock(page).click()
  const box = await tray(page).boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBe(0)
  expect(box!.width).toBe(375)
  expect(box!.y + box!.height).toBeCloseTo(760, 0)
  await expect(dock(page)).toBeHidden()
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )
  expect(fits).toBe(true)
  await tray(page).getByRole('button', { name: 'Close' }).click()
  await expect(dock(page)).toBeVisible()
  await expect(dock(page)).toBeFocused()
})
