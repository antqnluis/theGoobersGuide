import { afterEach, describe, expect, it } from 'vitest'
import {
  clampPosition,
  clampSize,
  defaultLayout,
  loadLayout,
  minTraySize,
  parseLayout,
  saveLayout,
} from './diceLayout'

afterEach(() => window.localStorage.clear())

describe('clampPosition', () => {
  const bounds = { width: 1000, height: 800 }
  const tray = { width: 400, height: 300 }

  it('keeps a tray that is in reach where it is', () => {
    expect(clampPosition({ right: 120, bottom: 80 }, bounds, tray)).toEqual({
      right: 120,
      bottom: 80,
    })
  })

  it('stops the tray at every edge of the screen', () => {
    expect(clampPosition({ right: -30, bottom: -5 }, bounds, tray)).toEqual({ right: 0, bottom: 0 })
    expect(clampPosition({ right: 900, bottom: 900 }, bounds, tray)).toEqual({
      right: 600,
      bottom: 500,
    })
  })

  it('pins a tray bigger than the screen to the corner', () => {
    expect(clampPosition({ right: 50, bottom: 50 }, { width: 300, height: 200 }, tray)).toEqual({
      right: 0,
      bottom: 0,
    })
  })
})

describe('clampSize', () => {
  const bounds = { width: 1000, height: 800 }
  const anchor = { right: 100, bottom: 50 }

  it('never goes below a usable size', () => {
    expect(clampSize({ width: 40, height: 40 }, bounds, anchor)).toEqual(minTraySize)
  })

  it('stops short of the screen edge', () => {
    expect(clampSize({ width: 5000, height: 5000 }, bounds, anchor)).toEqual({
      width: 900,
      height: 750,
    })
  })

  it('rounds to whole pixels', () => {
    expect(clampSize({ width: 400.6, height: 500.4 }, bounds, anchor)).toEqual({
      width: 401,
      height: 500,
    })
  })
})

describe('parseLayout', () => {
  it('reads a saved layout', () => {
    expect(
      parseLayout({
        pinned: true,
        position: { right: 20, bottom: 30 },
        size: { width: 500, height: 600 },
      }),
    ).toEqual({
      pinned: true,
      position: { right: 20, bottom: 30 },
      size: { width: 500, height: 600 },
    })
  })

  it('ignores anything that is not a layout', () => {
    expect(parseLayout(null)).toEqual(defaultLayout)
    expect(parseLayout('nope')).toEqual(defaultLayout)
    expect(
      parseLayout({
        pinned: 'yes',
        position: { right: 'far', bottom: 3 },
        size: { width: Infinity, height: 400 },
      }),
    ).toEqual(defaultLayout)
    expect(parseLayout({ position: { right: -1, bottom: 3 } }).position).toBeNull()
  })

  it('lifts a saved size that is too small to use', () => {
    expect(parseLayout({ size: { width: 10, height: 10 } }).size).toEqual(minTraySize)
  })
})

describe('storage', () => {
  it('round-trips a layout', () => {
    const layout = {
      pinned: true,
      position: { right: 24, bottom: 40 },
      size: { width: 480, height: 520 },
    }
    saveLayout(layout)
    expect(loadLayout()).toEqual(layout)
  })

  it('forgets a layout that is back to the default', () => {
    saveLayout({ pinned: true, position: null, size: null })
    saveLayout(defaultLayout)
    expect(window.localStorage.length).toBe(0)
    expect(loadLayout()).toEqual(defaultLayout)
  })

  it('survives unreadable storage', () => {
    window.localStorage.setItem('goobers-guide.dice-layout.v1', '{not json')
    expect(loadLayout()).toEqual(defaultLayout)
  })
})
