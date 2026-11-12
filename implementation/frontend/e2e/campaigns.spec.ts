import { expect, type Page, test } from '@playwright/test'

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
    delayList?: boolean
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
        await new Promise((resolve) => setTimeout(resolve, 500))
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
  await expect(page.getByRole('heading', { name: 'People in this campaign' })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await expect(campaign).toHaveAttribute('aria-pressed', 'false')
  await expect(openWorkspace).toHaveCount(0)

  await page.goto(`/app/campaigns/${redHand.id}`)
  await expect(page.getByRole('heading', { name: 'The Red Hand' })).toBeVisible()
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

  await page.getByRole('button', { name: 'Edit details' }).click()
  await page.getByLabel('Campaign name').fill('The Red Hand: Reframed')
  await page.getByLabel('Description (optional)').fill('A different account of the same town.')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('heading', { name: 'The Red Hand: Reframed' })).toBeVisible()
  await expect(
    page.getByRole('status').filter({ hasText: 'Campaign details saved.' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Delete campaign' }).click()
  await expect(page.getByRole('group', { name: 'Confirm campaign deletion' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep campaign' }).click()
  await expect(page.getByRole('heading', { name: 'The Red Hand: Reframed' })).toBeVisible()

  await page.getByRole('button', { name: 'Delete campaign' }).click()
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
  await expect(page.getByText('Your role').locator('..')).toContainText('Member')
  await expect(page.getByRole('list').getByText('game_master', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit details' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete campaign' })).toHaveCount(0)
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
  await mockCampaignApi(page, [redHand], { delayList: true })
  await signIn(page)

  await expect(
    page.getByRole('status').filter({ hasText: 'Gathering your campaigns…' }),
  ).toBeVisible()
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
      await expect(
        page.getByRole('list', { name: 'Campaign list' }).getByRole('button'),
      ).toHaveText([redHand.name, second.name, third.name])
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
