// Phone Safari (the `mobile-safari` project, opt-in with PW_ALL=1). The wider camp
// suite assumes a mouse and a wheel, which mobile WebKit does not offer, so this
// covers what a phone does: tap, read, and scroll the page.
import { expect, test } from '@playwright/test'
import { mockCampaignApi, mockRoster, openCamp, partyRoster, redHand } from './support/campMocks.ts'

test('draws the camp and opens each place by tap', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-safari', 'phone Safari only')
  await mockCampaignApi(page, [redHand])
  await mockRoster(page, () => partyRoster(5))
  const camp = await openCamp(page)

  const canvas = page.locator('[data-camp-canvas]')
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) => {
        const box = element.getBoundingClientRect()
        return (
          element.width === Math.round(box.width * window.devicePixelRatio) &&
          element.height === Math.round(box.height * window.devicePixelRatio)
        )
      }),
    )
    .toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => document.documentElement.clientWidth),
  )

  // Places is the complete route on a phone, with touch-sized targets.
  const places = page.getByRole('list', { name: 'Camp places' })
  for (const name of [/^Overview/, /^Party/, /^Adventures/, /^Notes/, /^Campaign settings/]) {
    const button = places.getByRole('button', { name })
    await expect(button).toBeVisible()
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }

  await places.getByRole('button', { name: /^Party/ }).tap()
  await expect(camp).toHaveAttribute('data-camp-state', 'party')
  const sheet = page.getByRole('dialog')
  expect((await sheet.boundingBox())!.width).toBeGreaterThanOrEqual(
    (await page.evaluate(() => window.visualViewport!.width)) - 1,
  )
  await page.getByRole('button', { name: 'Back to camp' }).tap()
  await expect(camp).toHaveAttribute('data-camp-state', 'idle')

  // The waystone shortcut is pointer-only and stays out of the way.
  await expect(page.locator('[data-camp-waystone]')).toBeHidden()
})
