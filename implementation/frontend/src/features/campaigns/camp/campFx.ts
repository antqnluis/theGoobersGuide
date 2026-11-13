// Procedural pixels for the camp: the fire and its light, embers, smoke, the
// hearth star, twinkling stars, and each world's drifting particles. Every
// function is pure and deterministic in the tick, so tests can check shapes and
// the renderer holds no animation state. Rectangles are in panorama pixels and
// painted on a separate canvas above the art, so the art's own colours stay
// exactly on the master palette.

import { firePit } from './campLayout'
import type { CampKind } from './campPalette'
import { masterFixed } from './masterPalette'

export type FxRect = { x: number; y: number; w: number; h: number; color: string; alpha?: number }

const fire = masterFixed.fire
const star = masterFixed.star
const canvas = masterFixed.canvas
const glow = masterFixed.glow

/** A deterministic number in [0, 1) from up to three integers. */
export function hash01(a: number, b = 0, c = 0) {
  let value =
    Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296
}

/** Where the flames rise: the middle of the stone ring. */
export const flameBase = { x: firePit.x, y: 230 }

const flameHalfWidth = 6

/**
 * The flame, column by column, in the fire ramp: hottest at the base and centre,
 * ember red at the tips. `flare` (0 to 1) swells it for the landfall, `lift`
 * (0 to 1) brightens it while the campfire is hovered or focused.
 */
export function flame(tick: number, flare = 0, lift = 0): FxRect[] {
  const rects: FxRect[] = []
  const sway = [-1, 0, 1, 0][Math.floor(tick / 2) % 4]
  for (let dx = -flameHalfWidth; dx <= flameHalfWidth; dx += 1) {
    const profile = 1 - (Math.abs(dx) / (flameHalfWidth + 1)) ** 1.6
    const flicker = Math.floor(hash01(tick, dx, 7) * 5) - 2
    const height = Math.max(0, Math.round(13 * profile + flicker + flare * 9 + lift * 3))
    let run: { index: number; start: number } | null = null
    const close = (end: number) => {
      if (!run) return
      rects.push({
        x: flameBase.x + dx + (end / height > 0.6 ? sway : 0),
        y: flameBase.y - end,
        w: 1,
        h: end - run.start,
        color: fire[run.index],
      })
      run = null
    }
    for (let row = 0; row < height; row += 1) {
      const heat = (1 - row / height) * (0.4 + 0.6 * profile) + lift * 0.08
      const index = heat > 0.78 ? 4 : heat > 0.58 ? 3 : heat > 0.38 ? 2 : heat > 0.2 ? 1 : 0
      if (run && run.index !== index) {
        close(row)
      }
      run ??= { index, start: row }
    }
    close(height)
  }
  return rects
}

/** Stepped ellipses of warm light around the fire, flickering with the flame. */
export function firelight(tick: number, flare = 0, lift = 0): FxRect[] {
  const rects: FxRect[] = []
  const breathe = 0.85 + 0.15 * hash01(tick, 3, 1)
  const radii: Array<[number, number]> = [
    [64, 24],
    [44, 16],
    [26, 10],
  ]
  const alpha = (0.045 + flare * 0.05 + lift * 0.02) * breathe
  for (const [rx, ry] of radii) {
    for (let dy = -ry; dy <= ry; dy += 1) {
      const half = Math.round(rx * Math.sqrt(1 - (dy / ry) ** 2))
      rects.push({
        x: flameBase.x - half,
        y: flameBase.y - 4 + dy,
        w: half * 2,
        h: 1,
        color: fire[3],
        alpha,
      })
    }
  }
  return rects
}

const emberCount = 10

/** Sparks that rise from the fire, sway, and fade from yellow to ember red. */
export function embers(tick: number, flare = 0): FxRect[] {
  const rects: FxRect[] = []
  const count = emberCount + Math.round(flare * 8)
  for (let index = 0; index < count; index += 1) {
    const period = 18 + Math.floor(hash01(index, 1) * 14)
    const age = (tick + Math.floor(hash01(index, 2) * period)) % period
    const progress = age / period
    const drift = (hash01(index, 3) - 0.5) * 16 * progress
    const zigzag = Math.round(Math.sin((age + index) / 2.3) * 1.5)
    rects.push({
      x: flameBase.x + Math.round((hash01(index, 4) - 0.5) * 8 + drift) + zigzag,
      y: flameBase.y - 8 - Math.round(progress * (40 + flare * 20)),
      w: 1,
      h: 1,
      color: progress < 0.35 ? fire[3] : progress < 0.7 ? fire[2] : fire[1],
      alpha: 1 - progress ** 2,
    })
  }
  return rects
}

const smokeCount = 5

/** Slow grey puffs that climb past the flame and thin out. */
export function smoke(tick: number): FxRect[] {
  const rects: FxRect[] = []
  for (let index = 0; index < smokeCount; index += 1) {
    const period = 48
    const age = (tick + index * Math.floor(period / smokeCount)) % period
    const progress = age / period
    const size = 2 + Math.round(progress * 3)
    rects.push({
      x:
        flameBase.x +
        Math.round(Math.sin(progress * 5 + index * 1.7) * 4 + progress * 6) -
        Math.floor(size / 2),
      y: flameBase.y - 22 - Math.round(progress * 40),
      w: size,
      h: size,
      color: canvas[1],
      alpha: 0.32 * (1 - progress),
    })
  }
  return rects
}

/** The area the particles may fill, in panorama pixels. */
export type FxArea = { left: number; right: number; top: number; bottom: number }

type ParticleKind = {
  count: number
  /** Builds one particle; `at` is its deterministic slot. */
  make: (index: number, tick: number, area: FxArea) => FxRect | null
}

const wrap = (value: number, size: number) => ((value % size) + size) % size

const particleKinds: Record<CampKind, ParticleKind> = {
  // Fireflies wander near the grass and blink on and off.
  terrestrial: {
    count: 34,
    make(index, tick) {
      const period = 20 + Math.floor(hash01(index, 1) * 12)
      const lit = (tick + Math.floor(hash01(index, 2) * period)) % period < period * 0.6
      if (!lit) return null
      const x = hash01(index, 3) * 960 + Math.round(Math.sin(tick / (9 + (index % 5)) + index) * 7)
      const y =
        168 + hash01(index, 4) * 70 + Math.round(Math.cos(tick / (11 + (index % 4)) + index) * 4)
      return { x: Math.round(x), y: Math.round(y), w: 1, h: 1, color: fire[4], alpha: 0.95 }
    },
  },
  // Sand streaks blow across the dunes.
  desert: {
    count: 30,
    make(index, tick) {
      const speed = 1.4 + hash01(index, 1) * 1.6
      return {
        x: Math.round(wrap(hash01(index, 2) * 960 + tick * speed, 960)),
        y: Math.round(150 + hash01(index, 3) * 100 + Math.sin(tick / 12 + index) * 2),
        w: 3,
        h: 1,
        color: canvas[3],
        alpha: 0.35 + hash01(index, 4) * 0.25,
      }
    },
  },
  // Embers lift off the basalt.
  volcanic: {
    count: 24,
    make(index, tick) {
      const speed = 0.7 + hash01(index, 1) * 0.9
      const rise = wrap(tick * speed + hash01(index, 2) * 140, 140)
      const progress = rise / 140
      return {
        x: Math.round(hash01(index, 3) * 960 + Math.sin(tick / 8 + index) * 5),
        y: Math.round(262 - rise),
        w: 1,
        h: 1,
        color: progress < 0.5 ? fire[2] : fire[1],
        alpha: 1 - progress ** 1.5,
      }
    },
  },
  // Snow falls through the whole view, sky included.
  frozen: {
    count: 44,
    make(index, tick, area) {
      const span = 270 - area.top
      const speed = 0.7 + hash01(index, 1) * 0.8
      return {
        x: Math.round(hash01(index, 2) * 960 + Math.sin(tick / 10 + index) * 4),
        y: Math.round(area.top + wrap(hash01(index, 3) * span + tick * speed, span)),
        w: hash01(index, 4) > 0.8 ? 2 : 1,
        h: hash01(index, 4) > 0.8 ? 2 : 1,
        color: hash01(index, 5) > 0.5 ? star[0] : star[1],
        alpha: 0.9,
      }
    },
  },
  // Dust motes hang and drift in the scree.
  rocky: {
    count: 22,
    make(index, tick) {
      return {
        x: Math.round(wrap(hash01(index, 1) * 960 + tick * 0.25, 960)),
        y: Math.round(170 + hash01(index, 2) * 80 + Math.sin(tick / 14 + index) * 3),
        w: 1,
        h: 1,
        color: canvas[2],
        alpha: 0.4,
      }
    },
  },
  // Pale wisps slide along the cloud reef.
  gas: {
    count: 14,
    make(index, tick) {
      return {
        x: Math.round(wrap(hash01(index, 1) * 960 + tick * (0.4 + hash01(index, 2) * 0.5), 960)),
        y: Math.round(150 + hash01(index, 3) * 100 + Math.sin(tick / 16 + index * 2) * 4),
        w: 5,
        h: 1,
        color: glow[2],
        alpha: 0.28,
      }
    },
  },
}

/** The world's drifting particles that fall inside `area`. */
export function particles(kind: CampKind, tick: number, area: FxArea): FxRect[] {
  const { count, make } = particleKinds[kind]
  const rects: FxRect[] = []
  for (let index = 0; index < count; index += 1) {
    const rect = make(index, tick, area)
    if (!rect) continue
    // Wide views repeat the panorama, so a particle may show at more than one x.
    for (const shift of [-960, 0, 960]) {
      const x = rect.x + shift
      if (
        x + rect.w >= area.left &&
        x <= area.right &&
        rect.y >= area.top &&
        rect.y <= area.bottom
      ) {
        rects.push({ ...rect, x })
      }
    }
  }
  return rects
}

/**
 * Sky effects are placed in sky-layer pixels and kept above every ridge line
 * (the highest peak is at row 60), so they never draw over a hill.
 */
export const skyFxBottom = 56

/** Where the warm hearth star hangs, low in the sky. */
export const hearthStar = { x: 340, y: 46 }

const twinkleCount = 28

/** Extra stars that blink at their own pace, never over the hearth star. */
export function twinkles(tick: number, area: FxArea): FxRect[] {
  const rects: FxRect[] = []
  for (let index = 0; index < twinkleCount; index += 1) {
    const period = 7 + Math.floor(hash01(index, 1) * 9)
    if ((tick + Math.floor(hash01(index, 2) * period)) % period > 2) continue
    const x = Math.round(hash01(index, 3) * 960)
    const span = skyFxBottom - area.top
    const y = Math.round(area.top + hash01(index, 4) * span)
    if (Math.abs(x - hearthStar.x) < 12 && Math.abs(y - hearthStar.y) < 12) continue
    for (const shift of [-960, 0, 960]) {
      if (x + shift >= area.left && x + shift <= area.right) {
        rects.push({
          x: x + shift,
          y,
          w: 1,
          h: 1,
          color: hash01(index, 5) > 0.5 ? star[1] : star[0],
        })
      }
    }
  }
  return rects
}

/** The hearth star: a warm core with four rays and a breathing halo. */
export function hearth(tick: number): FxRect[] {
  const { x, y } = hearthStar
  const breath = 0.5 + 0.5 * Math.sin(tick / 6)
  const rects: FxRect[] = []
  for (const [radius, alpha] of [
    [13, 0.05],
    [9, 0.07],
    [6, 0.1],
  ] as const) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      const half = Math.round(Math.sqrt(radius * radius - dy * dy))
      rects.push({
        x: x - half,
        y: y + dy,
        w: half * 2 + 1,
        h: 1,
        color: fire[3],
        alpha: alpha + breath * 0.025,
      })
    }
  }
  // Core and rays.
  rects.push({ x: x - 1, y: y - 1, w: 3, h: 3, color: fire[4] })
  const ray = 3 + Math.round(breath)
  rects.push({ x: x - ray, y, w: ray * 2 + 1, h: 1, color: fire[3] })
  rects.push({ x, y: y - ray, w: 1, h: ray * 2 + 1, color: fire[3] })
  rects.push({ x, y, w: 1, h: 1, color: star[1] })
  return rects
}
