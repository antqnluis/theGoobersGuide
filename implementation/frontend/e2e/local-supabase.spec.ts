import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

function localClient() {
  const env = loadEnv('development', process.cwd(), 'VITE_')
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
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

test('registers and signs in by username or email while preserving campaign access', async ({
  page,
}) => {
  test.setTimeout(60_000)
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

  const owner = localClient()
  const visitor = localClient()
  const anonymous = localClient()
  const { data: ownerAuth, error: ownerError } = await owner.auth.signInWithPassword({
    email,
    password,
  })
  expect(ownerError).toBeNull()

  const { data: tokens, error: visitorError } = await visitor.functions.invoke(
    'sign-in-with-username',
    { body: { username: usernameOnly, password } },
  )
  expect(visitorError).toBeNull()
  expect(Object.keys(tokens).sort()).toEqual(['access_token', 'refresh_token'])
  expect((await visitor.auth.setSession(tokens)).error).toBeNull()

  for (const client of [anonymous, owner]) {
    const lookup = await client.rpc('resolve_username_email', {
      account_username: emailUsername,
    })
    expect(lookup.error).toBeTruthy()
    expect(lookup.data).toBeNull()
  }

  const { data: campaign, error: campaignError } = await owner
    .from('campaigns')
    .insert({ name: `Auth test ${run}` })
    .select('id, owner_id')
    .single()
  expect(campaignError).toBeNull()
  expect(campaign?.owner_id).toBe(ownerAuth.user?.id)

  try {
    const id = campaign!.id
    expect(await visitor.from('campaigns').select('id').eq('id', id)).toMatchObject({
      data: [],
      error: null,
    })
    expect(
      await visitor.from('campaigns').update({ name: 'Changed' }).eq('id', id).select('id'),
    ).toMatchObject({ data: [], error: null })
    expect(await visitor.from('campaigns').delete().eq('id', id).select('id')).toMatchObject({
      data: [],
      error: null,
    })
    expect(
      (await visitor.from('campaigns').insert({ name: 'Forged', owner_id: campaign!.owner_id }))
        .error,
    ).toBeTruthy()
    expect((await anonymous.from('campaigns').select('id').eq('id', id)).error).toBeTruthy()
    expect((await owner.from('campaigns').select('id').eq('id', id).single()).error).toBeNull()
  } finally {
    expect((await owner.from('campaigns').delete().eq('id', campaign!.id)).error).toBeNull()
    await Promise.all([owner.auth.signOut(), visitor.auth.signOut()])
  }
})
