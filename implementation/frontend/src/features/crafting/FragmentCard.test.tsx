import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FragmentCard } from './FragmentCard'
import type { Fragment } from './craftingTypes'

afterEach(cleanup)

function setup(fragment: Fragment) {
  const { container } = render(
    <ul>
      <FragmentCard fragment={fragment} />
    </ul>,
  )
  return container
}

describe('FragmentCard', () => {
  it('shows an unknown item, what is held by name, and how many are still unknown', () => {
    const container = setup({ id: 'f1', new: false, held: ['Wyvern Fang'], missing: 2 })
    expect(screen.getByText('Unknown item: ???')).toBeInTheDocument()
    expect(screen.getByText('You hold Wyvern Fang.')).toBeVisible()
    expect(screen.getByText('??? ×2')).toBeInTheDocument()
    expect(container).toHaveTextContent('2 unknown key materials')
  })

  it('announces the unknown item and key material in words', () => {
    const container = setup({ id: 'f1', new: false, held: ['Wyvern Fang'], missing: 1 })
    expect(container).toHaveTextContent('Unknown item')
    expect(container).toHaveTextContent('1 unknown key material')
    expect(container).not.toHaveTextContent('1 unknown key materials')
  })

  it('carries a New badge as text', () => {
    setup({ id: 'f1', new: true, held: ['Wyvern Fang'], missing: 1 })
    expect(screen.getByText('New')).toBeVisible()
  })

  it('lists every key material held', () => {
    setup({ id: 'f1', new: false, held: ['Wyvern Fang', 'Wyvern Poison Gland'], missing: 1 })
    expect(screen.getByText('You hold Wyvern Fang, Wyvern Poison Gland.')).toBeVisible()
  })

  it('shows nothing about the recipe beyond the fragment’s own fields', () => {
    const container = setup({ id: 'f1', new: false, held: ['Wyvern Fang'], missing: 1 })
    expect(container.querySelector('table, dl, button')).toBeNull()
  })
})
