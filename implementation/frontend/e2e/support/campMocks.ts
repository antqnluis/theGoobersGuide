import { expect, type Page } from '@playwright/test'
import type { RosterMember } from '../../src/features/campaigns/camp/campLayout.ts'

export const accountId = '00000000-0000-4000-8000-000000000001'
export const ownerId = '00000000-0000-4000-8000-000000000002'
export const accountEmail = 'player@example.com'
export const now = new Date().toISOString()
export const authSession = {
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

export type Campaign = {
  id: string
  owner_id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export const redHand: Campaign = {
  id: '00000000-0000-4000-8000-000000000011',
  owner_id: accountId,
  name: 'The Red Hand',
  description: 'A quiet town has begun to forget its own history.',
  created_at: now,
  updated_at: now,
}

export function corsHeaders() {
  return {
    'access-control-allow-origin': 'http://127.0.0.1:4173',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': 'content-range',
    'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
  }
}

export async function signIn(page: Page) {
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

export async function mockCampaignApi(
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

    if (path.endsWith('/rest/v1/rpc/get_campaign_party') && method === 'POST') {
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

export async function openCamp(page: Page, campaign: Campaign = redHand) {
  await signIn(page)
  await page.goto(`/app/campaigns/${campaign.id}`)
  const camp = page.locator('.camp')
  await expect(camp).toHaveAttribute('data-camp-ready', 'true')
  return camp
}

/** A roster of an owner, a member without a username, and named members. */
export function partyRoster(count: number): RosterMember[] {
  return Array.from({ length: count }, (_, index) => ({
    profile_id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
    role: index === 0 ? 'owner' : 'member',
    username:
      index === 1 ? null : index === 0 ? 'game_master' : `player_${String(index).padStart(2, '0')}`,
  }))
}

export async function mockRoster(page: Page, roster: () => RosterMember[] | 'fail') {
  await page.route('**/rest/v1/rpc/get_campaign_party', async (route) => {
    const headers = corsHeaders()
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = roster()
    if (body === 'fail') {
      return route.fulfill({ status: 400, headers, json: { message: 'temporary test failure' } })
    }
    await route.fulfill({ status: 200, headers, json: body })
  })
}

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
export async function watchCamp(page: Page) {
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

export const campLog = (page: Page, name: string) =>
  page.evaluate(
    (attribute) => window.__campLog.filter((entry) => entry.name === attribute).map((e) => e.value),
    name,
  )

export const campDraws = (page: Page) => page.evaluate(() => window.__campDraws)

/** Picks the campaign in the selector and enters it: a fresh arrival from the galaxy. */
export async function enterFromGalaxy(page: Page, campaign: Campaign = redHand) {
  await page.goto('/app/campaigns')
  await page.getByRole('button', { name: campaign.name, exact: true }).click()
  await page.getByRole('link', { name: 'Enter campaign' }).click()
  await expect(page).toHaveURL(new RegExp(`/app/campaigns/${campaign.id}$`))
  return page.locator('.camp')
}

export type MembershipFailure = { status: number; message: string } | null

/**
 * A stateful roster and the three membership RPCs, layered over `mockCampaignApi`
 * (later routes win). Leaving, removing, and transferring mutate `roster` and
 * `campaigns` so refetches show the result, as the database would.
 */
export async function mockMembership(
  page: Page,
  campaigns: Campaign[],
  roster: RosterMember[],
  options: {
    /** Return a failure to refuse the next membership call. */
    fail?: () => MembershipFailure
    /** Holds each membership call until the promise settles. */
    hold?: () => Promise<void> | undefined
  } = {},
) {
  const calls: string[] = []
  const requests: string[] = []
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname
    const headers = corsHeaders()
    const rpc = path.split('/rest/v1/rpc/')[1]
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    requests.push(`${method} ${path.split('/rest/v1/')[1]}`)

    if (rpc === 'get_campaign_party') {
      return route.fulfill({ status: 200, headers, json: roster })
    }
    if (
      rpc !== 'leave_campaign' &&
      rpc !== 'remove_campaign_member' &&
      rpc !== 'transfer_campaign_ownership'
    ) {
      return route.fallback()
    }

    const body = request.postDataJSON() as { p_campaign_id: string; p_profile_id?: string }
    calls.push(`${rpc} ${body.p_profile_id ?? ''}`.trim())
    await options.hold?.()
    const failure = options.fail?.()
    if (failure) {
      return route.fulfill({
        status: failure.status,
        headers,
        json: { code: 'P0001', message: failure.message },
      })
    }

    const campaign = campaigns.find((item) => item.id === body.p_campaign_id)
    if (rpc === 'leave_campaign') {
      campaigns.splice(campaigns.indexOf(campaign!), 1)
    } else if (rpc === 'remove_campaign_member') {
      const index = roster.findIndex((member) => member.profile_id === body.p_profile_id)
      roster.splice(index, 1)
    } else {
      for (const member of roster) {
        if (member.role === 'owner') member.role = 'member'
        else if (member.profile_id === body.p_profile_id) member.role = 'owner'
      }
      campaign!.owner_id = body.p_profile_id!
    }
    await route.fulfill({ status: 204, headers })
  })
  return { calls, requests }
}
