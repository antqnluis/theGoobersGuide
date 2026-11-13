import { describe, expect, it } from 'vitest'
import { planetAppearance } from '../planetModel'
import {
  backgroundChoices,
  isCampBackground,
  readBackground,
  worldFor,
  writeBackground,
} from './campBackground'

function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

const broken = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

describe('camp background choices', () => {
  it('offers the campaign’s own world and all six worlds, once each', () => {
    const values = backgroundChoices.map(({ value }) => value)
    expect(values[0]).toBe('campaign')
    expect(new Set(values)).toEqual(
      new Set(['campaign', 'terrestrial', 'desert', 'volcanic', 'frozen', 'rocky', 'gas']),
    )
    expect(new Set(values).size).toBe(values.length)
    for (const { label, detail } of backgroundChoices) expect(label && detail).toBeTruthy()
  })

  it('accepts only known values', () => {
    expect(isCampBackground('desert')).toBe(true)
    expect(isCampBackground('campaign')).toBe(true)
    expect(isCampBackground('lava')).toBe(false)
    expect(isCampBackground(null)).toBe(false)
  })
})

describe('saving the choice', () => {
  it('defaults to the campaign’s world', () => {
    expect(readBackground(fakeStorage(), 'a')).toBe('campaign')
    expect(readBackground(null, 'a')).toBe('campaign')
  })

  it('remembers a choice per campaign', () => {
    const storage = fakeStorage()
    writeBackground(storage, 'a', 'desert')
    writeBackground(storage, 'b', 'frozen')
    expect(readBackground(storage, 'a')).toBe('desert')
    expect(readBackground(storage, 'b')).toBe('frozen')
    expect(readBackground(storage, 'c')).toBe('campaign')
  })

  it('forgets the entry when the campaign’s world is chosen again', () => {
    const storage = fakeStorage()
    writeBackground(storage, 'a', 'gas')
    writeBackground(storage, 'a', 'campaign')
    expect(storage.items.size).toBe(0)
    expect(readBackground(storage, 'a')).toBe('campaign')
  })

  it('ignores corrupt values and survives storage that throws', () => {
    expect(readBackground(fakeStorage({ 'camp-background:a': 'banana' }), 'a')).toBe('campaign')
    expect(readBackground(broken, 'a')).toBe('campaign')
    expect(() => writeBackground(broken, 'a', 'rocky')).not.toThrow()
  })
})

describe('worldFor', () => {
  const planet = planetAppearance('00000000-0000-4000-8000-000000000011')

  it('keeps the planet by default and otherwise wears its colours in the chosen landscape', () => {
    expect(worldFor(planet, 'campaign')).toBe(planet)
    const other = planet.kind === 'desert' ? 'frozen' : 'desert'
    const world = worldFor(planet, other)
    expect(world.kind).toBe(other)
    expect(world.palette).toEqual(planet.palette)
  })
})
