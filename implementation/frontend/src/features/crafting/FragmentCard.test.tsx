import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FragmentCard } from './FragmentCard'
import type { Fragment } from './craftingTypes'

afterEach(cleanup)

function setup(fragment: Fragment, extra: Partial<Parameters<typeof FragmentCard>[0]> = {}) {
  const { container } = render(
    <ul>
      <FragmentCard fragment={fragment} {...extra} />
    </ul>,
  )
  return container
}

const lines = (container: HTMLElement) =>
  [...container.querySelectorAll('.vision-face__line')].map((line) => line.textContent)

describe('FragmentCard', () => {
  it('shows an unknown item, each held key material by name, and how many are still unknown', () => {
    const container = setup({ id: 'f1', new: false, held: ['Wyvern Fang'], missing: 2 })
    expect(screen.getByText('Unknown item: ???')).toBeInTheDocument()
    expect(lines(container)).toEqual(['Wyvern Fangheld', '???×2'.concat('2 unknown key materials')])
  })

  it('announces the unknown item and key material in words', () => {
    const container = setup({ id: 'f1', new: false, held: ['Wyvern Fang'], missing: 1 })
    expect(container).toHaveTextContent('Unknown item')
    expect(container).toHaveTextContent('1 unknown key material')
    expect(container).not.toHaveTextContent('1 unknown key materials')
  })

  it('carries a New chip as text', () => {
    setup({ id: 'f1', new: true, held: ['Wyvern Fang'], missing: 1 })
    expect(screen.getByText('New')).toBeVisible()
    expect(screen.getByText('New').closest('.journal-chip')).toHaveClass('journal-chip--new')
  })

  it('lists every key material held, then the unknown ones, as a vision card lists its own', () => {
    const container = setup({
      id: 'f1',
      new: false,
      held: ['Wyvern Fang', 'Wyvern Poison Gland'],
      missing: 1,
    })
    const rows = [...container.querySelectorAll('.vision-face__line')]
    expect(rows.map((row) => row.getAttribute('data-have'))).toEqual(['enough', 'enough', 'short'])
    expect(screen.getByText('Wyvern Poison Gland')).toBeVisible()
  })

  it('is a plate like a vision card, with nothing about the recipe beyond its own fields', () => {
    const container = setup({ id: 'f1', new: false, held: ['Wyvern Fang'], missing: 1 })
    expect(container.querySelector('li')).toHaveClass('journal-panel', 'vision-card')
    expect(container.querySelector('table, dl, button')).toBeNull()
  })

  it('marks itself for its entrance, and takes focus when asked', () => {
    const container = setup(
      { id: 'f1', new: false, held: ['Wyvern Fang'], missing: 1 },
      { entering: true, focusOnEnter: true, enterDelay: 220 },
    )
    const card = container.querySelector('li')!
    expect(card).toHaveClass('vision-card--entering')
    expect(card.style.getPropertyValue('--enter-delay')).toBe('220ms')
    expect(container.querySelector('.crafting-row__name')).toHaveFocus()
  })
})
