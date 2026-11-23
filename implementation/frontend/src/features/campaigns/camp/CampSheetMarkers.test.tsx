import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CampSheetMarkers } from './CampSheetMarkers'
import type { SheetMarker } from './campSheets'

afterEach(cleanup)

const marker = (overrides: Partial<SheetMarker> = {}): SheetMarker => ({
  profileId: 'p1',
  characterId: 'c1',
  characterName: 'Brand',
  x: 120,
  y: 240,
  ...overrides,
})

describe('CampSheetMarkers', () => {
  it('renders nothing without shared sheets', () => {
    const { container } = render(<CampSheetMarkers attention={{}} markers={[]} onOpen={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('gives each shared sheet a labelled button with a word, not colour alone', () => {
    render(
      <CampSheetMarkers
        attention={{}}
        markers={[marker(), marker({ profileId: 'p2', characterId: 'c2', characterName: 'Ila' })]}
        onOpen={vi.fn()}
      />,
    )
    const brand = screen.getByRole('button', { name: "View Brand's shared sheet" })
    expect(brand).toHaveTextContent('Sheet')
    expect(brand).toHaveAttribute('data-camp-sheet-at', '120,240')
    expect(brand).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.getByRole('button', { name: "View Ila's shared sheet" })).toBeInTheDocument()
  })

  it('opens the sheet from a click and from the keyboard', async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    render(<CampSheetMarkers attention={{}} markers={[marker()]} onOpen={onOpen} />)
    const button = screen.getByRole('button', { name: "View Brand's shared sheet" })
    await user.click(button)
    expect(onOpen).toHaveBeenLastCalledWith(marker(), button)
    button.focus()
    await user.keyboard('{Enter}')
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('passes hover and focus through so the bedroll circle is outlined', async () => {
    const onPointerEnter = vi.fn()
    const onFocus = vi.fn()
    const user = userEvent.setup()
    render(
      <CampSheetMarkers
        attention={{ onFocus, onPointerEnter }}
        markers={[marker()]}
        onOpen={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: "View Brand's shared sheet" })
    await user.hover(button)
    expect(onPointerEnter).toHaveBeenCalled()
    await user.tab()
    expect(onFocus).toHaveBeenCalled()
  })
})
