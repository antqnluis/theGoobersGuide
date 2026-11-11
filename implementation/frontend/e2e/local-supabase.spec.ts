import { expect, test } from '@playwright/test'

test('connects the browser app to the running local Supabase Auth API', async ({ page }) => {
  const healthResponse = page.waitForResponse((response) =>
    response.url().endsWith('/auth/v1/health'),
  )

  await page.goto('/')

  const response = await healthResponse
  expect(response.ok()).toBe(true)
  await expect(page.getByText('Connected to the local Supabase Auth API.')).toBeVisible()
})
