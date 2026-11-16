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

    // No saved looks unless a test layers mockAppearances on top.
    if (path.endsWith('/rest/v1/campaign_appearances') && method === 'GET') {
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
  cp: number
  sp: number
  gp: number
  sheet: Record<string, unknown>
  updated_at: string
}

export type MockItem = {
  id: string
  character_id: string
  name: string
  quantity: number
  weight: number | null
  description: string | null
  equipped: boolean
  attuned: boolean
  created_at: string
  updated_at: string
}

export type MockCoinTransaction = {
  id: string
  seq: number
  character_id: string
  created_at: string
  cp_delta: number
  sp_delta: number
  gp_delta: number
  cp_after: number
  sp_after: number
  gp_after: number
}

export type MockImport = {
  id: string
  character_id: string
  kind: 'new' | 'update'
  source_label: string | null
  change_count: number
  imported_at: string
}

export type CharacterState = {
  characters: MockCharacter[]
  sheets: MockSheet[]
  /** Coin log rows; created empty and filled by the mocked coin RPC. */
  coinLog?: MockCoinTransaction[]
  /** Inventory rows; created empty when a test does not bring any. */
  items?: MockItem[]
  /** Import history; created empty and filled by the mocked import RPCs. */
  imports?: MockImport[]
}

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
    cp: 0,
    sp: 0,
    gp: 0,
    sheet: { version: 1 },
    updated_at: nextStamp(),
    ...overrides,
  }
}

let itemCounter = 0

export function mockItem(characterId: string, overrides: Partial<MockItem> = {}): MockItem {
  itemCounter += 1
  return {
    id: `00000000-0000-4000-8000-${String(5000 + itemCounter).padStart(12, '0')}`,
    character_id: characterId,
    name: 'Rope',
    quantity: 1,
    weight: null,
    description: null,
    equipped: false,
    attuned: false,
    created_at: new Date(Date.UTC(2026, 10, 14, 10, 0, itemCounter)).toISOString(),
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
  state.items ??= []
  const items = state.items
  state.coinLog ??= []
  const coinLog = state.coinLog
  state.imports ??= []
  const imports = state.imports
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
      ![
        'characters',
        'character_sheets',
        'character_items',
        'character_currency_log',
        'character_imports',
      ].includes(table) &&
      ![
        'create_character',
        'set_character_status',
        'set_character_in_party',
        'adjust_character_currency',
        'adjust_character_item_quantity',
        'import_character',
        'apply_character_update',
      ].includes(table)
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
      for (let at = items.length - 1; at >= 0; at--) {
        if (items[at].character_id === removed.id) items.splice(at, 1)
      }
      for (let at = coinLog.length - 1; at >= 0; at--) {
        if (coinLog[at].character_id === removed.id) coinLog.splice(at, 1)
      }
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

    // Inventory: readable like the sheet, writable by the owner only (plan §3).
    const characterOf = (characterId: string | null | undefined) =>
      state.characters.find((character) => character.id === characterId)
    const readable = (characterId: string) => {
      const owner = characterOf(characterId)
      return Boolean(owner && (isMine(owner) || owner.sheet_visibility === 'campaign'))
    }
    const writable = (characterId: string) => {
      const owner = characterOf(characterId)
      return Boolean(owner && isMine(owner))
    }

    if (table === 'character_items') {
      if (method === 'GET') {
        const characterId = eq('character_id') ?? ''
        return respond(
          readable(characterId) ? items.filter((row) => row.character_id === characterId) : [],
        )
      }
      if (method === 'POST') {
        const input = body as Partial<MockItem> & { character_id: string }
        if (!writable(input.character_id)) {
          return route.fulfill({
            status: 403,
            headers,
            json: { code: '42501', message: 'new row violates row-level security policy' },
          })
        }
        if (items.filter((row) => row.character_id === input.character_id).length >= 200) {
          return fail('item_limit_reached')
        }
        const row = mockItem(input.character_id, input)
        items.push(row)
        return respond([row], 201)
      }
      const row = items.find((candidate) => candidate.id === eq('id'))
      const stampFilter = eq('updated_at')
      const allowed =
        row && writable(row.character_id) && (!stampFilter || stampFilter === row.updated_at)
      if (method === 'PATCH') {
        if (!row || !allowed) return respond([])
        Object.assign(row, body, { updated_at: nextStamp() })
        return respond([row])
      }
      if (method === 'DELETE') {
        if (!row || !allowed) return respond([])
        items.splice(items.indexOf(row), 1)
        return respond([{ id: row.id }])
      }
    }

    if (table === 'character_currency_log' && method === 'GET') {
      const characterId = eq('character_id') ?? ''
      const limit = Number(url.searchParams.get('limit') ?? 1000)
      return respond(
        readable(characterId)
          ? coinLog
              .filter((row) => row.character_id === characterId)
              .toSorted((a, b) => b.seq - a.seq)
              .slice(0, limit)
          : [],
      )
    }

    if (table === 'adjust_character_currency') {
      const input = body as { p_character_id: string; p_cp?: number; p_sp?: number; p_gp?: number }
      const owner = characterOf(input.p_character_id)
      const sheet = state.sheets.find((row) => row.character_id === input.p_character_id)
      if (!owner || !isMine(owner) || !sheet) return fail('character_unavailable')
      const next = {
        cp: sheet.cp + (input.p_cp ?? 0),
        sp: sheet.sp + (input.p_sp ?? 0),
        gp: sheet.gp + (input.p_gp ?? 0),
      }
      if (Object.values(next).some((value) => value < 0)) return fail('currency_insufficient')
      if (Object.values(next).some((value) => value > 9_999_999)) {
        return fail('currency_limit_exceeded')
      }
      if (next.cp !== sheet.cp || next.sp !== sheet.sp || next.gp !== sheet.gp) {
        const seq = coinLog.reduce((top, row) => Math.max(top, row.seq), 0) + 1
        coinLog.push({
          id: `00000000-0000-4000-8000-${String(9000 + seq).padStart(12, '0')}`,
          seq,
          character_id: input.p_character_id,
          created_at: new Date(Date.UTC(2026, 10, 14, 11, 0, seq)).toISOString(),
          cp_delta: next.cp - sheet.cp,
          sp_delta: next.sp - sheet.sp,
          gp_delta: next.gp - sheet.gp,
          cp_after: next.cp,
          sp_after: next.sp,
          gp_after: next.gp,
        })
        Object.assign(sheet, next, { updated_at: nextStamp() })
      }
      return route.fulfill({
        status: 200,
        headers,
        json: [{ ...next, updated_at: sheet.updated_at }],
      })
    }

    if (table === 'adjust_character_item_quantity') {
      const input = body as { p_item_id: string; p_delta: number }
      const row = items.find((candidate) => candidate.id === input.p_item_id)
      if (!row || !writable(row.character_id)) return fail('item_unavailable')
      const quantity = row.quantity + input.p_delta
      if (quantity < 0) return fail('item_quantity_insufficient')
      if (quantity > 9999) return fail('item_quantity_invalid')
      if (input.p_delta !== 0) Object.assign(row, { quantity, updated_at: nextStamp() })
      return route.fulfill({ status: 200, headers, json: row.quantity })
    }

    if (table === 'character_imports' && method === 'GET') {
      const characterId = eq('character_id') ?? ''
      return respond(
        readable(characterId)
          ? imports
              .filter((row) => row.character_id === characterId)
              .toSorted((a, b) => b.imported_at.localeCompare(a.imported_at))
          : [],
      )
    }

    // import_character: one transaction in the database, so a refusal creates nothing.
    if (table === 'import_character') {
      const input = body as {
        p_campaign_id: string
        p_source_label?: string | null
        p_character: {
          details: Record<string, string | number | null>
          vitals: Partial<MockSheet>
          sheet: Record<string, unknown>
          items: Array<Partial<MockItem> & { name: string }>
          coins: { cp?: number; sp?: number; gp?: number }
        }
      }
      if (state.characters.some((c) => isMine(c) && c.status === 'active')) {
        return fail('character_active_exists')
      }
      const { details, vitals, sheet, items: newItems, coins } = input.p_character
      const row = mockCharacter({
        campaign_id: input.p_campaign_id,
        name: String(details.name),
        species: (details.species as string | null) ?? null,
        class_name: (details.class_name as string | null) ?? null,
        subclass: (details.subclass as string | null) ?? null,
        background: (details.background as string | null) ?? null,
        level: (details.level as number | undefined) ?? 1,
        in_party: false,
        created_at: new Date().toISOString(),
        status_changed_at: new Date().toISOString(),
      })
      state.characters.push(row)
      state.sheets.push(
        mockSheet(row.id, {
          max_hp: vitals.max_hp ?? null,
          current_hp: vitals.current_hp ?? null,
          temp_hp: vitals.temp_hp ?? 0,
          armor_class: vitals.armor_class ?? null,
          speed: vitals.speed ?? null,
          cp: coins.cp ?? 0,
          sp: coins.sp ?? 0,
          gp: coins.gp ?? 0,
          sheet,
        }),
      )
      for (const entry of newItems) items.push(mockItem(row.id, entry))
      imports.push({
        id: `00000000-0000-4000-8000-${String(7000 + imports.length).padStart(12, '0')}`,
        character_id: row.id,
        kind: 'new',
        source_label: input.p_source_label ?? null,
        change_count:
          1 + newItems.length + ((coins.cp ?? 0) + (coins.sp ?? 0) + (coins.gp ?? 0) > 0 ? 1 : 0),
        imported_at: new Date().toISOString(),
      })
      return route.fulfill({ status: 200, headers, json: row.id })
    }

    // apply_character_update: all or nothing, and refused when anything changed since the review.
    if (table === 'apply_character_update') {
      const input = body as {
        p_character_id: string
        p_source_label?: string | null
        p_expected: {
          character_updated_at: string
          sheet_updated_at: string
          items: Record<string, string>
        }
        p_changes: {
          details?: Record<string, string | number | null>
          vitals?: Partial<MockSheet>
          sheet?: Record<string, unknown>
          items?: {
            add?: Array<Partial<MockItem> & { name: string }>
            update?: Array<Partial<MockItem> & { id: string }>
            remove?: string[]
          }
          coins?: { cp?: number; sp?: number; gp?: number }
          change_count?: number
        }
      }
      const owner = characterOf(input.p_character_id)
      const sheet = state.sheets.find((row) => row.character_id === input.p_character_id)
      if (!owner || !isMine(owner) || !sheet) return fail('character_unavailable')
      const expected = input.p_expected
      const stale =
        owner.updated_at !== expected.character_updated_at ||
        sheet.updated_at !== expected.sheet_updated_at ||
        [
          ...(input.p_changes.items?.update ?? []).map((entry) => entry.id),
          ...(input.p_changes.items?.remove ?? []),
        ].some((id) => {
          const row = items.find((candidate) => candidate.id === id)
          return !row || row.character_id !== owner.id || row.updated_at !== expected.items[id]
        })
      if (stale) return fail('import_conflict')

      const changes = input.p_changes
      if (changes.details) Object.assign(owner, changes.details, { updated_at: nextStamp() })
      if (changes.vitals || changes.sheet) {
        Object.assign(sheet, changes.vitals ?? {}, changes.sheet ? { sheet: changes.sheet } : {})
      }
      for (const entry of changes.items?.update ?? []) {
        const row = items.find((candidate) => candidate.id === entry.id)
        if (row) Object.assign(row, entry, { updated_at: nextStamp() })
      }
      for (const id of changes.items?.remove ?? []) {
        items.splice(
          items.findIndex((candidate) => candidate.id === id),
          1,
        )
      }
      for (const entry of changes.items?.add ?? []) items.push(mockItem(owner.id, entry))
      if (changes.coins) {
        const next = { cp: sheet.cp, sp: sheet.sp, gp: sheet.gp, ...changes.coins }
        if (next.cp !== sheet.cp || next.sp !== sheet.sp || next.gp !== sheet.gp) {
          const seq = coinLog.reduce((top, row) => Math.max(top, row.seq), 0) + 1
          coinLog.push({
            id: `00000000-0000-4000-8000-${String(9000 + seq).padStart(12, '0')}`,
            seq,
            character_id: owner.id,
            created_at: new Date(Date.UTC(2026, 10, 14, 11, 0, seq)).toISOString(),
            cp_delta: next.cp - sheet.cp,
            sp_delta: next.sp - sheet.sp,
            gp_delta: next.gp - sheet.gp,
            cp_after: next.cp,
            sp_after: next.sp,
            gp_after: next.gp,
          })
          Object.assign(sheet, next)
        }
      }
      sheet.updated_at = nextStamp()
      imports.push({
        id: `00000000-0000-4000-8000-${String(7000 + imports.length).padStart(12, '0')}`,
        character_id: owner.id,
        kind: 'update',
        source_label: input.p_source_label ?? null,
        change_count: changes.change_count ?? 1,
        imported_at: new Date().toISOString(),
      })
      return route.fulfill({ status: 200, headers, json: sheet.updated_at })
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

export type MockAppearance = {
  campaign_id: string
  profile_id: string
  cloak: number
  skin: number
  headwear: string
  pack: string
}

/**
 * Stateful saved looks and the save RPC, layered over `mockCampaignApi`. Saving writes the
 * signed-in account's row; deleting removes only their own, as row-level security would.
 */
export async function mockAppearances(
  page: Page,
  state: { rows: MockAppearance[] },
  options: { fail?: () => boolean } = {},
) {
  const calls: string[] = []
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const target = new URL(request.url()).pathname.split('/rest/v1/')[1] ?? ''
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders() })
    if (target !== 'campaign_appearances' && target !== 'rpc/set_campaign_appearance') {
      return route.fallback()
    }
    const headers = corsHeaders()
    if (method !== 'GET') calls.push(`${method} ${target}`)
    if (method !== 'GET' && options.fail?.()) {
      return route.fulfill({ status: 500, headers, json: { code: 'XX000', message: 'boom' } })
    }
    if (method === 'GET') return route.fulfill({ status: 200, headers, json: state.rows })
    if (method === 'DELETE') {
      state.rows = state.rows.filter((row) => row.profile_id !== accountId)
      return route.fulfill({ status: 204, headers })
    }
    const input = request.postDataJSON() as {
      p_campaign_id: string
      p_cloak: number
      p_skin: number
      p_headwear: string
      p_pack: string
    }
    state.rows = [
      ...state.rows.filter((row) => row.profile_id !== accountId),
      {
        campaign_id: input.p_campaign_id,
        profile_id: accountId,
        cloak: input.p_cloak,
        skin: input.p_skin,
        headwear: input.p_headwear,
        pack: input.p_pack,
      },
    ]
    return route.fulfill({ status: 204, headers })
  })
  return { calls }
}

export type MockNote = {
  id: string
  campaign_id: string
  author_id: string
  visibility: 'private' | 'campaign'
  title: string
  body: string
  character_id: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type NoteState = {
  notes: MockNote[]
  /** Characters a note may link to; a link to any other id is refused. Unset allows any. */
  characterIds?: string[]
}

let noteCounter = 0

export function mockNote(overrides: Partial<MockNote> = {}): MockNote {
  noteCounter += 1
  const author = overrides.author_id ?? accountId
  return {
    id: `00000000-0000-4000-8000-${String(7000 + noteCounter).padStart(12, '0')}`,
    campaign_id: redHand.id,
    author_id: author,
    visibility: 'private',
    title: 'Clues',
    body: '',
    character_id: null,
    updated_by: author,
    created_at: now,
    updated_at: nextStamp(),
    ...overrides,
  }
}

/**
 * Stateful notes, layered over `mockCampaignApi` (later routes win). It follows the database's
 * rules: a private note is visible to its author alone (the campaign owner included), any
 * member edits a shared note, only the author changes visibility or deletes, saves are
 * filtered by `updated_at`, a link must name a campaign character, and 500 notes is the cap.
 */
export async function mockNotes(
  page: Page,
  state: NoteState,
  options: {
    /** Return a failure to refuse the next call to the notes table. */
    fail?: (method: string) => CharacterFailure
    /** Holds each write until the promise settles. */
    hold?: () => Promise<void> | undefined
  } = {},
) {
  const calls: string[] = []
  await page.route('**/rest/v1/notes**', async (route) => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())
    const headers = corsHeaders()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const isWrite = method !== 'GET'
    if (isWrite) calls.push(method)
    if (isWrite) await options.hold?.()
    const failure = options.fail?.(method)
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
    const refuse = (status: number, code: string, message: string) =>
      route.fulfill({ status, headers, json: { code, message } })

    const readable = (row: MockNote) => row.visibility === 'campaign' || row.author_id === accountId
    const body = method === 'GET' || method === 'DELETE' ? {} : request.postDataJSON()

    if (method === 'GET') {
      const id = eq('id')
      const campaignId = eq('campaign_id')
      const withBody = (url.searchParams.get('select') ?? '').split(',').includes('body')
      const rows = state.notes
        .filter((row) => readable(row))
        .filter((row) => (id ? row.id === id : true))
        .filter((row) => (campaignId ? row.campaign_id === campaignId : true))
        .toSorted((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((row) => {
          if (withBody) return row
          const { body: _body, ...summary } = row
          void _body
          return summary
        })
      return respond(rows)
    }

    if (method === 'POST') {
      const input = body as Partial<MockNote> & { campaign_id: string }
      if (state.notes.filter((row) => row.author_id === accountId).length >= 500) {
        return refuse(400, 'P0001', 'note_limit_reached')
      }
      if (
        input.character_id &&
        state.characterIds &&
        !state.characterIds.includes(input.character_id)
      ) {
        return refuse(400, 'P0001', 'note_character_unavailable')
      }
      const row = mockNote({ ...input, author_id: accountId })
      state.notes.push(row)
      return respond([row], 201)
    }

    const row = state.notes.find((candidate) => candidate.id === eq('id'))
    const stampFilter = eq('updated_at')
    const allowed = row && readable(row) && (!stampFilter || stampFilter === row.updated_at)
    if (method === 'PATCH') {
      if (!row || !allowed) return respond([])
      const patch = body as Partial<MockNote>
      if (patch.visibility && patch.visibility !== row.visibility && row.author_id !== accountId) {
        return refuse(403, '42501', 'note_visibility_author_only')
      }
      if (
        patch.character_id &&
        patch.character_id !== row.character_id &&
        state.characterIds &&
        !state.characterIds.includes(patch.character_id)
      ) {
        return refuse(400, 'P0001', 'note_character_unavailable')
      }
      Object.assign(row, patch, { updated_by: accountId, updated_at: nextStamp() })
      return respond([row])
    }
    if (method === 'DELETE') {
      if (!row || row.author_id !== accountId) return respond([])
      state.notes.splice(state.notes.indexOf(row), 1)
      return respond([{ id: row.id }])
    }
    return route.fallback()
  })
  return { calls }
}
