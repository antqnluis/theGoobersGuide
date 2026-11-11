import { expect, test } from '@playwright/test'

test('renders the setup screen and reaches the local Supabase API', async ({ page }) => {
  let healthCheckReceived = false
  await page.route('**/auth/v1/health', async (route) => {
    healthCheckReceived = true
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"status":"ok"}',
    })
  })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: "The Goober's Guide" })).toBeVisible()
  await expect(page.getByText('Connected to the local Supabase Auth API.')).toBeVisible()
  const panelBackground = await page
    .getByTestId('integration-panel')
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(panelBackground).not.toBe('rgba(0, 0, 0, 0)')
  expect(healthCheckReceived).toBe(true)
})
