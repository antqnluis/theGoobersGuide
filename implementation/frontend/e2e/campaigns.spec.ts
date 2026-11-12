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
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

  await page.goto('/login')
  const signInForm = page.getByRole('region', { name: 'Sign in' })
  await signInForm.getByLabel('Username or email').fill(accountEmail)
  await signInForm.getByLabel('Password', { exact: true }).fill('adventure1')
  await signInForm.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/app\/campaigns$/)
}

async function mockCampaignApi(
  page: Page,
  initialCampaigns: Campaign[],
  options: {
    delayList?: boolean
    memberMode?: boolean
    shouldFailList?: () => boolean
    hideFromList?: () => boolean
  } = {},
) {
  const campaigns = [...initialCampaigns]
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
}

test('selects by keyboard, opens the workspace explicitly, and returns to the overview', async ({
  page,
}) => {
  await mockCampaignApi(page, [redHand])
  await signIn(page)

  const campaign = page.getByRole('button', { name: 'The Red Hand' })
  const details = page.getByRole('region', { name: 'Campaign details' })
  const openWorkspace = page.getByRole('link', { name: 'Enter campaign' })
  await expect(openWorkspace).toHaveCount(0)
  await campaign.focus()
  await campaign.press('Enter')
  await expect(campaign).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await expect(details.getByRole('heading', { name: 'The Red Hand' })).toBeVisible()
  await expect(details.getByText(redHand.description!)).toBeVisible()
  await expect(details.getByText('Your role:')).toContainText('Owner')

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
  await page.getByRole('button', { name: 'The Red Hand' }).click()
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

  await page.getByRole('button', { name: 'The Red Hand' }).click()
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

  const campaign = page.getByRole('button', { name: 'The Red Hand' })
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
  await expect(page.getByRole('button', { name: 'The Red Hand' })).toBeVisible()
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
          await expect(page.getByRole('button', { name: 'The Red Hand' })).toHaveCount(0)
          await disclosure.press('Enter')
        }
        await page.getByRole('button', { name: 'The Red Hand' }).click()
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
  await mockCampaignApi(page, [redHand])
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
  await page.getByRole('button', { name: 'The Red Hand' }).click()
  await page.getByRole('link', { name: 'Create campaign' }).click()
  await expect(page.getByRole('heading', { name: 'Create a campaign' })).toBeVisible()
  expect(await canvas.evaluate((element, original) => element === original, originalCanvas)).toBe(
    true,
  )

  await page.getByRole('link', { name: 'Back to campaigns' }).click()
  await expect(page.getByRole('button', { name: 'The Red Hand' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(await canvas.evaluate((element, original) => element === original, originalCanvas)).toBe(
    true,
  )
  await canvas.evaluate((element: HTMLCanvasElement) => {
    const extension = element.getContext('webgl2')?.getExtension('WEBGL_lose_context')
    if (!extension) throw new Error('WebGL context-loss simulation unavailable')
    extension.loseContext()
  })
  await expect(canvas).toHaveCount(0)
  await expect(backdrop).toBeVisible()
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
  await mockCampaignApi(page, [redHand])
  await signIn(page)

  await initializationFailure
  await expect(page.locator('.galaxy-backdrop canvas')).toHaveCount(0)
  await page.getByRole('button', { name: 'The Red Hand' }).click()
  await page.getByRole('link', { name: 'Enter campaign' }).click()
  await expect(page.getByRole('heading', { name: 'The Red Hand' })).toBeVisible()
})
