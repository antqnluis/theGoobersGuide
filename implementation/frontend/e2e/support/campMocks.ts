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

    // No characters unless a test layers mockCharacters on top.
    if (path.endsWith('/rest/v1/characters') && method === 'GET') {
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

export type MockCharacter = {
  id: string
  campaign_id: string
  owner_id: string
  name: string
  species: string | null
  class_name: string | null
  subclass: string | null
  background: string | null
  level: number
  status: 'active' | 'retired' | 'deceased'
  in_party: boolean
  sheet_visibility: 'private' | 'campaign'
  portrait_path: string | null
  status_changed_at: string
  created_at: string
  updated_at: string
}

export type MockSheet = {
  character_id: string
  max_hp: number | null
  current_hp: number | null
  temp_hp: number
  armor_class: number | null
  speed: number | null
  sheet: Record<string, unknown>
  updated_at: string
}

export type CharacterState = { characters: MockCharacter[]; sheets: MockSheet[] }

let stamp = 0
const nextStamp = () => new Date(Date.UTC(2026, 10, 13, 12, 0, 0, 0) + ++stamp * 1000).toISOString()
let counter = 0

export function mockCharacter(overrides: Partial<MockCharacter> = {}): MockCharacter {
  counter += 1
  return {
    id: `00000000-0000-4000-8000-${String(1000 + counter).padStart(12, '0')}`,
    campaign_id: redHand.id,
    owner_id: accountId,
    name: 'Brand',
    species: 'Elf',
    class_name: 'Fighter',
    subclass: null,
    background: null,
    level: 3,
    status: 'active',
    in_party: true,
    sheet_visibility: 'private',
    portrait_path: null,
    status_changed_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

export function mockSheet(characterId: string, overrides: Partial<MockSheet> = {}): MockSheet {
  return {
    character_id: characterId,
    max_hp: null,
    current_hp: null,
    temp_hp: 0,
    armor_class: null,
    speed: null,
    sheet: { version: 1 },
    updated_at: nextStamp(),
    ...overrides,
  }
}

export type CharacterFailure = { status: number; message: string } | null

/**
 * Stateful characters, sheets, and the three lifecycle RPCs, layered over
 * `mockCampaignApi` (later routes win). Writes mutate `state` so refetches show the
 * result, the way row-level security and the database rules would: only the signed-in
 * account's own characters change, one character can be active, and a private sheet is
 * invisible to everyone else.
 */
export async function mockCharacters(
  page: Page,
  state: CharacterState,
  options: {
    /** Return a failure to refuse the next call to this table or RPC. */
    fail?: (target: string) => CharacterFailure
    /** Holds each write until the promise settles. */
    hold?: () => Promise<void> | undefined
  } = {},
) {
  const calls: string[] = []
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())
    const path = url.pathname
    const headers = corsHeaders()
    const target = path.split('/rest/v1/')[1] ?? ''
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const table = target.replace(/^rpc\//, '')
    if (
      !['characters', 'character_sheets'].includes(table) &&
      !['create_character', 'set_character_status', 'set_character_in_party'].includes(table)
    ) {
      return route.fallback()
    }

    const isWrite = method !== 'GET'
    if (isWrite) calls.push(`${method} ${table}`)
    if (isWrite) await options.hold?.()
    const failure = options.fail?.(table)
    if (failure) {
      return route.fulfill({
        status: failure.status,
        headers,
        json: { code: failure.status >= 500 ? 'XX000' : 'P0001', message: failure.message },
      })
    }

    const eq = (name: string) => {
      const value = url.searchParams.get(name)
      return value?.startsWith('eq.') ? value.slice(3) : null
    }
    const wantsObject = (request.headers().accept ?? '').includes('vnd.pgrst.object')
    const respond = (rows: unknown[], status = 200) => {
      if (!wantsObject) return route.fulfill({ status, headers, json: rows })
      if (rows.length !== 1) {
        return route.fulfill({
          status: 406,
          headers,
          json: {
            code: 'PGRST116',
            details: `The result contains ${rows.length} rows`,
            message: 'JSON object requested, multiple (or no) rows returned',
          },
        })
      }
      return route.fulfill({ status, headers, json: rows[0] })
    }
    const fail = (message: string) =>
      route.fulfill({ status: 400, headers, json: { code: 'P0001', message } })

    const isMine = (character: MockCharacter) => character.owner_id === accountId
    const body = method === 'GET' || method === 'DELETE' ? {} : request.postDataJSON()

    if (table === 'characters' && method === 'GET') {
      const campaignId = eq('campaign_id')
      return respond(
        state.characters.filter((character) => !campaignId || character.campaign_id === campaignId),
      )
    }
    if (table === 'characters' && method === 'PATCH') {
      const id = eq('id')
      const row = state.characters.find((character) => character.id === id && isMine(character))
      if (!row) return respond([])
      Object.assign(row, body, { updated_at: new Date().toISOString() })
      return respond([row])
    }
    if (table === 'characters' && method === 'DELETE') {
      const index = state.characters.findIndex(
        (character) => character.id === eq('id') && isMine(character),
      )
      if (index < 0) return respond([])
      const [removed] = state.characters.splice(index, 1)
      state.sheets = state.sheets.filter((sheet) => sheet.character_id !== removed.id)
      return respond([{ id: removed.id }])
    }

    if (table === 'character_sheets') {
      const id = eq('character_id')
      const owner = state.characters.find((character) => character.id === id)
      const sheet = state.sheets.find((item) => item.character_id === id)
      const visible =
        owner && sheet && (isMine(owner) || owner.sheet_visibility === 'campaign') ? [sheet] : []
      if (method === 'GET') return respond(visible)
      if (method === 'PATCH') {
        const stampFilter = eq('updated_at')
        const writable = owner && sheet && isMine(owner) ? sheet : null
        if (!writable || (stampFilter && stampFilter !== writable.updated_at)) return respond([])
        Object.assign(writable, body, { updated_at: nextStamp() })
        return respond([writable])
      }
    }

    if (table === 'create_character') {
      const input = body as {
        p_campaign_id: string
        p_name: string
        p_species?: string
        p_class_name?: string
        p_subclass?: string
        p_background?: string
        p_level?: number
        p_in_party?: boolean
      }
      if (state.characters.some((c) => isMine(c) && c.status === 'active')) {
        return fail('character_active_exists')
      }
      const row = mockCharacter({
        campaign_id: input.p_campaign_id,
        name: input.p_name,
        species: input.p_species ?? null,
        class_name: input.p_class_name ?? null,
        subclass: input.p_subclass ?? null,
        background: input.p_background ?? null,
        level: input.p_level ?? 1,
        in_party: input.p_in_party ?? false,
        created_at: new Date().toISOString(),
        status_changed_at: new Date().toISOString(),
      })
      state.characters.push(row)
      state.sheets.push(mockSheet(row.id))
      return route.fulfill({ status: 200, headers, json: row.id })
    }

    if (table === 'set_character_status' || table === 'set_character_in_party') {
      const input = body as { p_character_id: string; p_status?: string; p_in_party?: boolean }
      const row = state.characters.find((c) => c.id === input.p_character_id && isMine(c))
      if (!row) return fail('character_unavailable')
      if (table === 'set_character_status') {
        const next = input.p_status as MockCharacter['status']
        if (next === 'active' && row.status !== 'active') {
          if (state.characters.some((c) => isMine(c) && c.status === 'active')) {
            return fail('character_active_exists')
          }
        }
        if (next !== row.status) {
          row.status = next
          row.status_changed_at = new Date().toISOString()
          if (next !== 'active') row.in_party = false
        }
      } else {
        if (input.p_in_party && row.status !== 'active') return fail('character_not_active')
        row.in_party = Boolean(input.p_in_party)
      }
      return route.fulfill({ status: 204, headers })
    }

    return route.fallback()
  })

  // Storage: uploads, signed links, the picture itself, and removals, kept in `objects`.
  const objects = new Set<string>()
  await page.route('**/storage/v1/**', async (route) => {
    const request = route.request()
    const headers = corsHeaders()
    const path = decodeURIComponent(new URL(request.url()).pathname.split('/storage/v1/')[1] ?? '')
    const method = request.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const bucket = 'character-portraits'
    if (method === 'POST' && path.startsWith(`object/sign/${bucket}/`)) {
      const name = path.slice(`object/sign/${bucket}/`.length)
      if (!objects.has(name))
        return route.fulfill({ status: 404, headers, json: { message: 'Object not found' } })
      return route.fulfill({
        status: 200,
        headers,
        json: { signedURL: `/object/sign/${bucket}/${name}?token=mock` },
      })
    }
    if (method === 'POST' && path.startsWith(`object/${bucket}/`)) {
      const name = path.slice(`object/${bucket}/`.length)
      objects.add(name)
      return route.fulfill({ status: 200, headers, json: { Id: name, Key: `${bucket}/${name}` } })
    }
    if (method === 'DELETE' && path === `object/${bucket}`) {
      const { prefixes } = request.postDataJSON() as { prefixes: string[] }
      for (const name of prefixes) objects.delete(name)
      return route.fulfill({ status: 200, headers, json: [] })
    }
    if (method === 'GET' && path.startsWith(`object/sign/${bucket}/`)) {
      const onePixelPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      )
      return route.fulfill({
        status: 200,
        headers: { ...headers, 'content-type': 'image/png' },
        body: onePixelPng,
      })
    }
    return route.fallback()
  })
  return { calls, objects }
}
