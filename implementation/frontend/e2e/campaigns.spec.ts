import { expect, type Page, test } from '@playwright/test'
import { adventurerAppearance } from '../src/features/campaigns/camp/adventurerAppearance.ts'
import { cameraToFrame, restCameraX } from '../src/features/campaigns/camp/campCamera.ts'
import { seatParty } from '../src/features/campaigns/camp/campLayout.ts'
import { campRamps } from '../src/features/campaigns/camp/campPalette.ts'
import { masterBiome, masterFixed } from '../src/features/campaigns/camp/masterPalette.ts'
import { planetAppearance } from '../src/features/campaigns/planetModel.ts'
import type { RosterMember } from '../src/features/campaigns/camp/campLayout.ts'
import {
  accountId,
  type Campaign,
  type CharacterState,
  type MembershipFailure,
  campDraws,
  campLog,
  corsHeaders,
  enterFromGalaxy,
  mockCampaignApi,
  mockCharacter,
  mockCharacters,
  mockMembership,
  mockSheet,
  mockRoster,
  openCamp,
  ownerId,
  partyRoster,
  redHand,
  signIn,
  watchCamp,
} from './support/campMocks.ts'

test('selects by keyboard, opens the workspace explicitly, and returns to the overview', async ({
  page,
}) => {
  await mockCampaignApi(page, [redHand])
  await signIn(page)

  const campaign = page.getByRole('button', { name: 'The Red Hand', exact: true })
  const details = page.getByRole('region', { name: 'Campaign details' })
  const openWorkspace = page.getByRole('link', { name: 'Enter campaign' })
  await expect(openWorkspace).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Campaign orbit' })).toHaveCount(0)
  await campaign.focus()
  await campaign.press('Enter')
  await expect(campaign).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await expect(details.getByRole('heading', { name: 'The Red Hand' })).toBeVisible()
  await expect(details.getByText(redHand.description!)).toBeVisible()
  await expect(details.getByText('Your role:')).toContainText('Owner')
  await expect(details.getByText('1 member', { exact: true })).toBeVisible()

  await details.getByRole('button', { name: 'Return to galaxy overview' }).click()
  await expect(campaign).toBeFocused()
  await expect(campaign).toHaveAttribute('aria-pressed', 'false')
  await campaign.press('Space')
  await openWorkspace.click()
  await expect(page).toHaveURL(/\/app\/campaigns\/00000000-0000-4000-8000-000000000011$/)
  await expect(page.getByRole('heading', { name: redHand.name })).toBeVisible()
  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'People in this campaign' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to camp' }).click()

  await page.goBack()
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await expect(campaign).toHaveAttribute('aria-pressed', 'false')
  await expect(openWorkspace).toHaveCount(0)

  await page.goto(`/app/campaigns/${redHand.id}`)
  await expect(page.getByRole('heading', { name: 'The Red Hand' })).toBeVisible()
  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await expect(page.getByRole('listitem').getByText('player_one', { exact: true })).toBeVisible()
})

test('scopes member counts to the selected campaign and retries failures', async ({ page }) => {
  const second = { ...redHand, id: '00000000-0000-4000-8000-000000000012', name: 'Far Shore' }
  let releaseFirst!: (count: number) => void
  const firstCount = new Promise<number>((resolve) => {
    releaseFirst = resolve
  })
  const requests: string[] = []
  let failSecond = true
  await mockCampaignApi(page, [redHand, second], {
    memberCount: async (id) => {
      requests.push(id)
      return id === redHand.id ? firstCount : failSecond ? null : 4
    },
  })
  await signIn(page)

  const details = page.getByRole('region', { name: 'Campaign details' })
  await expect(page.getByRole('button', { name: redHand.name, exact: true })).toBeVisible()
  await expect(details).toHaveCount(0)
  expect(requests).toEqual([])
  await page.getByRole('button', { name: redHand.name, exact: true }).click()
  await expect(details.getByText('Loading member count…')).toBeVisible()
  await expect.poll(() => requests).toEqual([redHand.id])

  await page.getByRole('button', { name: second.name }).click()
  await expect(details.getByRole('heading', { name: second.name })).toBeVisible()
  releaseFirst(1)
  await expect(details.getByText('Member count unavailable')).toBeVisible()
  await expect(details.getByRole('link', { name: 'Enter campaign' })).toBeVisible()

  failSecond = false
  await details.getByRole('button', { name: 'Retry count' }).click()
  await expect(details.getByText('4 members', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/app\/campaigns$/)
})

test('validates and creates a campaign before opening its workspace', async ({ page }) => {
  await mockCampaignApi(page, [])
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Your next story starts here.' })).toBeVisible()

  await page.getByRole('link', { name: 'Create campaign' }).first().click()
  await expect(page).toHaveURL(/\/app\/campaigns\/new$/)
  const name = page.getByLabel('Campaign name')
  await name.fill('   ')
  await page.getByRole('button', { name: 'Create campaign' }).click()
  await expect(page.getByText('Enter a campaign name.')).toBeVisible()
  await expect(name).toBeFocused()

  await name.fill('  The Far Shore  ')
  await page.getByLabel('Description (optional)').fill('  A voyage beyond the known coast.  ')
  await page.getByRole('button', { name: 'Create campaign' }).click()
  await expect(page).toHaveURL(/\/app\/campaigns\/00000000-0000-4000-8000-000000000099$/)
  await expect(page.getByRole('status').filter({ hasText: 'Campaign created.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The Far Shore' })).toBeVisible()
})

test('lets the owner edit details and confirms deletion', async ({ page }) => {
  await mockCampaignApi(page, [redHand])
  await signIn(page)
  await page.getByRole('button', { name: 'The Red Hand', exact: true }).click()
  await page.getByRole('link', { name: 'Enter campaign' }).click()

  const settings = page.getByRole('button', { name: 'Campaign settings', exact: true })
  await settings.click()
  await page.getByRole('button', { name: 'Edit details' }).click()
  await page.getByLabel('Campaign name').fill('   ')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Enter a campaign name.')).toBeVisible()
  await page.getByLabel('Campaign name').fill('The Red Hand: Reframed')
  await page.keyboard.press('Escape')
  await expect(settings).toBeFocused()
  await settings.click()
  await expect(page.getByLabel('Campaign name')).toHaveValue('The Red Hand: Reframed')
  await page.getByLabel('Description (optional)').fill('A different account of the same town.')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Campaign details saved.' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Back to camp' }).click()
  await expect(page.getByRole('heading', { name: 'The Red Hand: Reframed' })).toBeVisible()

  await settings.click()
  await page.getByRole('button', { name: 'Delete campaign' }).click()
  await expect(page.getByRole('group', { name: 'Confirm campaign deletion' })).toContainText(
    "Delete The Red Hand: Reframed permanently? Its details, member list, and every player's characters and character sheets will be removed. This can't be undone.",
  )
  await page.getByRole('button', { name: 'Keep campaign' }).click()
  const deleteButton = page.getByRole('button', { name: 'Delete campaign' })
  await expect(deleteButton).toBeFocused()
  await deleteButton.click()
  await page.keyboard.press('Escape')
  await expect(settings).toBeFocused()

  await settings.click()
  await expect(page.getByRole('group', { name: 'Confirm campaign deletion' })).toHaveCount(0)
  await deleteButton.click()
  await page.getByRole('button', { name: 'Yes, delete campaign' }).click()
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await expect(page.getByRole('status').filter({ hasText: 'Campaign deleted.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your next story starts here.' })).toBeVisible()
})

test('shows member access without owner controls', async ({ page }) => {
  const memberCampaign: Campaign = {
    ...redHand,
    owner_id: ownerId,
  }
  await mockCampaignApi(page, [memberCampaign], { memberMode: true })
  await signIn(page)

  await page.getByRole('button', { name: 'The Red Hand', exact: true }).click()
  await expect(page.getByText('Your role:')).toContainText('Member')
  await page.getByRole('link', { name: 'Enter campaign' }).click()
  await expect(page.getByRole('button', { name: 'Campaign settings' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await expect(page.getByText('Your role').locator('..')).toContainText('Member')
  await page.getByRole('button', { name: 'Back to camp' }).click()
  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await expect(page.getByRole('list').getByText('game_master', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Invite player' })).toHaveCount(0)
})

test('shows a campaign list error and recovers', async ({ page }) => {
  let shouldFail = true
  await mockCampaignApi(page, [], { shouldFailList: () => shouldFail })
  await signIn(page)
  await expect(
    page.getByRole('heading', { name: 'Your campaigns could not be loaded.' }),
  ).toBeVisible({ timeout: 10_000 })

  shouldFail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Your next story starts here.' })).toBeVisible()
})

test('clears selection when a refresh removes access to the campaign', async ({ page }) => {
  let hideCampaign = false
  await mockCampaignApi(page, [redHand], { hideFromList: () => hideCampaign })
  await signIn(page)

  const campaign = page.getByRole('button', { name: 'The Red Hand', exact: true })
  const create = page.getByRole('link', { name: 'Create campaign', exact: true })
  const back = page.getByRole('link', { name: 'Back to campaigns' })
  await campaign.click()
  await create.click()
  await back.click()
  await expect(campaign).toHaveAttribute('aria-pressed', 'true')

  await create.click()
  hideCampaign = true
  await back.click()
  await expect(page.getByRole('heading', { name: 'Your next story starts here.' })).toBeVisible()

  await create.click()
  hideCampaign = false
  await back.click()
  await expect(campaign).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('link', { name: 'Enter campaign' })).toHaveCount(0)
})

test('shows a loading state while campaigns are fetched', async ({ page }) => {
  // Hold the list until the loading state has been seen, so a slow machine cannot miss it.
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await mockCampaignApi(page, [redHand], { delayList: held })
  await signIn(page)

  await expect(
    page.getByRole('status').filter({ hasText: 'Gathering your campaigns…' }),
  ).toBeVisible()
  release()
  await expect(page.getByRole('button', { name: 'The Red Hand', exact: true })).toBeVisible()
})

test('keyboard skip link focuses the campaign content', async ({ page }) => {
  await mockCampaignApi(page, [redHand])
  await signIn(page)

  const skipLink = page.getByRole('link', { name: 'Skip to campaign content' })
  await page.keyboard.press('Tab')
  await expect(skipLink).toBeFocused()
  expect(await skipLink.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/#campaign-content$/)
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('campaign-content')
})

test('does not disclose an unavailable campaign through a direct URL', async ({ page }) => {
  await mockCampaignApi(page, [])
  await signIn(page)
  await page.goto('/app/campaigns/00000000-0000-4000-8000-000000000011')

  await expect(page.getByRole('heading', { name: 'Campaign not available' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit details' })).toHaveCount(0)
})

test('campaign screens fit mobile, tablet, and desktop viewports', async ({ page }) => {
  await mockCampaignApi(page, [redHand])
  await signIn(page)

  const screens = [
    {
      name: 'dashboard',
      path: '/app/campaigns',
      heading: page.getByRole('heading', { name: 'Your campaigns' }),
    },
    {
      name: 'workspace',
      path: `/app/campaigns/${redHand.id}`,
      heading: page.getByRole('heading', { name: 'The Red Hand' }),
    },
    {
      name: 'create',
      path: '/app/campaigns/new',
      heading: page.getByRole('heading', { name: 'Create a campaign' }),
    },
  ]

  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    for (const screen of screens) {
      await page.goto(screen.path)
      await expect(screen.heading).toBeVisible()
      if (screen.name === 'dashboard') {
        const disclosure = page.getByRole('button', { name: 'Your campaigns' })
        if (width === 375) {
          await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
          await expect(page.getByRole('button', { name: 'The Red Hand', exact: true })).toHaveCount(
            0,
          )
          await disclosure.press('Enter')
        }
        await page.getByRole('button', { name: 'The Red Hand', exact: true }).click()
        await expect(page.getByRole('link', { name: 'Enter campaign' })).toBeVisible()
        if (width === 375) await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
      }
      if (screen.name !== 'workspace')
        await expect(page.locator('.galaxy-backdrop canvas[data-galaxy-ready]')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${screen.name} should not overflow at ${width}px`,
      ).toBe(true)
      await page.screenshot({
        path: `test-results/m02-${width}-${screen.name}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    }
  }
})

test('draws the camp scene crisp and keeps destinations usable across viewports', async ({
  page,
}, testInfo) => {
  const longName = 'The Unwritten Chronicles of the Far Shore and the Lanterns Beyond the Sea'
  const roster = Array.from({ length: 32 }, (_, index) => ({
    profile_id: `player-${index}`,
    role: 'member',
    username: `player_${String(index).padStart(2, '0')}`,
  }))
  await mockCampaignApi(page, [{ ...redHand, name: longName }])
  await page.route('**/rest/v1/rpc/get_campaign_party', async (route) => {
    const headers = corsHeaders()
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    await route.fulfill({ status: 200, headers, json: roster })
  })
  const camp = await openCamp(page, { ...redHand, name: longName })

  const heading = page.getByRole('heading', { name: longName, exact: true })
  const canvas = page.locator('[data-camp-canvas]')
  const places = page.getByRole('list', { name: 'Camp places' })
  const back = page.getByRole('button', { name: 'Back to camp' })

  for (const [width, height] of [
    [320, 568],
    [375, 812],
    [768, 960],
    [1280, 720],
    [1440, 900],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height })
    const desktop = width >= 900 && height >= 481
    // The fourth Places entry makes a 375 x 812 phone page scrollable, so start each size at the top.
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(camp).toHaveAttribute('data-camp-ready', 'true')

    // The canvas is drawn 1:1 in device pixels, so every art pixel stays a whole block.
    await expect
      .poll(() =>
        canvas.evaluate((element: HTMLCanvasElement) => {
          // Layout size, not clientWidth: that rounds half pixels differently per engine.
          const ratio = window.devicePixelRatio
          const box = element.getBoundingClientRect()
          return (
            element.width === Math.round(box.width * ratio) &&
            element.height === Math.round(box.height * ratio)
          )
        }),
      )
      .toBe(true)
    await expect(heading).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)

    // Scene buttons that are in frame are usable; the rest leave the tab order.
    const signs = page.locator('[data-camp-sign]')
    const total = await signs.count()
    expect(total).toBe(4)
    let inFrame = 0
    for (let index = 0; index < total; index += 1) {
      const sign = signs.nth(index)
      if ((await sign.evaluate((el) => getComputedStyle(el).visibility)) === 'visible') {
        // The wagon stands off-frame at rest on a wide view, so it is not counted; Places opens it.
        if ((await sign.getAttribute('data-location')) !== 'settings') inFrame += 1
        await expect(sign).toBeInViewport({ ratio: 1 })
        await sign.click({ trial: true })
        const box = (await sign.boundingBox())!
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
      } else {
        await expect(sign).toBeHidden()
      }
    }
    if (desktop) expect(inFrame).toBe(total - 1)

    // Places is the complete, always-available navigation.
    await expect(places).toBeVisible()
    const entries = places.getByRole('button')
    for (let index = 0; index < (await entries.count()); index += 1) {
      await entries.nth(index).scrollIntoViewIfNeeded()
      await expect(entries.nth(index)).toBeVisible()
      expect((await entries.nth(index).boundingBox())?.height).toBeGreaterThanOrEqual(44)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: testInfo.outputPath(`camp-${width}x${height}.png`) })

    const party = places.getByRole('button', { name: /^Party/ })
    await party.scrollIntoViewIfNeeded()
    await party.press('Enter')
    await expect(back).toBeFocused()
    const dialog = page.getByRole('dialog', { name: 'People in this campaign' })
    await expect(dialog).toBeInViewport({ ratio: 1 })
    await expect(camp).toHaveAttribute('data-camp-state', 'party')
    if (!desktop) expect((await dialog.boundingBox())?.width).toBe(width)
    await dialog.getByRole('list').getByText('player_31', { exact: true }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('list').getByText('player_31', { exact: true })).toBeInViewport()
    await expect(back).toBeInViewport({ ratio: 1 })
    await page.keyboard.press('Escape')
    await expect(party).toBeFocused()
    await expect(camp).toHaveAttribute('data-camp-state', 'idle')
  }

  // Opened from a scene button, the dialog returns focus to that button, and
  // to an equivalent control when a resize hides it meanwhile.
  await page.setViewportSize({ width: 1440, height: 900 })
  const sceneParty = page.locator('[data-camp-sign][data-location="party"]')
  await sceneParty.click()
  await expect(back).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sceneParty).toBeFocused()

  await sceneParty.click()
  await page.setViewportSize({ width: 375, height: 812 })
  // The scene re-measures asynchronously; wait until the button has left the frame.
  await expect(sceneParty).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(places.getByRole('button', { name: /^Party/ })).toBeFocused()
})

test('shows the camp in the colours of its planet for every world type', async ({ page }) => {
  const kinds = ['terrestrial', 'desert', 'volcanic', 'frozen', 'rocky', 'gas'] as const
  const found = new Map<string, Campaign>()
  for (let index = 1; found.size < kinds.length && index < 4000; index += 1) {
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    const kind = planetAppearance(id).kind
    if (!found.has(kind)) found.set(kind, { ...redHand, id, name: `World ${kind}` })
  }
  expect(found.size).toBe(kinds.length)
  const fixed = new Set(Object.values(masterFixed).flat())
  const master = new Set(Object.values(masterBiome).flat())

  await mockCampaignApi(page, [...found.values()])
  await signIn(page)
  for (const kind of kinds) {
    const campaign = found.get(kind)!
    await page.goto(`/app/campaigns/${campaign.id}`)
    const camp = page.locator('.camp')
    await expect(camp).toHaveAttribute('data-camp-ready', 'true')
    await expect(camp).toHaveAttribute('data-camp-world', kind)

    const ramps = campRamps(planetAppearance(campaign.id))
    const biome = new Set(Object.values(ramps).flat())
    const colours = await page
      .locator('[data-camp-canvas]')
      .evaluate((canvas: HTMLCanvasElement) => {
        const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
        const seen = new Set<string>()
        for (let at = 0; at < data.length; at += 4 * 5) {
          seen.add(
            '#' +
              ((1 << 24) | (data[at] << 16) | (data[at + 1] << 8) | data[at + 2])
                .toString(16)
                .slice(1),
          )
        }
        return [...seen]
      })
    // Biome colours come from this planet's ramps, never the master keys, and
    // every ramp appears; everything else is a fixed material.
    expect(colours.filter((colour) => master.has(colour) && !biome.has(colour))).toEqual([])
    for (const [material, ramp] of Object.entries(ramps)) {
      expect(
        colours.filter((colour) => ramp.includes(colour)).length,
        `${kind} ${material}`,
      ).toBeGreaterThan(0)
    }
    expect(colours.filter((colour) => !biome.has(colour) && !fixed.has(colour))).toEqual([])
  }
})

/** Every colour in a rectangle of the scene canvas, in CSS pixels. */
async function coloursIn(
  page: Page,
  rect: { left: number; top: number; width: number; height: number },
) {
  return page.locator('[data-camp-canvas]').evaluate((canvas: HTMLCanvasElement, box) => {
    const ratio = canvas.width / canvas.clientWidth
    const { data } = canvas
      .getContext('2d')!
      .getImageData(
        Math.round(box.left * ratio),
        Math.round(box.top * ratio),
        Math.round(box.width * ratio),
        Math.round(box.height * ratio),
      )
    const seen = new Set<string>()
    for (let at = 0; at < data.length; at += 4) {
      seen.add(
        '#' +
          ((1 << 24) | (data[at] << 16) | (data[at + 1] << 8) | data[at + 2]).toString(16).slice(1),
      )
    }
    return [...seen]
  }, rect)
}

test('seats the real roster around the fire and recovers from a roster error', async ({
  page,
}, testInfo) => {
  const roster = partyRoster(14)
  let failing = true
  await mockCampaignApi(page, [redHand])
  await mockRoster(page, () => (failing ? 'fail' : roster))
  await page.setViewportSize({ width: 1440, height: 900 })
  const camp = await openCamp(page)
  const names = page.locator('.camp-name')
  const canvas = page.locator('[data-camp-canvas]')
  const checksum = () =>
    canvas.evaluate((element: HTMLCanvasElement) => {
      const { data } = element.getContext('2d')!.getImageData(0, 0, element.width, element.height)
      let hash = 0
      for (let at = 0; at < data.length; at += 4) hash = (hash * 31 + data[at] + data[at + 1]) | 0
      return hash
    })

  // While the roster cannot load, the bedrolls stay empty: no figures, no plates.
  await expect(names).toHaveCount(0)
  const empty = await checksum()
  await page.locator('[data-camp-sign][data-location="party"]').click()
  await expect(
    page
      .locator('.camp-ledger__body > section:has(#camp-party-heading)')
      .getByText('Campaign members could not be loaded.'),
  ).toBeVisible()
  await expect(names).toHaveCount(0)

  failing = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('list').getByText('game_master', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to camp' }).click()
  await expect(camp).toHaveAttribute('data-camp-state', 'idle')

  // Ten seats, the owner first, then the rest in profile order, a missing
  // username as "Player", and "+N" for the four who did not get a seat.
  const { seated, overflow } = seatParty(roster)
  expect(overflow).toBe(4)
  await expect(names).toHaveCount(seated.length + 1)
  await expect(names.filter({ hasText: /^\+/ })).toHaveText(`+${overflow}`)
  await expect(names.filter({ hasNotText: /^\+/ })).toHaveText(seated.map(({ label }) => label))
  expect(seated[0].label).toBe('game_master')
  expect(seated.some(({ label }) => label === 'Player')).toBe(true)
  expect(await checksum()).not.toBe(empty)

  // Plates are decoration: hidden from assistive technology and outside any list.
  const container = page.locator('.camp-names')
  await expect(container).toHaveAttribute('aria-hidden', 'true')
  expect(await container.evaluate((el) => el.closest('ul, ol, [role="list"]'))).toBeNull()
  expect(await container.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')

  await expect(camp).toHaveAttribute('data-animating', 'false')
  await page.mouse.move(700, 300)
  await page.screenshot({ path: testInfo.outputPath('camp-party-1440x900.png') })

  // Each plate stands over a sprite wearing that member's own cloak and skin.
  const unit = await container.evaluate((el) =>
    parseFloat(getComputedStyle(el).getPropertyValue('--camp-unit')),
  )
  for (const [index, { member }] of seated.entries()) {
    const plate = names.nth(index)
    const look = adventurerAppearance(member.profile_id)
    const left = await plate.evaluate((el) => parseFloat((el as HTMLElement).style.left))
    const top = await plate.evaluate((el) => parseFloat((el as HTMLElement).style.top))
    const colours = await coloursIn(page, {
      left: left - 8 * unit,
      top,
      width: 16 * unit,
      height: 16 * unit,
    })
    expect(colours, member.username ?? 'Player').toContain(masterFixed[`cloak${look.cloak}`][1])
    expect(colours, member.username ?? 'Player').toContain(masterFixed[`skin${look.skin}`][1])
  }

  // Too small to read on a phone: the Party panel is the roster there.
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(camp).toHaveAttribute('data-camp-ready', 'true')
  await expect(names).toHaveCount(0)
})

test('keeps the wagon scenery but gives members no settings control', async ({ page }) => {
  await mockCampaignApi(page, [{ ...redHand, owner_id: ownerId }], { memberMode: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  const camp = await openCamp(page)

  await expect(page.locator('[data-camp-sign]')).toHaveCount(3)
  await expect(page.locator('[data-camp-sign][data-location="characters"]')).toHaveCount(1)
  await expect(page.locator('[data-camp-sign][data-location="settings"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Campaign settings/ })).toHaveCount(0)
  await expect(camp.locator('.camp-name')).toHaveText(['game_master', 'player_one'])

  // The wagon is still drawn, so a click there reaches only scenery.
  await page.mouse.click(280, 680)
  await expect(camp).toHaveAttribute('data-camp-state', 'idle')
})

test('outlines the hovered, focused, or open destination in the scene', async ({ page }) => {
  await mockCampaignApi(page, [redHand])
  await mockRoster(page, () => partyRoster(3))
  await page.setViewportSize({ width: 1440, height: 900 })
  const camp = await openCamp(page)
  const outlined = () =>
    page.locator('[data-camp-outline]').evaluate((canvas: HTMLCanvasElement) => {
      const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
      let count = 0
      for (let at = 3; at < data.length; at += 4) if (data[at] > 0) count += 1
      return count
    })

  expect(await outlined()).toBe(0)

  // The tent is the in-frame object at the left of the camp; the wagon is out of frame at rest.
  const tent = page.locator('[data-camp-sign][data-location="characters"]')
  await tent.hover()
  await expect.poll(outlined).toBeGreaterThan(0)
  const tentOutline = await outlined()
  await page.mouse.move(700, 300)
  await expect.poll(outlined).toBe(0)

  // Bedrolls and seated figures make a bigger outline than the tent alone.
  await page.locator('[data-camp-sign][data-location="party"]').hover()
  await expect.poll(outlined).toBeGreaterThan(0)
  await page.mouse.move(700, 300)
  await expect.poll(outlined).toBe(0)

  // Keyboard focus outlines too, and so does an open destination.
  await page.keyboard.press('Tab')
  await page.locator('.camp-places__destination').first().focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect.poll(outlined).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  await expect(camp).toHaveAttribute('data-camp-state', 'overview')
  await expect.poll(outlined).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await expect(camp).toHaveAttribute('data-camp-state', 'idle')
  expect(tentOutline).toBeGreaterThan(0)
})

test('descends into camp only on arrival from the galaxy, never on load, refresh, or Back', async ({
  page,
}) => {
  await watchCamp(page)
  await mockCampaignApi(page, [redHand])
  await mockRoster(page, () => partyRoster(3))
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page)

  const camp = await enterFromGalaxy(page)
  await expect(camp).toHaveAttribute('data-camp-landfall', 'done', { timeout: 8000 })
  const animating = await campLog(page, 'data-animating')
  expect(animating).toContain('true')
  expect(animating.at(-1)).toBe('false')
  const landfall = await campLog(page, 'data-camp-landfall')
  expect(landfall.indexOf('armed')).toBeGreaterThanOrEqual(0)
  expect(landfall.indexOf('playing')).toBeGreaterThan(landfall.indexOf('armed'))
  expect(landfall.at(-1)).toBe('done')
  // The camera only descends: its x stays at the resting column throughout.
  const rest = String(restCameraX(480))
  expect(new Set(await campLog(page, 'data-camera-x'))).toEqual(new Set([rest]))
  // Interaction works the moment it lands.
  await page.locator('[data-camp-sign][data-location="overview"]').click()
  await expect(camp).toHaveAttribute('data-camp-state', 'overview')
  await page.keyboard.press('Escape')

  // Back and Forward return to the same history entry without replaying it.
  await page.goBack()
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await page.goForward()
  await expect(camp).toHaveAttribute('data-camp-ready', 'true')
  await expect(camp).not.toHaveAttribute('data-camp-landfall')
  await expect(camp).toHaveAttribute('data-animating', 'false')

  // A direct load and a refresh open at rest too.
  await page.goto(`/app/campaigns/${redHand.id}`)
  await expect(camp).toHaveAttribute('data-camp-ready', 'true')
  await expect(camp).not.toHaveAttribute('data-camp-landfall')
  await page.reload()
  await expect(camp).toHaveAttribute('data-camp-ready', 'true')
  await expect(camp).not.toHaveAttribute('data-camp-landfall')
  await expect(camp).toHaveAttribute('data-animating', 'false')
})

test('frames a destination on the open side of its panel and comes back', async ({ page }) => {
  await watchCamp(page)
  await mockCampaignApi(page, [redHand])
  await page.setViewportSize({ width: 1440, height: 900 })
  const camp = await openCamp(page)
  const rest = String(restCameraX(480))
  await expect(camp).toHaveAttribute('data-camera-x', rest)
  await expect(camp).toHaveAttribute('data-animating', 'false')

  for (const [id, worldX] of [
    ['party', 480],
    ['overview', 480],
    ['characters', 280],
  ] as const) {
    await page.locator(`[data-camp-sign][data-location="${id}"]`).click()
    await expect(camp).toHaveAttribute('data-camp-state', id)
    await expect(camp).toHaveAttribute('data-animating', 'false')
    const dialog = page.getByRole('dialog')
    const panel = await dialog.evaluate((el: HTMLElement) => el.offsetWidth)
    const side = await dialog.getAttribute('data-panel-side')
    const expected = cameraToFrame({
      worldX,
      visible: 480,
      panelFraction: panel / 1440,
      panelSide: side as 'left' | 'right',
    })
    await expect(camp).toHaveAttribute('data-camera-x', String(expected))
    expect(side).toBe(worldX > 480 ? 'left' : 'right')
    // The destination's own button is still in frame, beside the panel.
    const sign = page.locator(`[data-camp-sign][data-location="${id}"]`)
    await expect(sign).toBeVisible()
    await expect(sign).toBeInViewport({ ratio: 1 })
    const box = (await sign.boundingBox())!
    const panelBox = (await dialog.boundingBox())!
    expect(box.x + box.width <= panelBox.x || box.x >= panelBox.x + panelBox.width).toBe(true)

    await page.keyboard.press('Escape')
    await expect(camp).toHaveAttribute('data-camp-state', 'idle')
    await expect(camp).toHaveAttribute('data-camera-x', rest)
    await expect(camp).toHaveAttribute('data-animating', 'false')
    await expect(sign).toBeFocused()
  }

  // Every step was a pan, not a jump, and never left the panorama.
  const xs = (await campLog(page, 'data-camera-x')).map(Number)
  expect(xs.length).toBeGreaterThan(12)
  expect(xs.every((x) => x >= 0 && x <= 480)).toBe(true)
})

test('keeps a consistent state and focus through rapid open, close, and Escape', async ({
  page,
}) => {
  await watchCamp(page)
  await mockCampaignApi(page, [redHand])
  await page.setViewportSize({ width: 1440, height: 900 })
  const camp = await openCamp(page)
  const places = page.getByRole('list', { name: 'Camp places' })
  const party = places.getByRole('button', { name: /^Party/ })
  const overview = places.getByRole('button', { name: /^Overview/ })
  const back = page.getByRole('button', { name: 'Back to camp' })

  for (let round = 0; round < 6; round += 1) {
    const place = round % 2 === 0 ? party : overview
    await place.focus()
    await page.keyboard.press('Enter')
    await expect(back).toBeFocused()
    // Mid-pan: Tab never reaches the scene behind the modal panel, and Escape closes it at once.
    await page.keyboard.press('Tab')
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('.camp-scene, .camp-directory') ?? null,
      ),
    ).toBeNull()
    await page.keyboard.press('Escape')
    await expect(camp).toHaveAttribute('data-camp-state', 'idle')
    await expect(place).toBeFocused()
  }

  // Open, switch away through Escape, and open again before the pan settles.
  await party.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await overview.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await party.focus()
  await page.keyboard.press('Enter')
  await expect(camp).toHaveAttribute('data-camp-state', 'party')
  await page.keyboard.press('Escape')

  await expect(camp).toHaveAttribute('data-camp-state', 'idle')
  await expect(camp).toHaveAttribute('data-animating', 'false')
  await expect(camp).toHaveAttribute('data-camera-x', String(restCameraX(480)))
  await expect(party).toBeFocused()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await campLog(page, 'data-camera-x')).map(Number).every(Number.isInteger)).toBe(true)
})

test('moves instantly and never animates under reduced motion', async ({ page }) => {
  await watchCamp(page)
  await mockCampaignApi(page, [redHand])
  await mockRoster(page, () => partyRoster(4))
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page)
  // After signing in, which resets the preference.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const camp = await enterFromGalaxy(page)
  await expect(camp).toHaveAttribute('data-camp-ready', 'true')
  await expect(camp).not.toHaveAttribute('data-camp-landfall')
  await expect(camp).toHaveAttribute('data-animating', 'false')

  const rest = String(restCameraX(480))
  await expect(camp).toHaveAttribute('data-camera-x', rest)
  await page.locator('[data-camp-sign][data-location="party"]').click()
  // The camera is at its frame by the time the panel is open: no easing between.
  await expect(camp).toHaveAttribute('data-camp-state', 'party')
  const during = await camp.getAttribute('data-camera-x')
  expect(during).not.toBe(rest)
  await page.keyboard.press('Escape')
  await expect(camp).toHaveAttribute('data-camera-x', rest)

  // Only the settled values were ever written, and nothing was ever animating.
  expect(await campLog(page, 'data-animating')).not.toContain('true')
  expect(new Set(await campLog(page, 'data-camera-x'))).toEqual(new Set([rest, during]))
  // A single static frame: the effects canvas stops redrawing.
  await page.waitForTimeout(300)
  const before = await campDraws(page)
  await page.waitForTimeout(800)
  expect(await campDraws(page)).toBe(before)
})

test('draws about twelve effect frames a second, none while hidden, and resumes', async ({
  page,
}) => {
  await watchCamp(page)
  await mockCampaignApi(page, [redHand])
  await page.setViewportSize({ width: 1440, height: 900 })
  await openCamp(page)
  await page.waitForTimeout(400)

  const start = await campDraws(page)
  await page.waitForTimeout(1500)
  const idle = (await campDraws(page)) - start
  // Twelve effect frames a second, plus an art redraw each time the party breathes.
  expect(idle / 1.5).toBeGreaterThan(8)
  expect(idle / 1.5).toBeLessThan(20)

  const hide = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => value })
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)
  await hide(true)
  await page.waitForTimeout(150)
  const paused = await campDraws(page)
  await page.waitForTimeout(800)
  expect(await campDraws(page)).toBe(paused)

  await hide(false)
  await expect.poll(() => campDraws(page)).toBeGreaterThan(paused)
})

test('drags the panorama on a phone, clamped, without opening what it passes over', async ({
  page,
}) => {
  await watchCamp(page)
  await mockCampaignApi(page, [redHand])
  await page.setViewportSize({ width: 375, height: 812 })
  const camp = await openCamp(page)
  const rest = Number(await camp.getAttribute('data-camera-x'))
  const scene = page.locator('.camp-scene')
  const box = (await scene.boundingBox())!
  const y = box.y + box.height / 2

  await page.mouse.move(box.x + 100, y)
  await page.mouse.down()
  await page.mouse.move(box.x + 160, y, { steps: 6 })
  await page.mouse.move(box.x + 220, y, { steps: 6 })
  await page.mouse.up()
  const dragged = Number(await camp.getAttribute('data-camera-x'))
  // Dragging right moves the camera left, by the pixels dragged over the art scale.
  expect(dragged).toBeLessThan(rest)
  expect(rest - dragged).toBeGreaterThan(20)
  await expect(camp).toHaveAttribute('data-camp-state', 'idle')
  expect(await campLog(page, 'data-animating')).not.toContain('true')

  // The far edge clamps at the panorama's end.
  for (let pass = 0; pass < 6; pass += 1) {
    await page.mouse.move(box.x + 20, y)
    await page.mouse.down()
    await page.mouse.move(box.x + 340, y, { steps: 8 })
    await page.mouse.up()
  }
  await expect(camp).toHaveAttribute('data-camera-x', '0')
  for (let pass = 0; pass < 6; pass += 1) {
    await page.mouse.move(box.x + 340, y)
    await page.mouse.down()
    await page.mouse.move(box.x + 20, y, { steps: 8 })
    await page.mouse.up()
  }
  expect(Number(await camp.getAttribute('data-camera-x'))).toBe(960 - 375)

  // A tap that does not move still opens a destination.
  await page.getByRole('button', { name: /^Overview/ }).click()
  await expect(camp).toHaveAttribute('data-camp-state', 'overview')
})

test('scrolls the panorama sideways with the wheel, clamped', async ({ page }) => {
  await watchCamp(page)
  await mockCampaignApi(page, [redHand])
  await page.setViewportSize({ width: 1440, height: 900 })
  const camp = await openCamp(page)
  const rest = Number(await camp.getAttribute('data-camera-x'))
  const scene = page.locator('.camp-scene')
  const box = (await scene.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

  // A vertical wheel scrolls right where the page itself cannot scroll.
  await page.mouse.wheel(0, 300)
  await expect(camp).toHaveAttribute('data-animating', 'false')
  const right = Number(await camp.getAttribute('data-camera-x'))
  expect(right).toBeGreaterThan(rest)
  await page.mouse.wheel(0, -300)
  await expect(camp).toHaveAttribute('data-animating', 'false')
  expect(Number(await camp.getAttribute('data-camera-x'))).toBe(rest)

  // A horizontal gesture scrolls the same way, and both ends clamp.
  await page.mouse.wheel(-5000, 0)
  await expect.poll(async () => Number(await camp.getAttribute('data-camera-x'))).toBe(0)
  await page.mouse.wheel(0, 9000)
  await expect.poll(async () => Number(await camp.getAttribute('data-camera-x'))).toBe(960 - 480)
  expect((await campLog(page, 'data-camera-x')).map(Number).every(Number.isInteger)).toBe(true)
  await expect(camp).toHaveAttribute('data-camp-state', 'idle')
})

test('keeps the page scroll on a phone, where only a sideways wheel pans', async ({ page }) => {
  await watchCamp(page)
  await mockCampaignApi(page, [redHand])
  await page.setViewportSize({ width: 375, height: 600 })
  const camp = await openCamp(page)
  const rest = await camp.getAttribute('data-camera-x')
  const box = (await page.locator('.camp-scene').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight),
  ).toBe(true)

  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(250)
  expect(await camp.getAttribute('data-camera-x')).toBe(rest)
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.mouse.wheel(150, 0)
  await expect.poll(() => camp.getAttribute('data-camera-x')).not.toBe(rest)
})

test('pans to a place that is out of frame when it takes focus', async ({ page }) => {
  await watchCamp(page)
  await mockCampaignApi(page, [redHand])
  await page.setViewportSize({ width: 375, height: 812 })
  const camp = await openCamp(page)
  const wagon = page.locator('[data-camp-sign][data-location="settings"]')
  await expect(wagon).toBeHidden()
  const rest = await camp.getAttribute('data-camera-x')

  const places = page.getByRole('list', { name: 'Camp places' })
  await places.getByRole('button', { name: /^Campaign settings/ }).focus()
  await expect(camp).toHaveAttribute('data-animating', 'false')
  expect(await camp.getAttribute('data-camera-x')).not.toBe(rest)
  await expect(wagon).toBeVisible()
  await expect(wagon).toBeInViewport({ ratio: 1 })

  // Opening it from there and closing returns to where the place is in view.
  await page.keyboard.press('Enter')
  await expect(camp).toHaveAttribute('data-camp-state', 'settings')
  await page.keyboard.press('Escape')
  await expect(wagon).toBeVisible()
})

test('stays usable at 200% browser zoom', async ({ page }) => {
  await watchCamp(page)
  await mockCampaignApi(page, [redHand])
  // 200% zoom on a 1440×900 window: half the CSS pixels, twice the device pixel ratio.
  await page.setViewportSize({ width: 720, height: 450 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const camp = await openCamp(page)
  await expect(camp).toHaveAttribute('data-animating', 'false')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(720)
  await expect(page.getByRole('heading', { name: redHand.name, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeInViewport({ ratio: 1 })

  const places = page.getByRole('list', { name: 'Camp places' })
  await expect(places.getByRole('button')).toHaveCount(4)
  for (const button of await places.getByRole('button').all()) {
    await expect(button).toBeInViewport({ ratio: 1 })
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  await places.getByRole('button', { name: /^Overview/ }).click()
  await expect(camp).toHaveAttribute('data-camp-state', 'overview')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Back to camp' })).toBeInViewport({ ratio: 1 })
  await page.keyboard.press('Escape')
  await expect(camp).toHaveAttribute('data-camp-state', 'idle')
})

test('the waystone is a pointer-only shortcut back to the galaxy', async ({ page }) => {
  await watchCamp(page)
  await mockCampaignApi(page, [redHand])
  await page.setViewportSize({ width: 1440, height: 900 })
  const camp = await openCamp(page)
  const stone = page.locator('[data-camp-waystone]')

  // Off-frame at rest, hidden from assistive tech and the tab order always.
  await expect(stone).toBeHidden()
  await expect(stone).toHaveAttribute('aria-hidden', 'true')
  await expect(stone).toHaveAttribute('tabindex', '-1')
  await expect(page.getByRole('link', { name: 'Back to campaigns' })).toHaveCount(1)

  // Scroll the panorama to the high road, and the stone is in frame and clickable.
  const box = (await page.locator('.camp-scene').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(9000, 0)
  await expect(camp).toHaveAttribute('data-animating', 'false')
  await expect(stone).toBeInViewport({ ratio: 1 })
  const size = (await stone.boundingBox())!
  expect(size.width).toBeGreaterThanOrEqual(44)
  expect(size.height).toBeGreaterThanOrEqual(44)

  await stone.click()
  await expect(page).toHaveURL(/\/app\/campaigns$/)
})

test('lets the player pick a camp background, remembered per campaign on this device', async ({
  page,
}, testInfo) => {
  const other = { ...redHand, id: '00000000-0000-4000-8000-000000000012', name: 'The Pale Road' }
  await mockCampaignApi(page, [redHand, other])
  await page.setViewportSize({ width: 1440, height: 900 })
  const camp = await openCamp(page)
  const own = (await camp.getAttribute('data-camp-world'))!
  const gear = page.getByRole('button', { name: 'Camp background settings' })

  // The gear sits in the header beside the account name and Sign out.
  await expect(gear).toBeVisible()
  const header = page.locator('.workspace-header')
  expect(await header.evaluate((el, node) => el.contains(node), await gear.elementHandle())).toBe(
    true,
  )
  expect(Math.min(...Object.values((await gear.boundingBox())!).slice(2))).toBeGreaterThanOrEqual(
    44,
  )
  await expect(gear).toHaveAttribute('aria-expanded', 'false')

  await gear.click()
  await expect(gear).toHaveAttribute('aria-expanded', 'true')
  const group = page.getByRole('group', { name: 'Camp background' })
  await expect(group).toBeVisible()
  await expect(group.getByRole('radio')).toHaveCount(7)
  // The current choice has focus, and it is the campaign's own world.
  await expect(group.getByRole('radio', { name: /Campaign’s world/ })).toBeChecked()
  await expect(group.getByRole('radio', { name: /Campaign’s world/ })).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('camp-settings-1440x900.png') })

  // Choosing a landscape redraws the camp in it; the panel stays open to compare.
  const kinds: Array<[RegExp, string]> = [
    [/Dunes/, 'desert'],
    [/Snow/, 'frozen'],
    [/Cloud reef/, 'gas'],
    [/Grass and pines/, 'terrestrial'],
  ]
  for (const [name, kind] of kinds) {
    await group.getByRole('radio', { name }).check()
    await expect(camp).toHaveAttribute('data-camp-world', kind)
    await expect(group).toBeVisible()
    await expect(camp).toHaveAttribute('data-camp-ready', 'true')
  }

  // Keyboard: arrow keys move through the group, Escape closes and returns to the gear.
  await group.getByRole('radio', { name: /Dunes/ }).check()
  await group.getByRole('radio', { name: /Dunes/ }).press('ArrowDown')
  await expect(camp).toHaveAttribute('data-camp-world', 'volcanic')
  await page.keyboard.press('Escape')
  await expect(group).toHaveCount(0)
  await expect(gear).toBeFocused()
  await expect(gear).toHaveAttribute('aria-expanded', 'false')
  // Escape in the panel does not close an open destination or leave the page.
  await expect(page).toHaveURL(new RegExp(`${redHand.id}$`))

  // A click elsewhere closes it too.
  await gear.click()
  await expect(group).toBeVisible()
  await page.mouse.click(720, 400)
  await expect(group).toHaveCount(0)

  // The choice survives a reload, is private to this campaign, and can be undone.
  await page.reload()
  await expect(camp).toHaveAttribute('data-camp-ready', 'true')
  await expect(camp).toHaveAttribute('data-camp-world', 'volcanic')
  await page.goto(`/app/campaigns/${other.id}`)
  await expect(camp).toHaveAttribute('data-camp-ready', 'true')
  const otherOwn = await camp.getAttribute('data-camp-world')
  expect(otherOwn).toBe(planetAppearance(other.id).kind)
  await page.goto(`/app/campaigns/${redHand.id}`)
  await expect(camp).toHaveAttribute('data-camp-world', 'volcanic')
  await gear.click()
  await group.getByRole('radio', { name: /Campaign’s world/ }).check()
  await expect(camp).toHaveAttribute('data-camp-world', own)
  expect(
    await page.evaluate((id) => window.localStorage.getItem(`camp-background:${id}`), redHand.id),
  ).toBeNull()

  // Everything else still works afterwards.
  await page.keyboard.press('Escape')
  await page.locator('[data-camp-sign][data-location="overview"]').click()
  await expect(camp).toHaveAttribute('data-camp-state', 'overview')
})

test('keeps the background settings usable on a phone and when storage is blocked', async ({
  page,
}, testInfo) => {
  // Only the camp's own key is blocked, so signing in still works.
  await page.addInitScript(() => {
    const proto = Storage.prototype as unknown as Record<string, (...args: string[]) => unknown>
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      const original = proto[method]
      proto[method] = function (this: Storage, ...args: string[]) {
        if (String(args[0]).startsWith('camp-background:')) {
          throw new DOMException('blocked', 'SecurityError')
        }
        return original.apply(this, args)
      }
    }
  })
  await mockCampaignApi(page, [redHand])
  await page.setViewportSize({ width: 375, height: 812 })
  const camp = await openCamp(page)
  const gear = page.getByRole('button', { name: 'Camp background settings' })
  await expect(gear).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeInViewport({ ratio: 1 })

  await gear.click()
  const group = page.getByRole('group', { name: 'Camp background' })
  await expect(group).toBeInViewport({ ratio: 1 })
  for (const radio of await group.getByRole('radio').all()) {
    expect(
      (await radio.locator('xpath=ancestor::label').boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44)
  }
  await page.screenshot({ path: testInfo.outputPath('camp-settings-375x812.png') })
  // With storage blocked the pick still applies for this visit.
  await group.getByRole('radio', { name: /Snow/ }).check()
  await expect(camp).toHaveAttribute('data-camp-world', 'frozen')
  await expect(page.getByText('Opening campaign workspace…')).toHaveCount(0)
})

test('opens locations from Places when the camp artwork is unavailable', async ({ page }) => {
  await mockCampaignApi(page, [redHand])
  await page.route('**/camp/art/**', (route) => route.abort())
  await signIn(page)
  await page.goto(`/app/campaigns/${redHand.id}`)

  const camp = page.locator('.camp')
  await expect(camp).toHaveAttribute('data-art-failed', 'true')
  await expect(page.locator('[data-camp-canvas]')).toHaveCount(0)
  await expect(page.locator('[data-camp-sign]')).toHaveCount(0)
  const places = page.getByRole('list', { name: 'Camp places' })
  const overview = places.getByRole('button', { name: /^Overview/ })
  await expect(places).toBeVisible()
  await overview.press('Enter')
  const dialog = page.getByRole('dialog', { name: redHand.name })
  await expect(dialog.getByText(redHand.description!)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(overview).toBeFocused()
  await page.getByRole('link', { name: 'Back to campaigns' }).click()
  await expect(page).toHaveURL(/\/app\/campaigns$/)
})

test('falls back to the gradient when the scene code cannot load', async ({ page }) => {
  await mockCampaignApi(page, [redHand])
  await page.route('**/CampLandscape*', (route) => route.abort())
  await signIn(page)
  await page.goto(`/app/campaigns/${redHand.id}`)

  await expect(page.locator('.camp')).toHaveAttribute('data-art-failed', 'true')
  const places = page.getByRole('list', { name: 'Camp places' })
  await places.getByRole('button', { name: /^Party/ }).press('Enter')
  await expect(page.getByRole('dialog', { name: 'People in this campaign' })).toBeVisible()
})

test('loads no WebGL code on the camp page', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))
  await mockCampaignApi(page, [redHand])
  await signIn(page)
  requested.length = 0
  await page.goto(`/app/campaigns/${redHand.id}`)
  await expect(page.locator('.camp')).toHaveAttribute('data-camp-ready', 'true')
  // The tiny loader module may be imported; the scene and the three.js library must not be.
  const webgl = /\/(three|@react-three)|GalaxyCanvas\.tsx|planetShaders|OrreryWorlds/
  expect(requested.filter((url) => webgl.test(url))).toEqual([])
})

test('retries campaign and party loading from the camp', async ({ page }) => {
  await mockCampaignApi(page, [redHand])
  const error = { message: 'temporary test failure' }
  let releaseCampaign!: () => void
  let releaseRoster!: () => void
  const pendingCampaign = new Promise<void>((resolve) => {
    releaseCampaign = resolve
  })
  const pendingRoster = new Promise<void>((resolve) => {
    releaseRoster = resolve
  })
  let failCampaign = true
  let failRoster = true
  await page.route('**/rest/v1/campaigns?*', async (route) => {
    if (!new URL(route.request().url()).searchParams.has('id') || !failCampaign)
      return route.fallback()
    await pendingCampaign
    await route.fulfill({ status: 400, headers: corsHeaders(), json: error })
  })
  await page.route('**/rest/v1/rpc/get_campaign_party', async (route) => {
    const headers = corsHeaders()
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (failRoster) {
      await pendingRoster
      return route.fulfill({ status: 400, headers, json: error })
    }
    await route.fulfill({ status: 200, headers, json: [] })
  })
  await signIn(page)
  await page.goto(`/app/campaigns/${redHand.id}`)
  await expect(page.getByText('Opening campaign workspace…')).toBeVisible()
  releaseCampaign()
  await expect(page.getByText('This workspace could not be opened.')).toBeVisible()
  failCampaign = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await expect(
    page
      .locator('.camp-ledger__body > section:has(#camp-party-heading)')
      .getByText('Loading campaign members…'),
  ).toBeVisible()
  releaseRoster()
  await expect(
    page
      .locator('.camp-ledger__body > section:has(#camp-party-heading)')
      .getByText('Campaign members could not be loaded.'),
  ).toBeVisible()
  failRoster = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('No member information is available.')).toBeVisible()
})

test('keeps one full-screen WebGL canvas across overlays and falls back after context loss', async ({
  page,
}) => {
  await mockCampaignApi(page, [
    redHand,
    { ...redHand, id: '00000000-0000-4000-8000-000000000012', name: 'Far Shore' },
  ])
  await signIn(page)

  const backdrop = page.locator('.galaxy-backdrop')
  const canvas = backdrop.locator('canvas')
  await expect(canvas).toHaveAttribute('data-galaxy-ready', '')
  const size = page.viewportSize()!
  expect(await canvas.boundingBox()).toEqual({ x: 0, y: 0, ...size })
  const originalCanvas = await canvas.elementHandle()

  const disclosure = page.getByRole('button', { name: 'Your campaigns' })
  await disclosure.click()
  await disclosure.click()
  await page.getByRole('button', { name: 'The Red Hand', exact: true }).click()
  await page.getByRole('link', { name: 'Create campaign' }).click()
  await expect(page.getByRole('heading', { name: 'Create a campaign' })).toBeVisible()
  expect(await canvas.evaluate((element, original) => element === original, originalCanvas)).toBe(
    true,
  )

  await page.getByRole('link', { name: 'Back to campaigns' }).click()
  await expect(page.getByRole('button', { name: 'The Red Hand', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(await canvas.evaluate((element, original) => element === original, originalCanvas)).toBe(
    true,
  )
  await page.getByRole('button', { name: 'Next campaign' }).press('Enter')
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'moving')
  await canvas.evaluate((element: HTMLCanvasElement) => {
    const extension = element.getContext('webgl2')?.getExtension('WEBGL_lose_context')
    if (!extension) throw new Error('WebGL context-loss simulation unavailable')
    extension.loseContext()
  })
  await expect(canvas).toHaveCount(0)
  await expect(backdrop).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause ambient motion' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Far Shore' })).toBeVisible()
  await page.getByRole('button', { name: 'Previous campaign' }).press('Space')
  await page.getByRole('link', { name: 'Enter campaign' }).click()
  await expect(page.getByRole('heading', { name: 'The Red Hand' })).toBeVisible()
  await expect(backdrop).toHaveCount(0)
})

test('keeps a large campaign list scrollable and dismissible on a short phone viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 568 })
  const campaigns = Array.from({ length: 32 }, (_, index) => ({
    ...redHand,
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name: `Campaign ${index + 1}`,
  }))
  await mockCampaignApi(page, campaigns)
  await signIn(page)

  const disclosure = page.getByRole('button', { name: 'Your campaigns' })
  const create = page.getByRole('link', { name: 'Create campaign' })
  await disclosure.press('Enter')
  await expect(create).toBeInViewport({ ratio: 1 })
  const first = page.getByRole('button', { name: 'Campaign 1', exact: true })
  await first.focus()
  await first.press('Escape')
  await expect(disclosure).toBeFocused()
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')

  await disclosure.press('Space')
  const last = page.getByRole('button', { name: 'Campaign 32', exact: true })
  await last.scrollIntoViewIfNeeded()
  await expect(last).toBeInViewport({ ratio: 1 })
  await last.click()
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('heading', { name: 'Campaign 32' })).toBeInViewport({ ratio: 1 })
  await page.getByRole('button', { name: 'Return to galaxy overview' }).click()
  await expect(disclosure).toBeFocused()
  await expect(page.getByRole('region', { name: 'Campaign details' })).toHaveCount(0)
})

test('keeps the selector usable when WebGL cannot start', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {
      apply(getContext, canvas, args) {
        return args[0] === 'webgl2' ? null : Reflect.apply(getContext, canvas, args)
      },
    })
  })
  const initializationFailure = page.waitForEvent('console', {
    predicate: (message) => message.text().includes('Error creating WebGL context'),
  })
  await mockCampaignApi(page, [
    redHand,
    { ...redHand, id: '00000000-0000-4000-8000-000000000012', name: 'Far Shore' },
  ])
  await signIn(page)

  await initializationFailure
  await expect(page.locator('.galaxy-backdrop canvas')).toHaveCount(0)
  const preview = page.getByRole('button', { name: 'View The Red Hand', exact: true })
  const details = page.getByRole('region', { name: 'Campaign details' })
  await preview.press('Enter')
  await expect(details.getByRole('heading', { name: redHand.name })).toBeFocused()
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await details.getByRole('button', { name: 'Return to galaxy overview' }).press('Enter')
  await expect(preview).toBeFocused()
  await page.getByRole('button', { name: 'Next campaign' }).click()
  await expect(details.getByRole('heading', { name: 'Far Shore' })).toBeVisible()
  await page.getByRole('link', { name: 'Enter campaign' }).click()
  await expect(page.getByRole('heading', { name: 'Far Shore' })).toBeVisible()
})

test('selects a specific planet when campaign names match and refreshes labels by ID', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const duplicate = {
    ...redHand,
    id: '00000000-0000-4000-8000-000000000012',
    description: 'A second campaign with the same name.',
  }
  const records = await mockCampaignApi(page, [duplicate, redHand])
  await signIn(page)

  const planetLabels = page.locator('.galaxy-planet-label')
  await expect(planetLabels).toHaveCount(2)
  const label = page.locator(`.galaxy-planet-label[data-campaign-id="${duplicate.id}"]`)
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 })
    await page.reload()
    await expect(planetLabels.first()).toHaveAttribute('data-focal', 'true')
    await expect(label).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`orbital-two-planets-${width}.png`) })
  }
  const [x, y] = await label.evaluate(({ dataset }) => [
    Number(dataset.planetX),
    Number(dataset.planetY),
  ])
  // Pointing at a world marks it on the chart before it is chosen.
  const canvas = page.locator('.galaxy-backdrop canvas')
  await page.mouse.move(x, y)
  await expect(canvas).toHaveAttribute('data-planet-hover', '')
  await expect(label).toHaveAttribute('data-hovered', 'true')
  await page.mouse.move(x, y + 200)
  await expect(canvas).not.toHaveAttribute('data-planet-hover')
  await expect(label).not.toHaveAttribute('data-hovered')

  await page.mouse.click(x, y)
  const details = page.getByRole('region', { name: 'Campaign details' })
  await expect(details.getByText(duplicate.description)).toBeVisible()
  await expect(page.getByRole('button', { name: redHand.name, pressed: true })).toHaveCount(1)
  await expect(label).toHaveAttribute('data-selected', 'true')
  await expect(label).toHaveAttribute('data-focal', 'true')
  await expect(page).toHaveURL(/\/app\/campaigns$/)

  const longName = 'The ' + 'Chronicles of the Uncharted Stars '.repeat(3).trim()
  records.find((campaign) => campaign.id === duplicate.id)!.name = longName
  records.unshift({
    ...redHand,
    id: '00000000-0000-4000-8000-000000000013',
    name: 'The New Expedition',
  })
  await page.reload()
  await expect(planetLabels).toHaveCount(3)
  await expect(planetLabels.first()).toHaveText(redHand.name)
  await expect(label).toHaveText(longName)
  await expect(page.getByRole('button', { name: longName, exact: true })).toBeVisible()
  await expect(details).toHaveCount(0)
})

test('renders all six planet materials in the galaxy without WebGL shader errors', async ({
  page,
}, testInfo) => {
  const shaderErrors: string[] = []
  page.on('console', (message) => {
    if (/shader error|VALIDATE_STATUS|GL_INVALID_OPERATION/i.test(message.text())) {
      shaderErrors.push(message.text())
    }
  })
  const worlds = [
    [3, 'Greenwater'],
    [12, 'The Amber Dunes'],
    [11, 'Emberfall'],
    [4, 'The Violet Tempest'],
    [2, 'Pale Meridian'],
    [9, 'The Broken Moon'],
  ] as const
  await mockCampaignApi(
    page,
    worlds.map(([seed, name]) => ({
      ...redHand,
      id: `00000000-0000-4000-8000-${String(seed).padStart(12, '0')}`,
      name,
    })),
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 960 })
  await signIn(page)

  for (const [width, height] of [
    [1440, 960],
    [375, 900],
  ]) {
    await page.setViewportSize({ width, height })
    if (width === 375) {
      await page.reload()
      await expect(page.getByRole('button', { name: 'Your campaigns' })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
    }
    await expect(page.locator('canvas[data-galaxy-ready]')).toBeVisible()
    const next = page.getByRole('button', { name: 'Next campaign' })
    const seen = new Set<string>()
    for (let index = 0; index < worlds.length; index++) {
      await next.press('Enter')
      const focal = page.locator('.galaxy-planet-label[data-focal="true"]')
      await expect(focal).toBeVisible()
      await expect(focal).toHaveAttribute('data-selected', 'true')
      seen.add((await focal.getAttribute('data-campaign-id'))!)
      await expect(
        page.getByRole('region', { name: 'Campaign details' }).getByRole('heading'),
      ).toHaveText((await focal.textContent())!)
      // Wait for the demand-rendered frame before stepping to another material.
      await expect(focal).toHaveAttribute('data-planet-y', /\d/)
    }
    expect(seen.size).toBe(worlds.length)
    await page.screenshot({ path: testInfo.outputPath(`planet-materials-${width}.png`) })
  }

  expect(shaderErrors).toEqual([])
})

test('keeps the focused world clear of controls and navigable with the keyboard', async ({
  page,
}, testInfo) => {
  const second = { ...redHand, id: '00000000-0000-4000-8000-000000000012', name: 'Far Shore' }
  const third = {
    ...redHand,
    id: '00000000-0000-4000-8000-000000000013',
    name: 'Meridian',
    description: 'A voyage to the edge of the known galaxy. '.repeat(100),
  }
  await mockCampaignApi(page, [third, second, redHand])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signIn(page)

  const details = page.getByRole('region', { name: 'Campaign details' })
  const previous = page.getByRole('button', { name: 'Previous campaign' })
  const next = page.getByRole('button', { name: 'Next campaign' })
  const focal = page.locator('.galaxy-planet-label[data-focal="true"]')

  for (const [width, height] of [
    [375, 568],
    [768, 900],
    [1440, 960],
  ]) {
    await page.setViewportSize({ width, height })
    await page.reload()
    await expect(focal).toHaveText(redHand.name)
    await expect(focal).toHaveAttribute('data-selected', 'false')
    await expect(details).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'View The Red Hand', exact: true }),
    ).toBeInViewport()
    if (width > 375) {
      const rows = page.getByRole('list', { name: 'Campaign list' }).getByRole('button')
      await expect(rows).toHaveCount(3)
      for (const [index, { name }] of [redHand, second, third].entries()) {
        await expect(rows.nth(index)).toHaveAccessibleName(name)
      }
    }
    await page.screenshot({ path: testInfo.outputPath(`orbital-overview-${width}.png`) })
    await previous.press('Enter')
    await expect(previous).toBeFocused()
    await expect(focal).toHaveText(third.name)
    await expect(details.getByRole('heading', { name: third.name })).toBeVisible()

    if (width === 375) {
      await page.getByRole('button', { name: 'Your campaigns' }).press('Enter')
      await expect(page.getByRole('button', { name: third.name, pressed: true })).toBeVisible()
    }

    await page.evaluate(() => document.fonts.ready)
    await expect
      .poll(async () =>
        focal.evaluate((element) => {
          const { planetX, planetY, planetExtent } = element.dataset
          if (!planetX || !planetY || !planetExtent) return false
          const x = Number(planetX)
          const y = Number(planetY)
          const extent = Number(planetExtent)
          const space = document.querySelector('.galaxy-orbit-space')!.getBoundingClientRect()
          return (
            Math.abs(x - (space.left + space.width / 2)) < 1 &&
            Math.abs(y - (space.top + space.height / 2)) < 1 &&
            x - extent >= space.left &&
            x + extent <= space.right &&
            y - extent >= space.top &&
            y + extent <= space.bottom
          )
        }),
      )
      .toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const scene = (await page.locator('.galaxy-orbit-space').boundingBox())!
    const panel = (await details.boundingBox())!
    const orbitNav = (await page.getByRole('navigation', { name: 'Campaign orbit' }).boundingBox())!
    if (width >= 960) {
      expect(panel.x).toBeGreaterThan(scene.x + scene.width)
      expect(Math.abs(panel.y + panel.height / 2 - (scene.y + scene.height / 2))).toBeLessThan(1)
    } else {
      expect(panel.y).toBeGreaterThan(orbitNav.y + orbitNav.height)
    }
    await expect(details.getByRole('link', { name: 'Enter campaign' })).toBeInViewport()
    await expect(
      details.getByRole('button', { name: 'Return to galaxy overview' }),
    ).toBeInViewport()
    await page.screenshot({ path: testInfo.outputPath(`orbital-${width}.png`) })

    await next.press('Space')
    await expect(next).toBeFocused()
    await expect(focal).toHaveText(redHand.name)
    await expect(details.getByRole('heading', { name: redHand.name })).toBeVisible()
    if (width > 375) {
      await expect(page.getByRole('button', { name: redHand.name, pressed: true })).toBeVisible()
    }
  }
})

test('guides each selection source to the same planet framing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  const second = { ...redHand, id: '00000000-0000-4000-8000-000000000012', name: 'Far Shore' }
  const third = { ...redHand, id: '00000000-0000-4000-8000-000000000013', name: 'Meridian' }
  await mockCampaignApi(page, [third, second, redHand])
  await signIn(page)

  const canvas = page.locator('.galaxy-backdrop canvas')
  const details = page.getByRole('region', { name: 'Campaign details' })
  const label = page.locator(`.galaxy-planet-label[data-campaign-id="${second.id}"]`)
  await expect(label).toBeVisible()

  async function position() {
    return label.evaluate(({ dataset }) => [
      Number(dataset.planetX),
      Number(dataset.planetY),
      Number(dataset.planetExtent),
    ])
  }

  async function arrive() {
    await expect(details.getByRole('heading', { name: second.name })).toBeVisible()
    await expect(canvas).toHaveAttribute('data-galaxy-travel', 'moving')
    await expect(canvas).toHaveAttribute('data-galaxy-travel', 'idle')
    await expect(label).toBeVisible()
    return position()
  }

  async function overview() {
    await details.getByRole('button', { name: 'Return to galaxy overview' }).click()
    await expect(details).toHaveCount(0)
    await expect(canvas).toHaveAttribute('data-galaxy-travel', 'moving')
    await expect(canvas).toHaveAttribute('data-galaxy-travel', 'idle')
  }

  const neighbor = await position()
  await page.mouse.click(neighbor[0], neighbor[1])
  const destination = await arrive()
  expect(destination[2]).toBeGreaterThan(neighbor[2])

  // The world keeps orbiting between visits, so the framing is compared to within a pixel.
  async function expectSameFraming() {
    const framing = await arrive()
    framing.forEach((value, index) => expect(value).toBeCloseTo(destination[index], 0))
  }

  await overview()
  await page.getByRole('button', { name: second.name }).press('Enter')
  await expectSameFraming()

  await overview()
  const next = page.getByRole('button', { name: 'Next campaign' })
  await next.press('Enter')
  await expectSameFraming()
})

test('turns the sky as the camera swings between worlds and restores it on the way back', async ({
  page,
}) => {
  await page.clock.install()
  await page.setViewportSize({ width: 1440, height: 960 })
  const second = { ...redHand, id: '00000000-0000-4000-8000-000000000012', name: 'Far Shore' }
  await mockCampaignApi(page, [redHand, second])
  await signIn(page)

  const canvas = page.locator('.galaxy-backdrop canvas')
  const details = page.getByRole('region', { name: 'Campaign details' })
  await expect(page.locator('.galaxy-planet-label[data-focal="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Pause ambient motion' }).press('Space')
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await page.getByRole('button', { name: redHand.name, exact: true }).press('Enter')
  await expect(details.getByRole('heading', { name: redHand.name })).toBeVisible()
  await page.clock.runFor(1200)
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'idle')

  // Sample the sky above the details panel. With ambient motion paused, nothing moves but the camera.
  const sky = { clip: { x: 1050, y: 100, width: 360, height: 175 } }
  const atFirst = await page.screenshot(sky)
  const next = page.getByRole('button', { name: 'Next campaign' })
  const previous = page.getByRole('button', { name: 'Previous campaign' })

  async function settle() {
    await page.clock.runFor(1200)
    await expect(canvas).toHaveAttribute('data-galaxy-travel', 'idle')
    return page.screenshot(sky)
  }

  await next.press('Enter')
  await expect(details.getByRole('heading', { name: second.name })).toBeVisible()
  await page.clock.runFor(300)
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'moving')
  const during = await page.screenshot(sky)

  const atSecond = await settle()
  expect(during.equals(atFirst)).toBe(false)
  expect(atSecond.equals(atFirst)).toBe(false)
  expect(atSecond.equals(during)).toBe(false)

  // Each world has its own place in the system, so coming back to it brings back its sky.
  await next.press('Enter')
  await expect(details.getByRole('heading', { name: redHand.name })).toBeVisible()
  expect((await settle()).equals(atFirst)).toBe(true)

  await previous.press('Enter')
  await expect(details.getByRole('heading', { name: second.name })).toBeVisible()
  expect((await settle()).equals(atSecond)).toBe(true)

  await previous.press('Enter')
  await expect(details.getByRole('heading', { name: redHand.name })).toBeVisible()
  expect((await settle()).equals(atFirst)).toBe(true)
})

test('keeps travelling labels inside the scene and lands each world clear of the controls', async ({
  page,
}, testInfo) => {
  const campaigns = [
    redHand,
    { ...redHand, id: '00000000-0000-4000-8000-000000000012', name: 'Far Shore' },
    { ...redHand, id: '00000000-0000-4000-8000-000000000013', name: 'Meridian' },
    {
      ...redHand,
      id: '00000000-0000-4000-8000-000000000014',
      name: 'Beyond the Far Reaches of the Charted Sea',
      description: 'The crew set sail into a fog that lingered for twelve nights. '.repeat(70),
    },
  ]
  const [first, , , last] = campaigns
  await mockCampaignApi(page, campaigns)
  await signIn(page)
  const canvas = page.locator('.galaxy-backdrop canvas')
  const details = page.getByRole('region', { name: 'Campaign details' })
  const next = page.getByRole('button', { name: 'Next campaign' })

  for (const [width, height] of [
    [1440, 960],
    [768, 900],
    [375, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height })
    await page.reload()
    await expect(page.locator('.galaxy-planet-label[data-focal="true"]')).toHaveText(first.name)
    await expect(canvas).toHaveAttribute('data-galaxy-travel', 'idle')

    const disclosure = page.getByRole('button', { name: 'Your campaigns' })
    if ((await disclosure.getAttribute('aria-expanded')) === 'false')
      await disclosure.press('Enter')
    await page.getByRole('button', { name: first.name, exact: true }).press('Enter')
    await expect(details.getByRole('heading', { name: first.name })).toBeVisible()
    await expect(canvas).toHaveAttribute('data-galaxy-travel', 'idle')
    if ((await disclosure.getAttribute('aria-expanded')) === 'false')
      await disclosure.press('Enter')
    // Observe the whole flight. The world itself may pass behind the controls on the way,
    // but its label only shows inside the clear part of the scene, above the world.
    const samples = page.evaluate(
      ({ from, to }) =>
        new Promise<{ x: number; clear: boolean }[]>((resolve, reject) => {
          const canvas = document.querySelector<HTMLCanvasElement>('.galaxy-backdrop canvas')!
          const rect = document.querySelector<HTMLElement>('.galaxy-orbit-space')!
          const observations: { x: number; clear: boolean }[] = []
          const start = performance.now()
          function observe() {
            if (performance.now() - start > 5000) {
              reject(new Error(`Travel did not settle for ${from} → ${to}`))
              return
            }
            const label = document.querySelector<HTMLElement>(
              `.galaxy-planet-label[data-focal="true"][data-campaign-id="${to}"]`,
            )
            if (canvas.dataset.galaxyTravel === 'moving' && label) {
              const { planetX, planetY } = label.dataset
              if (planetX && planetY) {
                const { left, right, top, bottom } = rect.getBoundingClientRect()
                const tag = label.getBoundingClientRect()
                observations.push({
                  x: Number(planetX),
                  clear:
                    getComputedStyle(label).visibility === 'hidden' ||
                    (tag.left >= left - 1 &&
                      tag.right <= right + 1 &&
                      tag.top >= top - 1 &&
                      tag.bottom <= Math.min(bottom, Number(planetY)) + 1),
                })
              }
            }
            if (observations.length && canvas.dataset.galaxyTravel === 'idle') resolve(observations)
            else requestAnimationFrame(observe)
          }
          requestAnimationFrame(observe)
        }),
      { from: first.id, to: last.id },
    )
    await page.getByRole('button', { name: 'Previous campaign' }).press('Enter')
    await expect(canvas).toHaveAttribute('data-galaxy-travel', 'moving')
    await page.screenshot({ path: testInfo.outputPath(`travel-${width}-moving.png`) })
    const frames = await samples
    expect(frames.length).toBeGreaterThan(1)
    expect(
      frames.filter(({ clear }) => !clear),
      `${width} × ${height} travel frames`,
    ).toEqual([])
    expect(
      Math.max(...frames.map(({ x }) => x)) - Math.min(...frames.map(({ x }) => x)),
    ).toBeGreaterThan(4)
    await expect(details.getByRole('heading', { name: last.name })).toBeVisible()
    await expect(details.getByRole('link', { name: 'Enter campaign' })).toBeInViewport()
    if (width === 375) await disclosure.press('Enter')
    const arrived = page.locator('.galaxy-planet-label[data-focal="true"]')
    await expect(arrived).toBeVisible()
    // Once there, the world, its moons, and its label all sit inside the clear part of the scene.
    await expect
      .poll(() =>
        arrived.evaluate((label) => {
          const { planetX, planetY, planetExtent } = (label as HTMLElement).dataset
          const x = Number(planetX)
          const y = Number(planetY)
          const extent = Number(planetExtent)
          const scene = document.querySelector('.galaxy-orbit-space')!.getBoundingClientRect()
          const tag = label.getBoundingClientRect()
          return (
            Math.abs(x - (scene.left + scene.width / 2)) < 1 &&
            Math.abs(y - (scene.top + scene.height / 2)) < 1 &&
            x - extent >= scene.left &&
            x + extent <= scene.right &&
            y - extent >= scene.top &&
            y + extent <= scene.bottom &&
            tag.top >= scene.top - 1 &&
            tag.bottom <= y
          )
        }),
      )
      .toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`travel-${width}-settled.png`) })
  }

  await page.setViewportSize({ width: 1000, height: 720 })
  await next.press('Enter')
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'moving')
  await page.setViewportSize({ width: 920, height: 720 })
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'idle')
  await expect(details.getByRole('heading', { name: first.name })).toBeVisible()
  await expect
    .poll(() =>
      page.locator('.galaxy-planet-label[data-focal="true"]').evaluate((label) => {
        const scene = document.querySelector('.galaxy-orbit-space')!.getBoundingClientRect()
        return Math.abs(
          Number((label as HTMLElement).dataset.planetX) - (scene.left + scene.width / 2),
        )
      }),
    )
    .toBeLessThan(1)
})

test('retargets and returns immediately while ambient motion is paused', async ({ page }) => {
  const duplicateTitles: string[] = []
  page.on('console', (message) => {
    if (message.text().includes('There are two <ViewTransition name=')) {
      duplicateTitles.push(message.text())
    }
  })
  const second = { ...redHand, id: '00000000-0000-4000-8000-000000000012', name: 'Far Shore' }
  const third = { ...redHand, id: '00000000-0000-4000-8000-000000000013', name: 'Meridian' }
  await mockCampaignApi(page, [third, redHand, second])
  await signIn(page)
  const canvas = page.locator('.galaxy-backdrop canvas')
  const pause = page.getByRole('button', { name: 'Pause ambient motion' })
  const details = page.getByRole('region', { name: 'Campaign details' })
  const next = page.getByRole('button', { name: 'Next campaign' })
  await pause.press('Space')
  await expect(pause).toHaveAttribute('aria-pressed', 'true')
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'idle')
  const pausedImage = await canvas.screenshot()
  expect(await canvas.screenshot()).toEqual(pausedImage)

  await next.press('Enter')
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'moving')
  await expect(details.getByRole('heading', { name: second.name })).toBeVisible()
  await next.press('Enter')
  await expect(details.getByRole('heading', { name: third.name })).toBeVisible()
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'moving')
  await page.getByRole('button', { name: 'Previous campaign' }).press('Enter')
  await expect(details.getByRole('heading', { name: second.name })).toBeVisible()
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'moving')
  await details.getByRole('button', { name: 'Return to galaxy overview' }).press('Enter')
  await expect(details).toHaveCount(0)
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'idle')
  await expect(page.locator('.galaxy-planet-label[data-focal="true"]')).toHaveText(redHand.name)

  await page.getByRole('button', { name: second.name }).press('Enter')
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'moving')
  await pause.focus()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(pause).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Your campaigns' })).toBeFocused()
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'idle')
  await expect(details.getByRole('heading', { name: second.name })).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(pause).toHaveAttribute('aria-pressed', 'true')

  await next.press('Enter')
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'moving')
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await next.press('Enter')
  await expect(details.getByRole('heading', { name: redHand.name })).toBeVisible()
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const resumedFocal = page.locator('.galaxy-planet-label[data-focal="true"]')
  await expect(resumedFocal).toHaveText(redHand.name)
  await expect(resumedFocal).toBeVisible()
  await expect
    .poll(() =>
      resumedFocal.evaluate((label) => {
        const scene = document.querySelector('.galaxy-orbit-space')!.getBoundingClientRect()
        return Math.abs(
          Number((label as HTMLElement).dataset.planetX) - (scene.left + scene.width / 2),
        )
      }),
    )
    .toBeLessThan(1)
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'idle')

  await next.press('Enter')
  await expect(canvas).toHaveAttribute('data-galaxy-travel', 'moving')
  await details.getByRole('link', { name: 'Enter campaign' }).press('Enter')
  await expect(page.getByRole('heading', { name: second.name })).toBeVisible()
  await expect(canvas).toHaveCount(0)
  expect(duplicateTitles).toEqual([])
})

test('an owner sends and cancels invitations from the campaign workspace', async ({
  page,
}, testInfo) => {
  await mockCampaignApi(page, [redHand])
  let pending = false
  await page.route('**/rest/v1/rpc/*campaign*invitation*', async (route) => {
    const request = route.request()
    const headers = corsHeaders()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const rpc = new URL(request.url()).pathname.split('/').at(-1)
    if (rpc === 'list_campaign_outgoing_invitations') {
      return route.fulfill({
        status: 200,
        headers,
        json: pending ? [{ id: 'invite-1', recipient_username: 'player_two' }] : [],
      })
    }
    if (rpc === 'send_campaign_invitation') {
      const body = request.postDataJSON()
      if (body.p_username === 'missing_player') {
        return route.fulfill({
          status: 400,
          headers,
          json: { message: 'campaign_invitation_unknown_username' },
        })
      }
      expect(body).toEqual({ p_campaign_id: redHand.id, p_username: 'Player_Two' })
      pending = true
      return route.fulfill({ status: 200, headers, json: 'invite-1' })
    }
    if (rpc === 'cancel_campaign_invitation') {
      expect(request.postDataJSON()).toEqual({ p_invitation_id: 'invite-1' })
      pending = false
      return route.fulfill({ status: 204, headers })
    }
    return route.fallback()
  })
  await signIn(page)
  await page.goto(`/app/campaigns/${redHand.id}`)

  const guild = page.getByRole('button', { name: 'Party', exact: true })
  await guild.click()
  const trigger = page.getByRole('button', { name: 'Invite player' })
  const username = page.getByLabel('Player username')
  const send = page.getByRole('button', { name: 'Send invitation' })
  await trigger.press('Enter')
  await expect(username).toBeFocused()
  await page.getByRole('heading', { name: 'People in this campaign' }).scrollIntoViewIfNeeded()
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('workspace-invitation-form.png'),
  })
  await send.click()
  await expect(username).toHaveAttribute('aria-invalid', 'true')
  await username.fill('missing_player')
  await send.click()
  await expect(page.getByRole('alert')).toContainText('No player has that username')
  await expect(username).toHaveValue('missing_player')
  await username.fill('  Player_Two  ')
  await page.getByRole('button', { name: 'Back to camp' }).click()
  await expect(guild).toBeFocused()
  await guild.click()
  await expect(username).toHaveValue('  Player_Two  ')
  await send.click()
  await expect(page.getByText('Invitation sent.')).toBeVisible()
  await expect(trigger).toBeFocused()

  await page.getByRole('button', { name: 'Cancel invitation for player_two' }).click()
  await expect(page.getByText('Invitation cancelled.')).toBeVisible()
  await expect(page.getByText('No pending invitations.', { exact: true })).toBeVisible()
  await expect(trigger).toBeFocused()
})

test('responds to invitations on a short phone viewport without WebGL', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 568 })
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {
      apply(getContext, canvas, args) {
        return args[0] === 'webgl2' ? null : Reflect.apply(getContext, canvas, args)
      },
    })
  })
  const campaigns = await mockCampaignApi(page, [], { memberMode: true })
  let listUnavailable = true
  const pending = [
    { id: 'invite-1', campaign_name: 'The Red Hand', inviter_username: 'game_master' },
    { id: 'invite-2', campaign_name: 'Far Shore', inviter_username: 'game_master' },
  ]

  await page.route('**/rest/v1/rpc/*campaign_invitation*', async (route) => {
    const request = route.request()
    const headers = corsHeaders()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (request.url().endsWith('/list_my_campaign_invitations')) {
      return route.fulfill({
        status: listUnavailable ? 400 : 200,
        headers,
        json: listUnavailable ? { message: 'Temporary inbox error' } : pending,
      })
    }
    if (request.url().endsWith('/respond_to_campaign_invitation')) {
      const { p_invitation_id: id, p_accept: accept } = request.postDataJSON()
      if (accept) campaigns.push({ ...redHand, owner_id: ownerId })
      pending.splice(
        pending.findIndex((invitation) => invitation.id === id),
        1,
      )
      return route.fulfill({ status: 204, headers })
    }
    return route.fallback()
  })

  await signIn(page)
  const inbox = page.getByRole('button', { name: 'My invitations' })
  const panel = page.locator('#galaxy-invitations-panel')
  await expect(inbox).toHaveAttribute('aria-expanded', 'false')
  await inbox.press('Enter')
  await expect(page.getByText('Invitations could not be loaded.')).toBeVisible()
  listUnavailable = false
  await page.getByRole('button', { name: 'Try again' }).click()

  await expect(inbox).toHaveAccessibleName(/My invitations\s*\(2\)/)
  const accept = page.getByRole('button', { name: 'Accept invitation to The Red Hand' })
  await expect(accept).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: testInfo.outputPath('mobile-invitations.png') })
  await expect(page.locator('.galaxy-backdrop canvas')).toHaveCount(0)
  await accept.press('Escape')
  await expect(inbox).toBeFocused()
  await expect(inbox).toHaveAttribute('aria-expanded', 'false')
  await expect(accept).toHaveCount(0)
  await expect(panel).toHaveCSS('grid-template-rows', '0px')
  await inbox.press('Space')
  await accept.click()
  await expect(
    page.getByText('Invitation accepted. The campaign is in Your campaigns.'),
  ).toBeVisible()
  await expect(inbox).toBeFocused()
  await expect(inbox).toHaveAccessibleName(/My invitations\s*\(1\)/)
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await page.getByRole('button', { name: 'Decline invitation to Far Shore' }).click()
  await expect(page.getByText('Invitation declined.')).toBeVisible()
  await expect(page.getByText('You have no pending invitations.')).toBeVisible()
  await page.getByRole('button', { name: 'Your campaigns' }).click()
  await expect(inbox).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'The Red Hand', exact: true })).toBeInViewport()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await inbox.press('Enter')
  await expect(panel).toHaveCSS('transition-property', 'none')
  await expect(page.getByText('You have no pending invitations.')).toBeInViewport()
})

const guestId = '00000000-0000-4000-8000-000000000201'
const nameless = '00000000-0000-4000-8000-000000000202'

function ownerRoster(): RosterMember[] {
  return [
    { profile_id: accountId, role: 'owner', username: 'player_one' },
    { profile_id: guestId, role: 'member', username: 'player_two' },
    { profile_id: nameless, role: 'member', username: null },
  ]
}

function memberRoster(): RosterMember[] {
  return [
    { profile_id: ownerId, role: 'owner', username: 'game_master' },
    { profile_id: accountId, role: 'member', username: 'player_one' },
    { profile_id: guestId, role: 'member', username: 'player_two' },
  ]
}

const hasNoHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

test('a member leaves from the Party panel by keyboard and lands on the selector', async ({
  page,
}) => {
  const campaign: Campaign = { ...redHand, owner_id: ownerId }
  const campaigns = await mockCampaignApi(page, [campaign], { memberMode: true })
  const { calls, requests } = await mockMembership(page, campaigns, memberRoster())
  await openCamp(page, campaign)

  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Invite player' })).toHaveCount(0)
  const leave = page.getByRole('button', { name: 'Leave campaign', exact: true })
  await leave.focus()
  await page.keyboard.press('Enter')

  const confirm = page.getByRole('group', { name: 'Confirm leaving the campaign' })
  await expect(confirm).toContainText(
    "Leave The Red Hand? You'll lose access until the owner invites you again. Your characters are kept and leave the party.",
  )
  await expect(page.getByRole('button', { name: 'Yes, leave campaign' })).toBeFocused()
  await page.getByRole('button', { name: 'Stay in campaign' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(leave).toBeFocused()
  expect(calls).toEqual([])

  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await expect(page.getByRole('status').filter({ hasText: 'You left the campaign.' })).toBeVisible()
  await expect(page.getByText('Campaign not available')).toHaveCount(0)
  expect(calls).toEqual(['leave_campaign'])
  // Nothing refetched the campaign or roster after the leave, so no "not available" flash.
  const afterLeave = requests.slice(requests.indexOf('POST rpc/leave_campaign') + 1)
  expect(afterLeave.filter((entry) => entry.includes('rpc/get_campaign_party'))).toEqual([])
  expect(afterLeave.filter((entry) => entry.startsWith('GET campaigns'))).not.toContain(
    'GET campaigns?select=*&id=eq.' + campaign.id,
  )
})

test('the owner removes a member after one inline confirmation', async ({ page }) => {
  const campaigns = await mockCampaignApi(page, [redHand])
  const roster = ownerRoster()
  const { calls } = await mockMembership(page, campaigns, roster)
  await openCamp(page)

  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Leave campaign' })).toHaveCount(0)
  await expect(page.getByText('transfer ownership in Campaign settings first.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(2)
  await expect(
    page.getByRole('button', { name: 'Remove this player from the campaign' }),
  ).toBeVisible()

  const removeGuest = page.getByRole('button', { name: 'Remove player_two from the campaign' })
  await removeGuest.click()
  const confirm = page.getByRole('group', { name: 'Confirm removal of player_two' })
  await expect(confirm).toContainText('Remove player_two from The Red Hand?')
  await expect(page.getByRole('button', { name: 'Yes, remove' })).toBeFocused()

  // Only one confirmation is open at a time.
  await page.getByRole('button', { name: 'Remove this player from the campaign' }).click()
  await expect(page.getByRole('group', { name: /Confirm removal/ })).toHaveCount(1)
  await expect(page.getByRole('group', { name: 'Confirm removal of this player' })).toBeVisible()

  await page.getByRole('button', { name: 'Keep this player' }).click()
  await expect(
    page.getByRole('button', { name: 'Remove this player from the campaign' }),
  ).toBeFocused()
  expect(calls).toEqual([])

  await removeGuest.click()
  await page.getByRole('button', { name: 'Yes, remove' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'player_two was removed.' }),
  ).toBeVisible()
  await expect(page.getByRole('list').getByText('player_two', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Invite player' })).toBeFocused()
  expect(calls).toEqual([`remove_campaign_member ${guestId}`])
})

test('the owner transfers ownership and becomes a regular member', async ({ page }) => {
  const campaigns = await mockCampaignApi(page, [redHand])
  const roster = ownerRoster()
  const { calls } = await mockMembership(page, campaigns, roster)
  await openCamp(page)

  const settings = page.getByRole('button', { name: 'Campaign settings', exact: true })
  await settings.click()
  const transfer = page.getByRole('button', { name: 'Transfer ownership', exact: true })
  await expect(page.getByRole('heading', { name: 'Transfer ownership' })).toBeVisible()
  await expect(transfer).toBeDisabled()
  await page.getByRole('radio', { name: 'player_two' }).check()
  await expect(transfer).toBeEnabled()
  await transfer.click()

  const confirm = page.getByRole('group', { name: 'Confirm ownership transfer' })
  await expect(confirm).toContainText('Make player_two the owner of The Red Hand?')
  await page.getByRole('button', { name: 'Keep ownership' }).click()
  await expect(confirm).toHaveCount(0)
  expect(calls).toEqual([])

  await page.getByRole('radio', { name: 'player_two' }).check()
  await transfer.click()
  await page.getByRole('button', { name: 'Yes, transfer ownership' }).click()

  await expect(
    page.getByRole('status').filter({ hasText: 'Ownership transferred to player_two.' }),
  ).toBeVisible()
  await expect(settings).toHaveCount(0)
  await expect(page.locator('dialog.camp-ledger')).not.toHaveAttribute('open', '')
  expect(calls).toEqual([`transfer_campaign_ownership ${guestId}`])

  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await expect(page.getByText('Your role').locator('..')).toContainText('Member')
  await expect(page.getByText('Campaign owner').locator('..')).toContainText('player_two')
  await page.getByRole('button', { name: 'Back to camp' }).click()
  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Leave campaign' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0)
})

test('an owner with no other members is asked to invite someone before transferring', async ({
  page,
}) => {
  const campaigns = await mockCampaignApi(page, [redHand])
  await mockMembership(page, campaigns, [
    { profile_id: accountId, role: 'owner', username: 'player_one' },
  ])
  await openCamp(page)
  await page.getByRole('button', { name: 'Campaign settings', exact: true }).click()
  await expect(page.getByText('Invite a player before you transfer ownership.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Transfer ownership', exact: true })).toHaveCount(0)
})

test('membership failures show safe copy, keep the dialog open, and can be retried', async ({
  page,
}) => {
  const campaigns = await mockCampaignApi(page, [redHand])
  const roster = ownerRoster()
  let failure: MembershipFailure = { status: 500, message: 'connection reset' }
  await mockMembership(page, campaigns, roster, { fail: () => failure })
  await openCamp(page)

  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await page.getByRole('button', { name: 'Remove player_two from the campaign' }).click()
  await page.getByRole('button', { name: 'Yes, remove' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    "We couldn't remove this player. Check your connection and try again.",
  )
  await expect(page.getByRole('group', { name: 'Confirm removal of player_two' })).toBeVisible()
  await expect(page.locator('dialog.camp-ledger')).toHaveAttribute('open', '')

  failure = { status: 400, message: 'campaign_member_unavailable' }
  await page.getByRole('button', { name: 'Yes, remove' }).click()
  await expect(page.getByRole('alert')).toHaveText('That player is no longer in this campaign.')

  failure = null
  await page.getByRole('button', { name: 'Yes, remove' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'player_two was removed.' }),
  ).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)

  await page.getByRole('button', { name: 'Back to camp' }).click()
  failure = { status: 400, message: 'campaign_transfer_target_unavailable' }
  await page.getByRole('button', { name: 'Campaign settings', exact: true }).click()
  await page.getByRole('radio', { name: 'player', exact: false }).first().check()
  await page.getByRole('button', { name: 'Transfer ownership', exact: true }).click()
  await page.getByRole('button', { name: 'Yes, transfer ownership' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'That player is no longer in this campaign. Choose another member.',
  )
})

test('the camp dialog cannot close while a membership request is pending', async ({ page }) => {
  const campaign: Campaign = { ...redHand, owner_id: ownerId }
  const campaigns = await mockCampaignApi(page, [campaign], { memberMode: true })
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await mockMembership(page, campaigns, memberRoster(), { hold: () => gate })
  await openCamp(page, campaign)

  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await page.getByRole('button', { name: 'Leave campaign', exact: true }).click()
  await page.getByRole('button', { name: 'Yes, leave campaign' }).click()
  await expect(page.getByRole('button', { name: 'Leaving…' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Stay in campaign' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Back to camp' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.locator('dialog.camp-ledger')).toHaveAttribute('open', '')

  release()
  await expect(page).toHaveURL(/\/app\/campaigns$/)
})

test('closing the camp dialog cancels an open membership confirmation', async ({ page }) => {
  const campaigns = await mockCampaignApi(page, [redHand])
  await mockMembership(page, campaigns, ownerRoster())
  await openCamp(page)

  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await page.getByRole('button', { name: 'Remove player_two from the campaign' }).click()
  await expect(page.getByRole('group', { name: 'Confirm removal of player_two' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await expect(page.getByRole('group', { name: /Confirm removal/ })).toHaveCount(0)
})

const places = (page: Page) => page.getByRole('list', { name: 'Camp places' })

for (const [label, width, height] of [
  ['phone', 360, 640],
  ['tablet', 768, 1024],
  ['desktop', 1440, 900],
] as const) {
  test(`owner membership confirmations fit a ${label} without horizontal scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    const ownedCampaigns = await mockCampaignApi(page, [
      { ...redHand, name: 'The Red Hand of the Long Night' },
    ])
    await mockMembership(page, ownedCampaigns, ownerRoster())
    await openCamp(page, redHand)

    await places(page)
      .getByRole('button', { name: /^Party/ })
      .click()
    await page.getByRole('button', { name: 'Remove player_two from the campaign' }).click()
    await expect(page.getByRole('group', { name: 'Confirm removal of player_two' })).toBeVisible()
    expect(await hasNoHorizontalScroll(page)).toBe(true)
    await page.getByRole('button', { name: 'Keep player_two' }).click()
    await page.getByRole('button', { name: 'Back to camp' }).click()

    await places(page)
      .getByRole('button', { name: /^Campaign settings/ })
      .click()
    await page.getByRole('radio', { name: 'player_two' }).check()
    await page.getByRole('button', { name: 'Transfer ownership', exact: true }).click()
    await expect(page.getByRole('group', { name: 'Confirm ownership transfer' })).toBeVisible()
    expect(await hasNoHorizontalScroll(page)).toBe(true)
  })

  test(`a member's leave confirmation fits a ${label} without horizontal scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    const campaign: Campaign = {
      ...redHand,
      owner_id: ownerId,
      name: 'The Red Hand of the Long Night',
    }
    const campaigns = await mockCampaignApi(page, [campaign], { memberMode: true })
    await mockMembership(page, campaigns, memberRoster())
    await openCamp(page, campaign)

    await places(page)
      .getByRole('button', { name: /^Party/ })
      .click()
    await page.getByRole('button', { name: 'Leave campaign', exact: true }).click()
    await expect(page.getByRole('group', { name: 'Confirm leaving the campaign' })).toBeVisible()
    expect(await hasNoHorizontalScroll(page)).toBe(true)
  })
}

test('a player sets a display name from the header and the Party shows others by theirs', async ({
  page,
}) => {
  const campaigns = await mockCampaignApi(page, [redHand])
  const roster: RosterMember[] = [
    { profile_id: accountId, role: 'owner', username: 'player_one', display_name: null },
    { profile_id: guestId, role: 'member', username: 'player_two', display_name: 'Aria' },
  ]
  await mockMembership(page, campaigns, roster)
  let stored: string | null = null
  const writes: unknown[] = []
  await page.route('**/rest/v1/profiles*', async (route) => {
    const request = route.request()
    const headers = corsHeaders()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (request.method() === 'PATCH') {
      writes.push(request.postDataJSON())
      stored = (request.postDataJSON() as { display_name: string | null }).display_name
      return route.fulfill({ status: 200, headers, json: [{ display_name: stored }] })
    }
    const wantsObject = (request.headers().accept ?? '').includes('vnd.pgrst.object')
    const row = { display_name: stored }
    return route.fulfill({ status: 200, headers, json: wantsObject ? row : [row] })
  })
  await openCamp(page)

  const account = page.locator('.workspace-account')
  await expect(account.getByRole('button', { name: /player_one/ })).toBeVisible()
  await account.getByRole('button', { name: /player_one/ }).click()
  const field = page.getByLabel('Display name', { exact: true })
  await expect(field).toBeFocused()
  await field.fill('x'.repeat(41))
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Use 40 characters or fewer.')).toBeVisible()
  expect(writes).toEqual([])

  await field.fill('  The Warden  ')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(account.getByRole('button', { name: /The Warden/ })).toBeVisible()
  await expect(account.getByRole('button', { name: /The Warden/ })).toBeFocused()
  expect(writes).toEqual([{ display_name: 'The Warden' }])

  await places(page)
    .getByRole('button', { name: /^Party/ })
    .click()
  const list = page.getByRole('list').filter({ hasText: 'player_two' })
  await expect(list.getByText('Aria', { exact: false }).first()).toBeVisible()
  await expect(list.locator('.campaign-member-list__handle')).toHaveText('player_two')
  await expect(
    page.getByRole('button', { name: 'Remove Aria (player_two) from the campaign' }),
  ).toBeVisible()
})

// --- The tent: My characters --------------------------------------------------------

const tentEntry = (page: Page) => places(page).getByRole('button', { name: /^My characters/ })
const dialogFits = (page: Page) =>
  page.evaluate(() => {
    const body = document.querySelector('.camp-ledger__body')!
    return (
      body.scrollWidth <= body.clientWidth &&
      document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  })

async function openTent(page: Page, state: CharacterState = { characters: [], sheets: [] }) {
  await mockCampaignApi(page, [redHand])
  const mock = await mockCharacters(page, state)
  const camp = await openCamp(page)
  await tentEntry(page).click()
  const dialog = page.getByRole('dialog', { name: 'My characters' })
  await expect(dialog).toBeVisible()
  return { camp, dialog, state, mock }
}

function withCharacter(overrides: Parameters<typeof mockCharacter>[0] = {}): CharacterState {
  const character = mockCharacter(overrides)
  return { characters: [character], sheets: [mockSheet(character.id)] }
}

test('the tent opens from Places, pans the camera to it, and starts empty', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { camp, dialog } = await openTent(page)

  await expect(camp).toHaveAttribute('data-camp-state', 'characters')
  await expect(camp).toHaveAttribute('data-animating', 'false')
  const panel = await dialog.evaluate((el: HTMLElement) => el.offsetWidth)
  const side = await dialog.getAttribute('data-panel-side')
  expect(side).toBe('right')
  await expect(camp).toHaveAttribute(
    'data-camera-x',
    String(
      cameraToFrame({ worldX: 280, visible: 480, panelFraction: panel / 1440, panelSide: 'right' }),
    ),
  )
  await expect(dialog.getByText('You have no character in this campaign yet.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Create a character' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to camp' })).toBeFocused()
})

test('a member can open the tent too', async ({ page }) => {
  const campaign: Campaign = { ...redHand, owner_id: ownerId }
  await mockCampaignApi(page, [campaign], { memberMode: true })
  await mockCharacters(page, { characters: [], sheets: [] })
  await openCamp(page, campaign)
  await tentEntry(page).click()
  await expect(page.getByRole('dialog', { name: 'My characters' })).toBeVisible()
})

test('creating a character joins the party by default and persists across a reload', async ({
  page,
}) => {
  const { dialog, state } = await openTent(page)
  await dialog.getByRole('button', { name: 'Create a character' }).click()
  const form = dialog.getByRole('form', { name: 'Create a character' })
  await expect(form.getByLabel('Join the party')).toBeChecked()

  // Validation runs on submit and focuses the first problem.
  await form.getByRole('button', { name: 'Create character' }).click()
  await expect(form.getByLabel('Name', { exact: true })).toBeFocused()
  await expect(form.getByText('Enter a name of up to 80 characters.')).toBeVisible()

  await form.getByLabel('Name', { exact: true }).fill('Brand')
  await form.getByLabel(/Species/).fill('Elf')
  await form.getByLabel(/Class/).fill('Fighter')
  await form.getByLabel('Level').fill('3')
  await form.getByRole('button', { name: 'Create character' }).click()

  await expect(dialog.getByText('Character created.')).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Brand' })).toBeFocused()
  const standing = dialog.getByRole('list', { name: 'Character standing' })
  await expect(standing.getByText('Active')).toBeVisible()
  await expect(standing.getByText('In the party')).toBeVisible()
  expect(state.characters).toHaveLength(1)
  expect(state.characters[0]).toMatchObject({ in_party: true, status: 'active', level: 3 })

  await page.reload()
  await expect(page.locator('.camp')).toHaveAttribute('data-camp-ready', 'true')
  await tentEntry(page).click()
  await expect(
    page.getByRole('dialog', { name: 'My characters' }).getByRole('heading', { name: 'Brand' }),
  ).toBeVisible()
})

test('unticking "Join the party" creates a character outside the party', async ({ page }) => {
  const { dialog, state } = await openTent(page)
  await dialog.getByRole('button', { name: 'Create a character' }).click()
  await dialog.getByLabel('Name', { exact: true }).fill('Wren')
  await dialog.getByLabel('Join the party').uncheck()
  await dialog.getByRole('button', { name: 'Create character' }).click()
  await expect(
    dialog.getByRole('list', { name: 'Character standing' }).getByText('Not in the party'),
  ).toBeVisible()
  expect(state.characters[0].in_party).toBe(false)
})

test('edits details, vitals, and the sheet, and keeps them after a reload', async ({ page }) => {
  const { dialog, state } = await openTent(page, withCharacter())
  await dialog.getByRole('button', { name: 'Open Brand' }).click()

  // The display only edits HP in place; everything else is in the one editor.
  await expect(dialog.getByLabel('Strength score')).toHaveCount(0)
  await expect(dialog.getByLabel('Maximum HP')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Edit character' }).click()
  await dialog.getByLabel('Name', { exact: true }).fill('Brand the Bold')
  await dialog.getByLabel('Level').fill('5')
  await dialog.getByRole('button', { name: 'Save details' }).click()
  await expect(dialog.getByText('Character saved.')).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Edit Brand the Bold' })).toBeVisible()

  await dialog.getByLabel('Maximum HP').fill('40')
  await dialog.getByLabel('Armor class').fill('17')
  await dialog.getByRole('button', { name: 'Save stats' }).click()
  await expect(dialog.getByText('Stats saved.')).toBeVisible()

  await dialog.getByLabel('Strength score').fill('18')
  await dialog.getByLabel('Strength saving throw proficiency').check()
  await dialog.getByLabel('Athletics proficiency').selectOption('proficient')
  await dialog.getByRole('button', { name: 'Add attack' }).click()
  await dialog.getByLabel('Attack 1 name').fill('Greataxe')
  await dialog.getByLabel('Features and traits').fill('Rage')
  await dialog.getByRole('button', { name: 'Save sheet' }).click()
  await expect(dialog.getByText('Character sheet saved.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Back to character sheet' }).click()
  await dialog.getByLabel('Current HP').fill('25')
  await dialog.getByRole('button', { name: 'Save stats' }).click()
  await expect(dialog.getByText('Stats saved.').last()).toBeVisible()

  expect(state.characters[0]).toMatchObject({ name: 'Brand the Bold', level: 5 })
  expect(state.sheets[0]).toMatchObject({ max_hp: 40, current_hp: 25, armor_class: 17 })
  expect(state.sheets[0].sheet).toMatchObject({
    abilities: { str: 18 },
    saving_throws: ['str'],
    skills: { athletics: 'proficient' },
    features: 'Rage',
  })

  await page.reload()
  await expect(page.locator('.camp')).toHaveAttribute('data-camp-ready', 'true')
  await tentEntry(page).click()
  const reopened = page.getByRole('dialog', { name: 'My characters' })
  await reopened.getByRole('button', { name: 'Open Brand the Bold' }).click()
  await expect(reopened.getByLabel('Current HP')).toHaveValue('25')
  await reopened.getByRole('button', { name: 'Edit character' }).click()
  await expect(reopened.getByLabel('Strength score')).toHaveValue('18')
  await expect(reopened.getByLabel('Attack 1 name')).toHaveValue('Greataxe')
  await expect(reopened.getByLabel('Features and traits')).toHaveValue('Rage')
})

test('a sheet saved on another device is not overwritten', async ({ page }) => {
  const { dialog, state } = await openTent(page, withCharacter())
  await dialog.getByRole('button', { name: 'Open Brand' }).click()
  await dialog.getByRole('button', { name: 'Edit character' }).click()
  await dialog.getByLabel('Features and traits').fill('My edit')
  // Another device saves first.
  state.sheets[0].sheet = { version: 1, features: 'Theirs' }
  state.sheets[0].updated_at = '2026-11-13T23:59:59.000Z'
  await dialog.getByRole('button', { name: 'Save sheet' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'This sheet changed on another device. Reload it to see the latest version.',
  )
  expect(state.sheets[0].sheet).toEqual({ version: 1, features: 'Theirs' })
  await expect(dialog.getByLabel('Features and traits')).toHaveValue('My edit')

  await dialog.getByRole('button', { name: 'Discard changes' }).click()
  await expect(dialog.getByLabel('Features and traits')).toHaveValue('Theirs')
})

test('retiring moves a character to Previous characters and allows a replacement', async ({
  page,
}) => {
  const { dialog, state } = await openTent(page, withCharacter())
  await dialog.getByRole('button', { name: 'Open Brand' }).click()
  await dialog.getByRole('button', { name: 'Retire', exact: true }).click()
  await expect(dialog.getByRole('group', { name: 'Confirm: Retire' })).toContainText(
    "Retire Brand? They'll leave the party",
  )
  await dialog.getByRole('button', { name: 'Yes, retire' }).click()
  await expect(dialog.getByText('Brand retired.')).toBeVisible()
  expect(state.characters[0]).toMatchObject({ status: 'retired', in_party: false })

  await dialog.getByRole('button', { name: 'Back to my characters' }).click()
  const history = dialog.getByRole('region', { name: 'Previous characters' })
  await expect(history.getByText('Brand')).toBeVisible()
  await expect(history.getByText(/^Retired /)).toBeVisible()

  await dialog.getByRole('button', { name: 'Create a character' }).click()
  await dialog.getByLabel('Name', { exact: true }).fill('Second Wind')
  await dialog.getByRole('button', { name: 'Create character' }).click()
  await expect(dialog.getByRole('heading', { name: 'Second Wind' })).toBeVisible()

  // The old character cannot come back while the replacement is active.
  await dialog.getByRole('button', { name: 'Open Brand' }).click()
  await dialog.getByRole('button', { name: 'Return to active' }).click()
  await dialog.getByRole('button', { name: 'Yes, return to active' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'You already have an active character here. Retire them or mark them deceased first.',
  )
})

test('a character marked deceased can be returned to active when the slot is free', async ({
  page,
}) => {
  const { dialog, state } = await openTent(page, withCharacter())
  await dialog.getByRole('button', { name: 'Open Brand' }).click()
  await dialog.getByRole('button', { name: 'Mark deceased' }).click()
  await dialog.getByRole('button', { name: 'Yes, mark deceased' }).click()
  await expect(dialog.getByText('Brand is marked deceased.')).toBeVisible()
  expect(state.characters[0].status).toBe('deceased')

  await dialog.getByRole('button', { name: 'Return to active' }).click()
  await dialog.getByRole('button', { name: 'Yes, return to active' }).click()
  await expect(dialog.getByText('Brand is active again.')).toBeVisible()
  expect(state.characters[0]).toMatchObject({ status: 'active', in_party: false })
})

test('joining, leaving, and sharing apply immediately', async ({ page }) => {
  const { dialog, state } = await openTent(page, withCharacter({ in_party: false }))
  await dialog.getByRole('button', { name: 'Open Brand' }).click()

  await dialog.getByRole('button', { name: 'Join the party' }).click()
  await expect(dialog.getByText('Brand joined the party.')).toBeVisible()
  expect(state.characters[0].in_party).toBe(true)
  await dialog.getByRole('button', { name: 'Leave the party' }).click()
  await expect(dialog.getByText('Brand left the party.')).toBeVisible()

  const share = dialog.getByLabel('Share sheet with campaign members')
  await share.click()
  await expect(share).toBeChecked()
  await expect(dialog.getByText("Brand's sheet is shared with campaign members.")).toBeVisible()
  expect(state.characters[0].sheet_visibility).toBe('campaign')
  await share.click()
  await expect(share).not.toBeChecked()
  await expect(dialog.getByText("Brand's sheet is private.")).toBeVisible()
  expect(state.characters[0].sheet_visibility).toBe('private')
})

test('deleting needs a confirmation, can be cancelled, and removes the character', async ({
  page,
}) => {
  const { dialog, state } = await openTent(page, withCharacter())
  await dialog.getByRole('button', { name: 'Open Brand' }).click()
  await dialog.getByRole('button', { name: 'Delete character' }).click()
  await expect(dialog.getByRole('group', { name: 'Confirm character deletion' })).toContainText(
    "Delete Brand permanently? Their sheet will be removed and this can't be undone.",
  )
  await expect(dialog.getByRole('button', { name: 'Yes, delete character' })).toBeFocused()

  await dialog.getByRole('button', { name: 'Keep Brand' }).click()
  await expect(dialog.getByRole('button', { name: 'Delete character' })).toBeFocused()
  expect(state.characters).toHaveLength(1)

  await dialog.getByRole('button', { name: 'Delete character' }).click()
  await dialog.getByRole('button', { name: 'Yes, delete character' }).click()
  await expect(dialog.getByText('Character deleted.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Create a character' })).toBeVisible()
  expect(state.characters).toHaveLength(0)
  expect(state.sheets).toHaveLength(0)
})

test('failures show safe copy and retry works', async ({ page }) => {
  await mockCampaignApi(page, [redHand])
  const state: CharacterState = { characters: [], sheets: [] }
  let listFails = true
  let createFails: CharacterFailureOrNull = { status: 500, message: 'boom' }
  type CharacterFailureOrNull = { status: number; message: string } | null
  await mockCharacters(page, state, {
    fail: (target) => {
      if (target === 'characters' && listFails) return { status: 500, message: 'boom' }
      if (target === 'create_character') return createFails
      return null
    },
  })
  await openCamp(page)
  await tentEntry(page).click()
  const dialog = page.getByRole('dialog', { name: 'My characters' })
  await expect(dialog.getByRole('alert')).toContainText('Your characters could not be loaded.')

  listFails = false
  await dialog.getByRole('button', { name: 'Try again' }).click()
  await dialog.getByRole('button', { name: 'Create a character' }).click()
  await dialog.getByLabel('Name', { exact: true }).fill('Brand')
  await dialog.getByRole('button', { name: 'Create character' }).click()
  await expect(dialog.getByRole('alert')).toHaveText(
    "We couldn't create this character. Check your connection and try again.",
  )
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Brand')

  createFails = { status: 400, message: 'character_campaign_unavailable' }
  await dialog.getByRole('button', { name: 'Create character' }).click()
  await expect(dialog.getByRole('alert')).toHaveText("You're no longer a member of this campaign.")

  createFails = null
  await dialog.getByRole('button', { name: 'Create character' }).click()
  await expect(dialog.getByText('Character created.')).toBeVisible()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
})

test('the tent stays open while a character change is pending', async ({ page }) => {
  await mockCampaignApi(page, [redHand])
  const state = withCharacter()
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await mockCharacters(page, state, { hold: () => held })
  await openCamp(page)
  await tentEntry(page).click()
  const dialog = page.getByRole('dialog', { name: 'My characters' })
  await dialog.getByRole('button', { name: 'Open Brand' }).click()

  await dialog.getByRole('button', { name: 'Leave the party' }).click()
  await expect(dialog.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Back to camp' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()

  release()
  await expect(dialog.getByText('Brand left the party.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to camp' })).toBeEnabled()
})

test('closing the tent forgets an open form and returns to the list on reopening', async ({
  page,
}) => {
  const { dialog } = await openTent(page)
  await dialog.getByRole('button', { name: 'Create a character' }).click()
  await dialog.getByLabel('Name', { exact: true }).fill('Draft')
  await page.getByRole('button', { name: 'Back to camp' }).click()
  // A filled-in form asks before it is lost.
  const prompt = page.getByRole('alertdialog', { name: 'Leave without saving?' })
  await expect(prompt).toBeVisible()
  await prompt.getByRole('button', { name: 'Keep editing' }).click()
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Draft')
  await page.getByRole('button', { name: 'Back to camp' }).click()
  await page.getByRole('button', { name: 'Discard and leave' }).click()
  await expect(dialog).toBeHidden()
  await expect(tentEntry(page)).toBeFocused()

  await tentEntry(page).click()
  await expect(dialog.getByRole('button', { name: 'Create a character' })).toBeVisible()
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveCount(0)
})

test('unsaved sheet edits are guarded when going back or closing', async ({ page }) => {
  const { dialog } = await openTent(page, withCharacter())
  await dialog.getByRole('button', { name: 'Open Brand' }).click()
  await dialog.getByRole('button', { name: 'Edit character' }).click()
  await dialog.getByLabel('Spells', { exact: true }).fill('Light')
  await expect(dialog.getByText('Unsaved sheet changes')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Save sheet' })).toBeEnabled()

  await dialog.getByRole('button', { name: 'Back to character sheet' }).click()
  const prompt = page.getByRole('alertdialog', { name: 'Leave without saving?' })
  await prompt.getByRole('button', { name: 'Keep editing' }).click()
  await expect(dialog.getByLabel('Spells', { exact: true })).toHaveValue('Light')

  // Escape inside the question means "keep editing", not "close the tent".
  await page.getByRole('button', { name: 'Back to camp' }).click()
  await expect(prompt).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(prompt).toBeHidden()
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Save sheet' }).click()
  await expect(dialog.getByText('Character sheet saved.')).toBeVisible()
  await expect(dialog.getByText('All changes saved')).toBeVisible()
  await dialog.getByRole('button', { name: 'Back to character sheet' }).click()
  await dialog.getByRole('button', { name: 'Back to my characters' }).click()
  await expect(dialog.getByRole('button', { name: 'Open Brand' })).toBeVisible()
})

test('character toasts fade on their own and can be dismissed', async ({ page }) => {
  const { dialog } = await openTent(page, withCharacter({ in_party: false }))
  await dialog.getByRole('button', { name: 'Open Brand' }).click()
  await dialog.getByRole('button', { name: 'Join the party' }).click()
  const toast = dialog.getByText('Brand joined the party.')
  await expect(toast).toBeVisible()
  await dialog.getByRole('button', { name: 'Dismiss notification' }).click()
  await expect(toast).toHaveCount(0)
})

for (const [width, height] of [
  [375, 812],
  [768, 1024],
  [1440, 900],
] as const) {
  test(`the character folio fits at ${width}px and keeps Save stats in reach`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    const { dialog } = await openTent(page, withCharacter())
    await dialog.getByRole('button', { name: 'Open Brand' }).click()
    await expect(dialog.getByRole('heading', { name: 'Vitals' })).toBeVisible()
    expect(await dialogFits(page)).toBe(true)

    // The save bar stays on screen however far the sheet is scrolled.
    await dialog.locator('.camp-ledger__body').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    const save = dialog.getByRole('button', { name: 'Save stats' })
    await expect(save).toBeInViewport()
    expect(await save.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(
      40,
    )
    await expect(save).toBeDisabled()
    await dialog.getByLabel('Current HP').fill('35')
    await expect(save).toBeEnabled()
    expect(await dialogFits(page)).toBe(true)
  })
}

test('a portrait can be uploaded, replaced, and removed, and shows on the list', async ({
  page,
}) => {
  const { dialog, state, mock } = await openTent(page, withCharacter())
  await dialog.getByRole('button', { name: 'Open Brand' }).click()
  await dialog.getByRole('button', { name: 'Edit character' }).click()
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )

  // A file the bucket would refuse is stopped before it is sent.
  await dialog
    .getByLabel('Portrait file')
    .setInputFiles({ name: 'a.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') })
  await expect(dialog.getByRole('alert')).toContainText('Choose a PNG, JPEG, or WebP picture.')
  expect(mock.objects.size).toBe(0)

  await dialog
    .getByLabel('Portrait file')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png })
  await expect(dialog.getByText('Portrait updated.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Change picture' })).toBeVisible()
  expect(state.characters[0].portrait_path).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/)
  const first = state.characters[0].portrait_path!
  await expect(dialog.locator('.portrait-editor img')).toBeVisible()

  // Replacing swaps the file and deletes the old one.
  await dialog
    .getByLabel('Portrait file')
    .setInputFiles({ name: 'me2.png', mimeType: 'image/png', buffer: png })
  await expect(async () => {
    expect(state.characters[0].portrait_path).not.toBe(first)
  }).toPass()
  expect(mock.objects.has(first)).toBe(false)
  expect(mock.objects.size).toBe(1)

  await dialog.getByRole('button', { name: 'Back to character sheet' }).click()
  await dialog.getByRole('button', { name: 'Back to my characters' }).click()
  await expect(dialog.locator('.tent-card img')).toBeVisible()

  await dialog.getByRole('button', { name: 'Open Brand' }).click()
  await dialog.getByRole('button', { name: 'Edit character' }).click()
  await dialog.getByRole('button', { name: 'Remove picture' }).click()
  await expect(dialog.getByText('Portrait removed.')).toBeVisible()
  expect(state.characters[0].portrait_path).toBeNull()
  expect(mock.objects.size).toBe(0)
  await expect(dialog.getByRole('button', { name: 'Upload picture' })).toBeVisible()
})

test('the tent works by keyboard alone', async ({ page }) => {
  await mockCampaignApi(page, [redHand])
  await mockCharacters(page, { characters: [], sheets: [] })
  await openCamp(page)
  await tentEntry(page).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Back to camp' })).toBeFocused()

  await page.getByRole('button', { name: 'Create a character' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused()
  await page.keyboard.type('Keyboard Kay')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Keyboard Kay' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(tentEntry(page)).toBeFocused()
})

for (const [label, width, height] of [
  ['phone', 360, 640],
  ['tablet', 768, 1024],
  ['desktop', 1440, 900],
] as const) {
  test(`the tent, its sheet, and its confirmations fit a ${label} without horizontal scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    const long = 'The Unfathomably Long-Named Wanderer of the Shattered Coast'
    const { dialog } = await openTent(page, withCharacter({ name: long, species: 'Half-Elf' }))
    expect(await dialogFits(page)).toBe(true)

    await dialog.getByRole('button', { name: `Open ${long}` }).click()
    await expect(dialog.getByRole('heading', { name: 'Vitals' })).toBeVisible()
    expect(await dialogFits(page)).toBe(true)

    await dialog.getByRole('button', { name: 'Edit character' }).click()
    expect(await dialogFits(page)).toBe(true)
    await dialog.getByRole('button', { name: 'Add attack' }).click()
    await dialog.getByLabel('Attack 1 notes').fill('x'.repeat(80))
    expect(await dialogFits(page)).toBe(true)
    await dialog.getByRole('button', { name: 'Back to character sheet' }).click()
    await page.getByRole('button', { name: 'Discard and go back' }).click()

    await dialog.getByRole('button', { name: 'Delete character' }).click()
    await expect(dialog.getByRole('group', { name: 'Confirm character deletion' })).toBeVisible()
    expect(await dialogFits(page)).toBe(true)
    await dialog.getByRole('button', { name: new RegExp(`^Keep `) }).click()
  })
}

// --- The Party panel and characters --------------------------------------------------

async function openParty(page: Page, characters: CharacterState) {
  const campaign: Campaign = { ...redHand, owner_id: ownerId }
  const campaigns = await mockCampaignApi(page, [campaign], { memberMode: true })
  await mockMembership(page, campaigns, memberRoster())
  await mockCharacters(page, characters)
  await openCamp(page, campaign)
  await places(page)
    .getByRole('button', { name: /^Party/ })
    .click()
  const dialog = page.getByRole('dialog', { name: 'People in this campaign' })
  await expect(dialog).toBeVisible()
  return dialog
}

function partyCharacters(): CharacterState {
  const mine = mockCharacter({ owner_id: accountId, name: 'Brand', sheet_visibility: 'private' })
  const shared = mockCharacter({
    owner_id: guestId,
    name: 'Sorrel',
    species: 'Gnome',
    class_name: 'Wizard',
    level: 5,
    sheet_visibility: 'campaign',
  })
  const hidden = mockCharacter({
    owner_id: ownerId,
    name: 'Dray',
    sheet_visibility: 'private',
  })
  const retired = mockCharacter({
    owner_id: guestId,
    name: 'Old Sorrel',
    status: 'retired',
    in_party: false,
  })
  return {
    characters: [mine, shared, hidden, retired],
    sheets: [mine, shared, hidden, retired].map((character) =>
      mockSheet(character.id, { max_hp: 20, current_hp: 11 }),
    ),
  }
}

test("the Party panel shows each member's in-party character and who has one", async ({ page }) => {
  const state = partyCharacters()
  state.characters[2].in_party = false
  const dialog = await openParty(page, state)

  await expect(dialog.getByText('2 of 3 members have a character in the party.')).toBeVisible()
  const rows = dialog.getByRole('listitem')
  await expect(rows.filter({ hasText: 'player_one' })).toContainText('Brand')
  await expect(rows.filter({ hasText: 'player_two' })).toContainText('Sorrel')
  await expect(rows.filter({ hasText: 'player_two' })).toContainText('Level 5 Gnome Wizard')
  // A retired character and an out-of-party one are history, not party.
  await expect(dialog.getByText('Old Sorrel')).toHaveCount(0)
  await expect(rows.filter({ hasText: 'game_master' })).toContainText('No character in the party')
  expect(await dialogFits(page)).toBe(true)
})

test('"View sheet" shows only for own and shared sheets and opens them read-only', async ({
  page,
}) => {
  const dialog = await openParty(page, partyCharacters())

  // Dray's sheet is private: no button and no placeholder.
  await expect(dialog.getByRole('button', { name: /View Dray/ })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /^View .+ sheet$/ })).toHaveCount(2)

  const trigger = dialog.getByRole('button', { name: "View Sorrel's sheet" })
  await trigger.click()
  await expect(dialog.getByRole('heading', { name: 'Sorrel' })).toBeFocused()
  await expect(dialog.getByRole('heading', { name: 'Vitals' })).toBeVisible()
  await expect(dialog.getByText('Hit points')).toBeVisible()
  await expect(dialog.getByLabel('Current HP')).toHaveCount(0)
  await expect(dialog.locator('.character-sheet')).toHaveAttribute('data-read-only', 'true')
  await expect(dialog.getByRole('button', { name: /^Save/ })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Edit character' })).toHaveCount(0)
  await expect(page.locator('.camp-ledger')).toHaveAttribute('data-variant', 'folio')
  expect(await dialogFits(page)).toBe(true)

  await dialog.getByRole('button', { name: 'Back to party' }).click()
  await expect(trigger).toBeFocused()
  await expect(page.locator('.camp-ledger')).toHaveAttribute('data-variant', 'journal')
})

test('the viewer can open their own sheet from the Party panel', async ({ page }) => {
  const dialog = await openParty(page, partyCharacters())
  await dialog.getByRole('button', { name: "View Brand's sheet" }).click()
  await expect(dialog.getByRole('heading', { name: 'Vitals' })).toBeVisible()
})

test('an unshared sheet loses its View sheet button', async ({ page }) => {
  const state = partyCharacters()
  const dialog = await openParty(page, state)
  await dialog.getByRole('button', { name: "View Sorrel's sheet" }).click()
  await expect(dialog.getByRole('heading', { name: 'Vitals' })).toBeVisible()

  // The owner unshares it; the next refetch of the list no longer offers the sheet.
  state.characters[1].sheet_visibility = 'private'
  await page.reload()
  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await expect(dialog.getByRole('button', { name: "View Sorrel's sheet" })).toHaveCount(0)
})

test('closing the dialog returns the Party panel to its list', async ({ page }) => {
  const dialog = await openParty(page, partyCharacters())
  await dialog.getByRole('button', { name: "View Sorrel's sheet" }).click()
  await page.getByRole('button', { name: 'Back to camp' }).click()
  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await expect(dialog.getByRole('button', { name: "View Sorrel's sheet" })).toBeVisible()
})

test('the Party panel remove and leave confirmations say characters are kept', async ({ page }) => {
  const campaign = redHand
  const campaigns = await mockCampaignApi(page, [campaign])
  await mockMembership(page, campaigns, memberRoster())
  await mockCharacters(page, partyCharacters())
  await openCamp(page, campaign)
  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await page.getByRole('button', { name: 'Remove player_two from the campaign' }).click()
  await expect(page.getByRole('group', { name: 'Confirm removal of player_two' })).toContainText(
    "They'll lose access until you invite them again. Their characters are kept and leave the party.",
  )
})

for (const [label, width, height] of [
  ['phone', 360, 640],
  ['desktop', 1440, 900],
] as const) {
  test(`the Party panel and a shared sheet fit a ${label} without horizontal scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    const dialog = await openParty(page, partyCharacters())
    expect(await dialogFits(page)).toBe(true)
    await dialog.getByRole('button', { name: "View Sorrel's sheet" }).click()
    await expect(dialog.getByRole('heading', { name: 'Vitals' })).toBeVisible()
    expect(await dialogFits(page)).toBe(true)
  })
}

test('Overview, Party, and Campaign settings all wear the journal, with a titled page', async ({
  page,
}) => {
  await mockCampaignApi(page, [redHand])
  await mockCharacters(page, { characters: [], sheets: [] })
  await openCamp(page)
  const ledger = page.locator('.camp-ledger')
  for (const [entry, heading, place] of [
    [/^Overview/, 'The Red Hand', 'Campfire'],
    [/^Party/, 'People in this campaign', 'Bedroll circle'],
    [/^Campaign settings/, 'Campaign settings', 'Steward’s wagon'],
  ] as const) {
    await places(page).getByRole('button', { name: entry }).click()
    await expect(ledger).toHaveAttribute('data-variant', 'journal')
    const dialog = page.getByRole('dialog', { name: heading })
    await expect(dialog.locator('.camp-panel__eyebrow:visible')).toHaveText(place)
    await expect(dialog.getByRole('heading', { level: 2, name: heading })).toBeVisible()
    await page.getByRole('button', { name: 'Back to camp' }).click()
    await expect(ledger).not.toHaveAttribute('open', '')
  }
})

// --- Closing by clicking outside the journal ----------------------------------------

/** A point on the dimmed scene beside the open journal. */
async function outsidePoint(page: Page) {
  const box = (await page.locator('.camp-ledger').boundingBox())!
  const viewport = page.viewportSize()!
  const x = box.x > 120 ? box.x / 2 : (box.x + box.width + viewport.width) / 2
  return { x, y: viewport.height / 2 }
}

test('clicking the scene beside any journal page closes it and returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockCampaignApi(page, [redHand])
  await mockCharacters(page, { characters: [], sheets: [] })
  await openCamp(page)
  const ledger = page.locator('.camp-ledger')
  for (const entry of [/^Overview/, /^Party/, /^My characters/, /^Campaign settings/]) {
    const opener = places(page).getByRole('button', { name: entry })
    await opener.click()
    await expect(ledger).toHaveAttribute('open', '')
    const point = await outsidePoint(page)
    await page.mouse.click(point.x, point.y)
    await expect(ledger).not.toHaveAttribute('open', '')
    await expect(opener).toBeFocused()
  }
})

test('clicks and drags that start or end inside the journal keep it open', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockCampaignApi(page, [redHand])
  await mockCharacters(page, { characters: [], sheets: [] })
  await openCamp(page)
  await places(page)
    .getByRole('button', { name: /^Overview/ })
    .click()
  const ledger = page.locator('.camp-ledger')
  const box = (await ledger.boundingBox())!
  const outside = await outsidePoint(page)

  // A click on the page itself.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(ledger).toHaveAttribute('open', '')
  // Selecting text and releasing beyond the edge.
  await page.mouse.move(box.x + 40, box.y + 150)
  await page.mouse.down()
  await page.mouse.move(outside.x, outside.y, { steps: 5 })
  await page.mouse.up()
  await expect(ledger).toHaveAttribute('open', '')
  // Pressing outside and releasing inside.
  await page.mouse.move(outside.x, outside.y)
  await page.mouse.down()
  await page.mouse.move(box.x + 40, box.y + 150, { steps: 5 })
  await page.mouse.up()
  await expect(ledger).toHaveAttribute('open', '')
})

test('clicking outside asks about unsaved sheet edits instead of discarding them', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { dialog } = await openTent(page, withCharacter())
  await dialog.getByRole('button', { name: 'Open Brand' }).click()
  await dialog.getByRole('button', { name: 'Edit character' }).click()
  await dialog.getByLabel('Spells', { exact: true }).fill('Light')
  await expect(dialog.getByText('Unsaved sheet changes')).toBeVisible()

  const point = await outsidePoint(page)
  // The journal learns of the edit a frame after the sheet shows it.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  await page.mouse.click(point.x, point.y)
  const prompt = page.getByRole('alertdialog', { name: 'Leave without saving?' })
  await expect(prompt).toBeVisible()
  await prompt.getByRole('button', { name: 'Keep editing' }).click()
  await expect(dialog.getByLabel('Spells', { exact: true })).toHaveValue('Light')
})

test('clicking outside does nothing while a character change is pending', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockCampaignApi(page, [redHand])
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await mockCharacters(page, withCharacter({ in_party: false }), { hold: () => held })
  await openCamp(page)
  await places(page)
    .getByRole('button', { name: /^My characters/ })
    .click()
  const dialog = page.getByRole('dialog', { name: 'My characters' })
  await dialog.getByRole('button', { name: 'Open Brand' }).click()
  await dialog.getByRole('button', { name: 'Join the party' }).click()
  await expect(page.getByRole('button', { name: 'Back to camp' })).toBeDisabled()

  const point = await outsidePoint(page)
  await page.mouse.click(point.x, point.y)
  await expect(page.locator('.camp-ledger')).toHaveAttribute('open', '')
  release()
  await expect(dialog.getByText('Brand joined the party.')).toBeVisible()
})

test("camp name plates show each player's active character, else the player", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const campaigns = await mockCampaignApi(page, [redHand])
  const guest = '00000000-0000-4000-8000-000000000201'
  const roster: RosterMember[] = [
    { profile_id: accountId, role: 'owner', username: 'game_master' },
    { profile_id: guest, role: 'member', username: 'player_two' },
    { profile_id: nameless, role: 'member', username: 'player_three' },
  ]
  await mockMembership(page, campaigns, roster)
  const mine = mockCharacter({ owner_id: accountId, name: 'Brand' })
  // A retired character does not name its player's seat; an active one does, in or out of the party.
  const retired = mockCharacter({
    owner_id: guest,
    name: 'Old Sorrel',
    status: 'retired',
    in_party: false,
  })
  const resting = mockCharacter({ owner_id: nameless, name: 'Wren', in_party: false })
  await mockCharacters(page, { characters: [mine, retired, resting], sheets: [] })
  await openCamp(page)

  const names = page.locator('.camp-names .camp-name')
  await expect(names).toHaveText(['Brand', 'player_two', 'Wren'])
})
