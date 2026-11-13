import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { expect, type CDPSession, type Page, test } from '@playwright/test'
import {
  campDraws,
  mockCampaignApi,
  mockRoster,
  openCamp,
  partyRoster,
  redHand,
  watchCamp,
} from '../support/campMocks.ts'

// Run with `npm run test:perf`. This builds the app and measures the production bundle in
// Chromium on the software renderer, so absolute times are only comparable between runs on
// the same machine; the draw counts, heap growth, and byte sizes are not renderer-dependent.

const budgets = {
  campChunkGzipKb: 25,
  idleDrawsPerSecond: { min: 8, max: 20 },
  heapGrowthMb: 2,
  longFrameMs: 50,
}

declare global {
  interface Window {
    __longFrames: Array<{ start: number; duration: number }>
  }
}

async function heapMb(client: CDPSession) {
  await client.send('HeapProfiler.collectGarbage')
  const { metrics } = await client.send('Performance.getMetrics')
  const used = metrics.find((metric) => metric.name === 'JSHeapUsedSize')!.value
  return used / 1024 / 1024
}

async function drawsPerSecond(page: Page, seconds: number) {
  const before = await campDraws(page)
  await page.waitForTimeout(seconds * 1000)
  return ((await campDraws(page)) - before) / seconds
}

function chunkTable() {
  const dir = 'dist/assets'
  return readdirSync(dir)
    .filter((name) => /\.(js|css)$/.test(name))
    .map((name) => {
      const bytes = readFileSync(`${dir}/${name}`)
      return { name, rawKb: bytes.length / 1024, gzipKb: gzipSync(bytes).length / 1024 }
    })
    .sort((a, b) => b.gzipKb - a.gzipKb)
}

test('the camp stays within its performance budgets', async ({ page }) => {
  const report: Record<string, unknown> = {}
  await page.addInitScript(() => {
    window.__longFrames = []
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__longFrames.push({ start: entry.startTime, duration: entry.duration })
        }
      }).observe({ type: 'long-animation-frame', buffered: true })
    } catch {
      // Not supported: the report says so below.
    }
  })
  await watchCamp(page)
  await mockCampaignApi(page, [redHand])
  await mockRoster(page, () => partyRoster(6))
  await page.setViewportSize({ width: 1440, height: 900 })
  const client = await page.context().newCDPSession(page)
  await client.send('Performance.enable')
  await client.send('HeapProfiler.enable')

  const camp = await openCamp(page)
  await expect(camp).toHaveAttribute('data-camp-state', 'idle')

  // Idle: effect frames per second.
  // The first paint decodes and palette-swaps the art; that cost is reported, not budgeted.
  await page.waitForTimeout(2000)
  report.loadLongFrames = (await page.evaluate(() => window.__longFrames)).filter(
    (frame) => frame.duration > budgets.longFrameMs,
  )
  const idleFrom = await page.evaluate(() => performance.now())
  report.idleDrawsPerSecond = await drawsPerSecond(page, 10)
  const idleTo = await page.evaluate(() => performance.now())
  const idleFrames = await page.evaluate(() => window.__longFrames)
  expect(report.idleDrawsPerSecond as number).toBeGreaterThan(budgets.idleDrawsPerSecond.min)
  expect(report.idleDrawsPerSecond as number).toBeLessThan(budgets.idleDrawsPerSecond.max)

  // Heap at 5 s and at 60 s of idle.
  const idleStart = Date.now()
  await page.waitForTimeout(Math.max(0, 5000 - (Date.now() - idleStart)))
  const heap5 = await heapMb(client)
  await page.waitForTimeout(Math.max(0, 60_000 - (Date.now() - idleStart)))
  const heap60 = await heapMb(client)
  report.heapMb = { at5s: heap5, at60s: heap60, idleGrowth: heap60 - heap5 }
  expect(heap60 - heap5).toBeLessThan(budgets.heapGrowthMb)

  // Frames over 50 ms while the camp idles (before any forced garbage collection).
  const idleLong = idleFrames.filter(
    (frame) =>
      frame.start >= idleFrom && frame.start <= idleTo && frame.duration > budgets.longFrameMs,
  )
  report.idleLongFramesOver50ms = idleLong
  expect(idleLong, 'frames over 50 ms while idle (software renderer, relative only)').toEqual([])

  // 50 cycles of open, pan (wheel), and close.
  const scene = page.locator('.camp-scene')
  const box = (await scene.boundingBox())!
  const destinations = ['Overview', 'Party', 'Campaign settings']
  for (let cycle = 0; cycle < 50; cycle += 1) {
    const name = destinations[cycle % destinations.length]!
    await page
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .first()
      .click()
    await expect(camp).toHaveAttribute('data-camp-state', /^(overview|party|settings)$/)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(cycle % 2 ? 160 : -160, 0)
    if (cycle % 2) await page.keyboard.press('Escape')
    else await page.getByRole('button', { name: 'Back to camp' }).click()
    await expect(camp).toHaveAttribute('data-camp-state', 'idle')
    await expect(camp).toHaveAttribute('data-animating', 'false')
  }
  const heapCycles = await heapMb(client)
  report.heapAfterCyclesMb = heapCycles
  report.heapGrowthAfterCyclesMb = heapCycles - heap60
  expect(heapCycles - heap60).toBeLessThan(budgets.heapGrowthMb)

  // Hidden: no draws at all.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(200)
  report.hiddenDrawsPerSecond = await drawsPerSecond(page, 3)
  expect(report.hiddenDrawsPerSecond).toBe(0)

  // During the cycles, clicks, wheel input, and forced garbage collection add long frames;
  // they are reported, not budgeted.
  const frames = await page.evaluate(() => window.__longFrames)
  const afterIdle = frames.filter(
    (frame) => frame.start > idleTo && frame.duration > budgets.longFrameMs,
  )
  report.cycleLongFrames = {
    count: afterIdle.length,
    worstMs: Math.max(0, ...afterIdle.map((f) => f.duration)),
  }

  // Weight on the wire.
  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry as PerformanceResourceTiming)
      .map((entry) => ({
        url: entry.name,
        type: entry.initiatorType,
        bytes: entry.encodedBodySize,
      })),
  )
  const imageBytes = resources
    .filter((entry) => /\.png(\?|$)/.test(entry.url))
    .reduce((sum, entry) => sum + entry.bytes, 0)
  report.imageKb = imageBytes / 1024
  const table = chunkTable()
  report.chunks = table
  const campChunk = table.find(
    (chunk) => chunk.name.startsWith('CampLandscape-') && chunk.name.endsWith('.js'),
  )!
  expect(campChunk.gzipKb).toBeLessThan(budgets.campChunkGzipKb)

  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/perf-report.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, chunks: table.slice(0, 6) }, null, 2))
})

test('reduced motion draws nothing after the first frame', async ({ page }) => {
  await watchCamp(page)
  await mockCampaignApi(page, [redHand])
  await page.setViewportSize({ width: 1440, height: 900 })
  const camp = await openCamp(page)
  // Sign-in resets the preference, so reduce motion afterwards and reload into it.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(camp).toHaveAttribute('data-camp-ready', 'true')
  await expect(camp).toHaveAttribute('data-animating', 'false')
  await page.waitForTimeout(500)
  expect(await drawsPerSecond(page, 3)).toBe(0)
})
