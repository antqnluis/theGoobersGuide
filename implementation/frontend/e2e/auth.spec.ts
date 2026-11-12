import { expect, test } from '@playwright/test'

const accountEmail = 'player@example.com'
const now = new Date().toISOString()
const authSession = {
  access_token: 'mock-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mock-refresh-token',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: accountEmail,
    email_confirmed_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: now,
    updated_at: now,
  },
}

test('guards the app, restores a signed-in session, and signs out', async ({ page }) => {
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(authSession),
    })
  })
  await page.route('**/auth/v1/logout**', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })

  await page.goto('/app')
  await expect(page).toHaveURL(/\/login$/)

  const signIn = page.getByRole('region', { name: 'Sign in' })
  await signIn.getByLabel('Username or email').fill(accountEmail)
  const password = signIn.getByLabel('Password', { exact: true })
  await password.fill('adventure1')
  await expect(password).toHaveAttribute('type', 'password')
  await signIn.getByRole('button', { name: 'Show password', exact: true }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await signIn.getByRole('button', { name: 'Hide password', exact: true }).click()
  await expect(password).toHaveAttribute('type', 'password')
  await signIn.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: "You're signed in." })).toBeVisible()
  await expect(page.getByText(accountEmail)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: "You're signed in." })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('creates an account from the registration route', async ({ page }) => {
  await page.route('**/auth/v1/signup**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...authSession,
        user: { ...authSession.user, user_metadata: { username: 'player_one' } },
      }),
    })
  })

  await page.goto('/register')
  await expect(page.getByRole('link', { name: 'Create account' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  const registration = page.getByRole('region', { name: 'Create account' })
  await registration.getByLabel('Username', { exact: true }).fill('Player_One')
  const password = registration.getByLabel('Password', { exact: true })
  await password.fill('adventure1')
  const confirmation = registration.getByLabel('Confirm password', { exact: true })
  await confirmation.fill('incorrect')
  await registration.getByRole('button', { name: 'Create account' }).click()
  await expect(registration.getByText('Passwords do not match.')).toBeVisible()
  await confirmation.fill('adventure1')

  await password.press('Tab')
  const show = registration.getByRole('button', { name: 'Show password', exact: true })
  await expect(show).toBeFocused()
  await show.press('Space')
  await expect(password).toHaveAttribute('type', 'text')
  await expect(confirmation).toHaveAttribute('type', 'password')
  await registration.getByRole('button', { name: 'Hide password', exact: true }).press('Space')
  await expect(password).toHaveAttribute('type', 'password')
  await registration.getByRole('button', { name: 'Show password confirmation' }).click()
  await expect(confirmation).toHaveAttribute('type', 'text')
  await registration.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByText('player_one')).toBeVisible()
})

test('account navigation focuses the selected form on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/login')
  await expect(page.getByRole('region', { name: 'Create account' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Create account' }).click()

  const registrationHeading = page.locator('#register-heading')
  const registration = page.getByRole('region', { name: 'Create account' })
  await expect(page).toHaveURL(/\/register#register-heading$/)
  await expect(page.getByRole('region', { name: 'Sign in' })).toHaveCount(0)
  await expect(registrationHeading).toBeFocused()
  await expect(registrationHeading).toBeInViewport()
  const submit = registration.getByRole('button', { name: 'Create account' })
  await submit.scrollIntoViewIfNeeded()
  await expect(submit).toBeInViewport()

  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('link', { name: 'Sign in instead' }).click()
  await expect(page.getByRole('region', { name: 'Sign in' })).toBeVisible()
  await expect(registration).toHaveCount(0)
  await expect(page.locator('.auth-routes__page')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.auth-switch__content')).toHaveCSS('animation-name', 'none')
})

test('moves the same account panel between the left and right on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/login')

  const panel = page.locator('.auth-routes__panel')
  const track = page.locator('.auth-routes')
  const switchPanel = page.locator('.auth-switch')
  const switchStart = await switchPanel.boundingBox()
  const leftPosition = await panel.boundingBox()
  const trackPosition = await track.boundingBox()
  expect(leftPosition).not.toBeNull()
  expect(trackPosition).not.toBeNull()
  expect(switchStart!.x).toBeGreaterThan(leftPosition!.x)
  expect(Math.abs(leftPosition!.x - trackPosition!.x)).toBeLessThan(1)

  await panel.evaluate((element) => element.setAttribute('data-test-persistent', 'yes'))
  await page.getByRole('link', { name: 'Create account', exact: true }).click()
  await expect(panel).toHaveAttribute('data-test-persistent', 'yes')
  await expect
    .poll(async () => {
      const position = (await panel.boundingBox())!
      return Math.abs(position.x + position.width - trackPosition!.x - trackPosition!.width)
    })
    .toBeLessThan(2)
  await expect
    .poll(async () => (await switchPanel.boundingBox())!.x)
    .toBeLessThan(leftPosition!.x + 2)

  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeLessThan(leftPosition!.x + 2)
  await expect(page.getByRole('region', { name: 'Create account' })).toHaveCount(0)
})
