import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

function localClient() {
  const env = loadEnv('development', process.cwd(), 'VITE_')
  const url = new URL(env.VITE_SUPABASE_URL)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '54321') {
    throw new Error(
      'Campaign integration tests require the repository local Supabase stack on port 54321.',
    )
  }
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function localDatabaseQuery(sql: string, variables: Record<string, string>) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_backend',
      'psql',
      '-XqAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      ...Object.entries(variables).flatMap(([key, value]) => ['-v', `${key}=${value}`]),
    ],
    { input: sql, encoding: 'utf8' },
  ).trim()
}

test('connects the browser app to the running local Supabase Auth API', async ({ page }) => {
  const healthResponse = page.waitForResponse((response) =>
    response.url().endsWith('/auth/v1/health'),
  )

  await page.goto('/dev/status')

  const response = await healthResponse
  expect(response.ok()).toBe(true)
  await expect(page.getByText('Connected to the local Supabase Auth API.')).toBeVisible()
})

test('registers and signs in by username or email and enforces profile and campaign access', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const owner = localClient()
  const member = localClient()
  const emailOnly = localClient()
  const anonymous = localClient()
  const run = crypto.randomUUID().slice(0, 12).replace('-', '')
  const emailUsername = `email_${run}`
  const usernameOnly = `player_${run}`
  const email = `${emailUsername}@example.com`
  const password = crypto.randomUUID()

  const register = async (username: string, optionalEmail?: string) => {
    await page.goto('/register')
    await page.getByLabel('Username', { exact: true }).fill(username)
    if (optionalEmail) await page.getByLabel('Email address (optional)').fill(optionalEmail)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
  }
  const signIn = async (identifier: string, secret: string = password) => {
    await page.getByLabel('Username or email').fill(identifier)
    await page.getByLabel('Password', { exact: true }).fill(secret)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  }
  const signOut = async () => {
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
  }

  await register(emailUsername.toUpperCase(), email)
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByText(emailUsername, { exact: true })).toBeVisible()
  await signOut()
  await signIn(emailUsername.toUpperCase())
  await expect(page).toHaveURL(/\/app$/)
  await page.reload()
  await expect(page.getByText(emailUsername, { exact: true })).toBeVisible()
  await signOut()
  await signIn(email)
  await expect(page).toHaveURL(/\/app$/)
  await signOut()

  await register(usernameOnly)
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByText(usernameOnly, { exact: true })).toBeVisible()
  await signOut()
  await signIn(usernameOnly.toUpperCase())
  await expect(page).toHaveURL(/\/app$/)
  await signOut()

  const credentialsMessage =
    'Username, email, or password did not match. Check your details and try again.'
  await signIn(usernameOnly, 'incorrect-password')
  await expect(page.getByRole('alert')).toHaveText(credentialsMessage)
  await signIn(`missing_${run}`)
  await expect(page.getByRole('alert')).toHaveText(credentialsMessage)

  await register(usernameOnly.toUpperCase(), `duplicate_${run}@example.com`)
  await expect(page.getByRole('alert')).toContainText('Try a different username or email')

  const { data: ownerAuth, error: ownerError } = await owner.auth.signInWithPassword({
    email,
    password,
  })
  expect(ownerError).toBeNull()

  const { data: tokens, error: memberSignInError } = await member.functions.invoke(
    'sign-in-with-username',
    { body: { username: usernameOnly, password } },
  )
  expect(memberSignInError).toBeNull()
  expect(Object.keys(tokens).sort()).toEqual(['access_token', 'refresh_token'])
  const { data: memberAuth, error: memberSessionError } = await member.auth.setSession(tokens)
  expect(memberSessionError).toBeNull()

  const { data: emailOnlyAuth, error: emailOnlyError } = await emailOnly.auth.signUp({
    email: `email_only_${run}@example.com`,
    password,
  })
  expect(emailOnlyError).toBeNull()
  expect(emailOnlyAuth.session).toBeTruthy()

  for (const client of [anonymous, owner, member]) {
    const lookup = await client.rpc('resolve_username_email', {
      account_username: emailUsername,
    })
    expect(lookup.error).toBeTruthy()
    expect(lookup.data).toBeNull()
  }

  const ownerId = ownerAuth.user!.id
  const memberId = memberAuth.user!.id
  const emailOnlyId = emailOnlyAuth.user!.id
  const campaignIds: string[] = []

  try {
    await test.step('creates private profiles and limits profile updates', async () => {
      for (const [client, id, username] of [
        [owner, ownerId, emailUsername],
        [member, memberId, usernameOnly],
        [emailOnly, emailOnlyId, null],
      ] as const) {
        expect(await client.from('profiles').select('id, username')).toMatchObject({
          data: [{ id, username }],
          error: null,
        })
      }

      const { data: initial, error: initialError } = await owner
        .from('profiles')
        .select('created_at, updated_at')
        .single()
      expect(initialError).toBeNull()
      const fields = {
        display_name: 'Campaign Owner',
        avatar_url: 'https://example.com/avatar.png',
      }
      const { data: edited, error: editError } = await owner
        .from('profiles')
        .update(fields)
        .eq('id', ownerId)
        .select()
        .single()
      expect(editError).toBeNull()
      expect(edited).toMatchObject({ ...fields, created_at: initial!.created_at })
      expect(Date.parse(edited!.updated_at)).toBeGreaterThan(Date.parse(initial!.updated_at))

      expect(
        await member.from('profiles').update(fields).eq('id', ownerId).select('id'),
      ).toMatchObject({ data: [], error: null })
      for (const update of [{ id: crypto.randomUUID() }, { username: `rename_${run}` }]) {
        expect(await owner.from('profiles').update(update).eq('id', ownerId)).toMatchObject({
          error: { code: '42501' },
        })
      }
      expect(await owner.from('profiles').insert({ id: ownerId })).toMatchObject({
        error: { code: '42501' },
      })
      expect(await owner.from('profiles').delete().eq('id', ownerId)).toMatchObject({
        error: { code: '42501' },
      })
      expect((await anonymous.from('profiles').select('id')).error).toBeTruthy()
    })

    await test.step('grants campaign and roster access through membership', async () => {
      const { data: campaigns, error: campaignError } = await owner
        .from('campaigns')
        .insert([{ name: `First campaign ${run}` }, { name: `Second campaign ${run}` }])
        .select('id, owner_id, description')
      expect(campaignError).toBeNull()
      campaignIds.push(...campaigns!.map((campaign) => campaign.id))
      expect(campaigns).toMatchObject([
        { owner_id: ownerId, description: null },
        { owner_id: ownerId, description: null },
      ])
      const [firstId, secondId] = campaignIds
      const roster = (client: ReturnType<typeof localClient>, id: string) =>
        client.from('campaign_members').select('profile_id, role').eq('campaign_id', id)

      for (const id of campaignIds) {
        expect(await roster(owner, id)).toMatchObject({
          data: [{ profile_id: ownerId, role: 'owner' }],
          error: null,
        })
      }
      expect(await member.from('campaigns').select('id')).toMatchObject({ data: [], error: null })
      expect(await roster(member, firstId)).toMatchObject({ data: [], error: null })
      expect(
        await member.from('campaigns').insert({ name: 'Forged', owner_id: ownerId }),
      ).toMatchObject({ error: { code: '42501' } })
      expect((await anonymous.from('campaigns').select('id')).error).toBeTruthy()
      expect((await roster(anonymous, firstId)).error).toBeTruthy()

      const namedRoster = (client: ReturnType<typeof localClient>, id: string) =>
        client.rpc('get_campaign_roster', { p_campaign_id: id })
      const ownerRow = { profile_id: ownerId, role: 'owner', username: emailUsername }
      expect(await namedRoster(owner, firstId)).toMatchObject({ data: [ownerRow], error: null })
      expect(await namedRoster(member, firstId)).toMatchObject({ data: [], error: null })
      expect(await namedRoster(owner, crypto.randomUUID())).toMatchObject({
        data: [],
        error: null,
      })
      expect((await namedRoster(anonymous, firstId)).error).toBeTruthy()

      for (const name of ['', '   ', '\t\n']) {
        expect(await owner.from('campaigns').insert({ name })).toMatchObject({
          error: { code: '23514' },
        })
        expect(await owner.from('campaigns').update({ name }).eq('id', firstId)).toMatchObject({
          error: { code: '23514' },
        })
      }

      const fields = { name: 'Renamed campaign', description: 'Shared campaign description' }
      expect(
        await owner.from('campaigns').update(fields).eq('id', firstId).select().single(),
      ).toMatchObject({ data: fields, error: null })
      expect(
        await owner.from('campaigns').update({ owner_id: memberId }).eq('id', firstId),
      ).toMatchObject({ error: { code: '42501' } })

      for (const client of [owner, member, emailOnly, anonymous]) {
        expect(
          await client
            .from('campaign_members')
            .insert({ campaign_id: firstId, profile_id: memberId }),
        ).toMatchObject({ error: { code: '42501' } })
      }

      localDatabaseQuery(
        `insert into public.campaign_members (campaign_id, profile_id)
         values (:'first_id', :'member_id'), (:'first_id', :'email_only_id');`,
        { first_id: firstId, member_id: memberId, email_only_id: emailOnlyId },
      )

      expect(await member.from('campaigns').select('id')).toMatchObject({
        data: [{ id: firstId }],
        error: null,
      })
      expect(
        await member.from('campaigns').select('name, description').eq('id', firstId).single(),
      ).toMatchObject({ data: fields, error: null })
      expect(await member.from('campaigns').select('id').eq('id', secondId)).toMatchObject({
        data: [],
        error: null,
      })
      expect(await namedRoster(member, secondId)).toMatchObject({ data: [], error: null })
      const expectedRoster = [
        ownerRow,
        { profile_id: memberId, role: 'member', username: usernameOnly },
        { profile_id: emailOnlyId, role: 'member', username: null },
      ]
      for (const client of [owner, member, emailOnly]) {
        const result = await namedRoster(client, firstId)
        expect(result.error).toBeNull()
        expect(result.data).toHaveLength(expectedRoster.length)
        expect(result.data).toEqual(expect.arrayContaining(expectedRoster))
      }
      expect(await member.from('profiles').select('username').eq('id', ownerId)).toMatchObject({
        data: [],
        error: null,
      })
      expect(
        await member
          .from('campaign_members')
          .update({ role: 'owner' })
          .eq('campaign_id', firstId)
          .eq('profile_id', memberId),
      ).toMatchObject({ error: { code: '42501' } })
      for (const client of [owner, member]) {
        expect(
          await client.from('campaign_members').delete().eq('campaign_id', firstId),
        ).toMatchObject({ error: { code: '42501' } })
      }
      expect(
        await member.from('campaigns').update({ name: 'Changed' }).eq('id', firstId).select('id'),
      ).toMatchObject({ data: [], error: null })
      expect(await member.from('campaigns').delete().eq('id', firstId).select('id')).toMatchObject({
        data: [],
        error: null,
      })

      expect(
        await member.from('campaigns').update({ name: 'Changed' }).eq('id', secondId).select('id'),
      ).toMatchObject({ data: [], error: null })
      expect(await member.from('campaigns').delete().eq('id', secondId).select('id')).toMatchObject(
        {
          data: [],
          error: null,
        },
      )
      expect((await anonymous.from('campaigns').insert({ name: 'Anonymous' })).error).toBeTruthy()
      expect(
        (await anonymous.from('campaigns').update(fields).eq('id', firstId)).error,
      ).toBeTruthy()
      expect((await anonymous.from('campaigns').delete().eq('id', firstId)).error).toBeTruthy()
      expect(
        await owner.from('campaigns').select('name, description').eq('id', firstId).single(),
      ).toMatchObject({ data: fields, error: null })

      expect(
        await owner.from('campaigns').delete().eq('id', firstId).select('id').single(),
      ).toMatchObject({ data: { id: firstId }, error: null })
      expect(
        localDatabaseQuery(
          `select count(*) from public.campaign_members where campaign_id = :'campaign_id';`,
          { campaign_id: firstId },
        ),
      ).toBe('0')
      expect(await namedRoster(member, firstId)).toMatchObject({ data: [], error: null })
      expect(await member.from('campaigns').select('id')).toMatchObject({ data: [], error: null })
      expect(await roster(owner, secondId)).toMatchObject({
        data: [{ profile_id: ownerId, role: 'owner' }],
        error: null,
      })
      for (const [client, id] of [
        [owner, ownerId],
        [member, memberId],
        [emailOnly, emailOnlyId],
      ] as const) {
        expect((await client.auth.getUser()).data.user?.id).toBe(id)
        expect(await client.from('profiles').select('id').single()).toMatchObject({
          data: { id },
          error: null,
        })
      }
    })
  } finally {
    const cleanup = campaignIds.length
      ? await owner.from('campaigns').delete().in('id', campaignIds)
      : null
    await Promise.all([owner.auth.signOut(), member.auth.signOut(), emailOnly.auth.signOut()])
    expect(cleanup?.error ?? null).toBeNull()
  }
})
