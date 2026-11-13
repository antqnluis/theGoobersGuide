import { expect, type Page, test } from '@playwright/test'
import { adventurerAppearance } from '../src/features/campaigns/camp/adventurerAppearance.ts'
import { cameraToFrame, restCameraX } from '../src/features/campaigns/camp/campCamera.ts'
import { seatParty, type RosterMember } from '../src/features/campaigns/camp/campLayout.ts'
import { campRamps } from '../src/features/campaigns/camp/campPalette.ts'
import { masterBiome, masterFixed } from '../src/features/campaigns/camp/masterPalette.ts'
import { planetAppearance } from '../src/features/campaigns/planetModel.ts'

const accountId = '00000000-0000-4000-8000-000000000001'
const ownerId = '00000000-0000-4000-8000-000000000002'
const accountEmail = 'player@example.com'
const now = new Date().toISOString()
const authSession = {
  access_token: 'mock-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mock-refresh-token',
  user: {
    id: accountId,
    aud: 'authenticated',
    role: 'authenticated',
    email: accountEmail,
    email_confirmed_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { username: 'player_one' },
    created_at: now,
    updated_at: now,
  },
}

type Campaign = {
  id: string
  owner_id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

const redHand: Campaign = {
  id: '00000000-0000-4000-8000-000000000011',
  owner_id: accountId,
  name: 'The Red Hand',
  description: 'A quiet town has begun to forget its own history.',
  created_at: now,
  updated_at: now,
}

function corsHeaders() {
  return {
    'access-control-allow-origin': 'http://127.0.0.1:4173',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': 'content-range',
    'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
  }
}

async function signIn(page: Page) {
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: corsHeaders(),
      contentType: 'application/json',
      body: JSON.stringify(authSession),
    })
  })

  // The sign-in arrival has its own spec; here it crossfades so the galaxy is ready at once.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/login')
  const signInForm = page.getByRole('region', { name: 'Sign in' })
  await signInForm.getByLabel('Username or email').fill(accountEmail)
  await signInForm.getByLabel('Password', { exact: true }).fill('adventure1')
  await signInForm.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await expect(page.locator('.arrival-layer')).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
}

async function mockCampaignApi(
  page: Page,
  initialCampaigns: Campaign[],
  options: {
    /** Holds the campaign list: true for 500 ms, or until the given promise settles. */
    delayList?: boolean | Promise<void>
    memberMode?: boolean
    shouldFailList?: () => boolean
    hideFromList?: () => boolean
    memberCount?: (campaignId: string) => Promise<number | null>
  } = {},
) {
  const campaigns = initialCampaigns.map((campaign) => ({ ...campaign }))
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders() })
      return
    }

    if (path.endsWith('/rest/v1/campaigns') && method === 'GET') {
      if (!url.searchParams.has('id') && options.delayList) {
        await (options.delayList === true
          ? new Promise((resolve) => setTimeout(resolve, 500))
          : options.delayList)
      }
      if (!url.searchParams.has('id') && options.shouldFailList?.()) {
        await route.fulfill({
          status: 400,
          headers: corsHeaders(),
          json: { message: 'temporary test failure' },
        })
        return
      }

      const idFilter = url.searchParams.get('id')
      const result = idFilter?.startsWith('eq.')
        ? campaigns.filter((campaign) => campaign.id === idFilter.slice(3))
        : options.hideFromList?.()
          ? []
          : campaigns
      await route.fulfill({ status: 200, headers: corsHeaders(), json: result })
      return
    }

    if (path.endsWith('/rest/v1/campaign_members') && method === 'HEAD') {
      const id = url.searchParams.get('campaign_id')?.slice(3) ?? ''
      const count = options.memberCount
        ? await options.memberCount(id)
        : campaigns.some((campaign) => campaign.id === id)
          ? options.memberMode
            ? 2
            : 1
          : 0
      await route.fulfill({
        status: count === null ? 400 : 200,
        headers: {
          ...corsHeaders(),
          ...(count === null ? {} : { 'content-range': `*/${count}` }),
        },
      })
      return
    }

    if (path.endsWith('/rest/v1/campaign_members') && method === 'GET') {
      const result = campaigns.flatMap((campaign) => {
        if (options.memberMode) {
          return campaign.owner_id === ownerId
            ? [{ campaign_id: campaign.id, profile_id: accountId, role: 'member' }]
            : []
        }
        return campaign.owner_id === accountId
          ? [{ campaign_id: campaign.id, profile_id: accountId, role: 'owner' }]
          : []
      })
      await route.fulfill({ status: 200, headers: corsHeaders(), json: result })
      return
    }

    if (
      method === 'POST' &&
      (path.endsWith('/list_my_campaign_invitations') ||
        path.endsWith('/list_campaign_outgoing_invitations'))
    ) {
      await route.fulfill({ status: 200, headers: corsHeaders(), json: [] })
      return
    }

    if (path.endsWith('/rest/v1/rpc/get_campaign_roster') && method === 'POST') {
      const { p_campaign_id: campaignId } = request.postDataJSON() as { p_campaign_id: string }
      const campaign = campaigns.find((item) => item.id === campaignId)
      const roster = campaign
        ? [
            {
              profile_id: campaign.owner_id,
              role: 'owner',
              username: campaign.owner_id === accountId ? 'player_one' : 'game_master',
            },
            ...(campaign.owner_id === accountId
              ? []
              : [{ profile_id: accountId, role: 'member', username: 'player_one' }]),
          ]
        : []
      await route.fulfill({ status: 200, headers: corsHeaders(), json: roster })
      return
    }

    if (path.endsWith('/rest/v1/campaigns') && method === 'POST') {
      const input = request.postDataJSON() as { name: string; description: string | null }
      const campaign: Campaign = {
        ...input,
        id: '00000000-0000-4000-8000-000000000099',
        owner_id: accountId,
        created_at: now,
        updated_at: now,
      }
      campaigns.unshift(campaign)
      await route.fulfill({ status: 201, headers: corsHeaders(), json: { id: campaign.id } })
      return
    }

    if (path.endsWith('/rest/v1/campaigns') && method === 'PATCH') {
      const idFilter = url.searchParams.get('id')?.slice(3)
      const campaign = campaigns.find((item) => item.id === idFilter && item.owner_id === accountId)
      if (!campaign) {
        await route.fulfill({ status: 200, headers: corsHeaders(), json: [] })
        return
      }
      Object.assign(campaign, request.postDataJSON(), { updated_at: new Date().toISOString() })
      await route.fulfill({ status: 200, headers: corsHeaders(), json: [campaign] })
      return
    }

    if (path.endsWith('/rest/v1/campaigns') && method === 'DELETE') {
      const idFilter = url.searchParams.get('id')?.slice(3)
      const index = campaigns.findIndex(
        (item) => item.id === idFilter && item.owner_id === accountId,
      )
      const deleted = index < 0 ? [] : [{ id: campaigns.splice(index, 1)[0].id }]
      await route.fulfill({ status: 200, headers: corsHeaders(), json: deleted })
      return
    }

    await route.fulfill({
      status: 404,
      headers: corsHeaders(),
      json: { message: 'Unexpected API request' },
    })
  })
  return campaigns
}

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
  await expect(page.getByRole('group', { name: 'Confirm campaign deletion' })).toBeVisible()
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

async function openCamp(page: Page, campaign: Campaign = redHand) {
  await signIn(page)
  await page.goto(`/app/campaigns/${campaign.id}`)
  const camp = page.locator('.camp')
  await expect(camp).toHaveAttribute('data-camp-ready', 'true')
  return camp
}

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
  await page.route('**/rest/v1/rpc/get_campaign_roster', async (route) => {
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
    await expect(camp).toHaveAttribute('data-camp-ready', 'true')

    // The canvas is drawn 1:1 in device pixels, so every art pixel stays a whole block.
    await expect
      .poll(() =>
        canvas.evaluate((element: HTMLCanvasElement) => {
          const ratio = window.devicePixelRatio
          return (
            element.width === Math.round(element.clientWidth * ratio) &&
            element.height === Math.round(element.clientHeight * ratio)
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
    expect(total).toBe(3)
    let inFrame = 0
    for (let index = 0; index < total; index += 1) {
      const sign = signs.nth(index)
      if ((await sign.evaluate((el) => getComputedStyle(el).visibility)) === 'visible') {
        inFrame += 1
        await expect(sign).toBeInViewport({ ratio: 1 })
        await sign.click({ trial: true })
        const box = (await sign.boundingBox())!
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
      } else {
        await expect(sign).toBeHidden()
      }
    }
    if (desktop) expect(inFrame).toBe(total)

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
    await dialog.getByText('player_31', { exact: true }).scrollIntoViewIfNeeded()
    await expect(dialog.getByText('player_31', { exact: true })).toBeInViewport()
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

/** A roster of an owner, a member without a username, and named members. */
function partyRoster(count: number): RosterMember[] {
  return Array.from({ length: count }, (_, index) => ({
    profile_id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
    role: index === 0 ? 'owner' : 'member',
    username:
      index === 1 ? null : index === 0 ? 'game_master' : `player_${String(index).padStart(2, '0')}`,
  }))
}

async function mockRoster(page: Page, roster: () => RosterMember[] | 'fail') {
  await page.route('**/rest/v1/rpc/get_campaign_roster', async (route) => {
    const headers = corsHeaders()
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = roster()
    if (body === 'fail') {
      return route.fulfill({ status: 400, headers, json: { message: 'temporary test failure' } })
    }
    await route.fulfill({ status: 200, headers, json: body })
  })
}

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
  await expect(page.getByText('Campaign members could not be loaded.')).toBeVisible()
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

  await expect(page.locator('[data-camp-sign]')).toHaveCount(2)
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

  const wagon = page.locator('[data-camp-sign][data-location="settings"]')
  await wagon.hover()
  await expect.poll(outlined).toBeGreaterThan(0)
  const wagonOutline = await outlined()
  await page.mouse.move(700, 300)
  await expect.poll(outlined).toBe(0)

  // Bedrolls and seated figures make a bigger outline than the wagon alone.
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
  expect(wagonOutline).toBeGreaterThan(0)
})

declare global {
  interface Window {
    __campLog: Array<{ name: string; value: string | null }>
    __campDraws: number
  }
}

/**
 * Records every change to the camp's motion attributes and counts canvas clears
 * (one per effects frame), so tests can see what animated and how often.
 */
async function watchCamp(page: Page) {
  await page.addInitScript(() => {
    window.__campLog = []
    window.__campDraws = 0
    const clear = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      window.__campDraws += 1
      return clear.apply(this, args)
    }
    const names = ['data-animating', 'data-camp-landfall', 'data-camera-x']
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as Element
        if (!target.classList?.contains('camp') || !record.attributeName) continue
        window.__campLog.push({
          name: record.attributeName,
          value: target.getAttribute(record.attributeName),
        })
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: names })
  })
}

const campLog = (page: Page, name: string) =>
  page.evaluate(
    (attribute) => window.__campLog.filter((entry) => entry.name === attribute).map((e) => e.value),
    name,
  )

const campDraws = (page: Page) => page.evaluate(() => window.__campDraws)

/** Picks the campaign in the selector and enters it: a fresh arrival from the galaxy. */
async function enterFromGalaxy(page: Page, campaign: Campaign = redHand) {
  await page.goto('/app/campaigns')
  await page.getByRole('button', { name: campaign.name, exact: true }).click()
  await page.getByRole('link', { name: 'Enter campaign' }).click()
  await expect(page).toHaveURL(new RegExp(`/app/campaigns/${campaign.id}$`))
  return page.locator('.camp')
}

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
    ['settings', 240],
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
  await page.route('**/rest/v1/rpc/get_campaign_roster', async (route) => {
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
  await expect(page.getByText('Loading campaign members…')).toBeVisible()
  releaseRoster()
  await expect(page.getByText('Campaign members could not be loaded.')).toBeVisible()
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
