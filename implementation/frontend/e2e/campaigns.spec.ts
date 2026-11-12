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
  options: { memberMode?: boolean; shouldFailList?: () => boolean } = {},
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
      if (!url.searchParams.has('id') && options.shouldFailList?.()) {
        await route.fulfill({
          status: 503,
          headers: corsHeaders(),
          json: { message: 'temporary test failure' },
        })
        return
      }

      const idFilter = url.searchParams.get('id')
      const result = idFilter?.startsWith('eq.')
        ? campaigns.filter((campaign) => campaign.id === idFilter.slice(3))
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

test('lists campaigns and supports direct workspace links after refresh', async ({ page }) => {
  await mockCampaignApi(page, [redHand])
  await signIn(page)

  await expect(page.getByRole('heading', { name: 'The Red Hand' })).toBeVisible()
  await expect(page.getByText('Your role:')).toContainText('Owner')
  await page.getByRole('link', { name: 'Open workspace' }).click()
  await expect(page).toHaveURL(/\/app\/campaigns\/00000000-0000-4000-8000-000000000011$/)
  await expect(page.getByRole('heading', { name: 'People in this campaign' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'The Red Hand' })).toBeVisible()
  await expect(page.getByText('player_one')).toBeVisible()
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
  await expect(page.getByRole('status')).toContainText('Campaign created.')
  await expect(page.getByRole('heading', { name: 'The Far Shore' })).toBeVisible()
})

test('lets the owner edit details and confirms deletion', async ({ page }) => {
  await mockCampaignApi(page, [redHand])
  await signIn(page)
  await page.getByRole('link', { name: 'Open workspace' }).click()

  await page.getByRole('button', { name: 'Edit details' }).click()
  await page.getByLabel('Campaign name').fill('The Red Hand: Reframed')
  await page.getByLabel('Description (optional)').fill('A different account of the same town.')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('heading', { name: 'The Red Hand: Reframed' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Campaign details saved.')

  await page.getByRole('button', { name: 'Delete campaign' }).click()
  await expect(page.getByRole('group', { name: 'Confirm campaign deletion' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep campaign' }).click()
  await expect(page.getByRole('heading', { name: 'The Red Hand: Reframed' })).toBeVisible()

  await page.getByRole('button', { name: 'Delete campaign' }).click()
  await page.getByRole('button', { name: 'Yes, delete campaign' }).click()
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await expect(page.getByRole('status')).toContainText('Campaign deleted.')
  await expect(page.getByRole('heading', { name: 'Your next story starts here.' })).toBeVisible()
})

test('shows member access without owner controls', async ({ page }) => {
  const memberCampaign: Campaign = {
    ...redHand,
    owner_id: ownerId,
  }
  await mockCampaignApi(page, [memberCampaign], { memberMode: true })
  await signIn(page)

  await expect(page.getByText('Your role:')).toContainText('Member')
  await page.getByRole('link', { name: 'Open workspace' }).click()
  await expect(page.getByText('Your role').locator('..')).toContainText('Member')
  await expect(page.getByText('game_master')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit details' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete campaign' })).toHaveCount(0)
})

test('recovers from a campaign list failure and shows the empty state', async ({ page }) => {
  let shouldFail = true
  await mockCampaignApi(page, [], { shouldFailList: () => shouldFail })
  await signIn(page)
  await expect(
    page.getByRole('heading', { name: 'Your campaigns could not be loaded.' }),
  ).toBeVisible()

  shouldFail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Your next story starts here.' })).toBeVisible()
})

test('does not disclose an unavailable campaign through a direct URL', async ({ page }) => {
  await mockCampaignApi(page, [])
  await signIn(page)
  await page.goto('/app/campaigns/00000000-0000-4000-8000-000000000011')

  await expect(page.getByRole('heading', { name: 'Campaign not available' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit details' })).toHaveCount(0)
})
