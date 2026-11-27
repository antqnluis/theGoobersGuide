import type { ComponentProps } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { daggerVision, oilVision } from './craftingTestData'
import type { Vision } from './craftingTypes'
import { VisionCard } from './VisionCard'

afterEach(cleanup)

function setup(
  vision: Vision,
  pending = false,
  extra: Partial<ComponentProps<typeof VisionCard>> = {},
) {
  const onToggleSaved = vi.fn()
  render(
    <ul>
      <VisionCard onToggleSaved={onToggleSaved} pending={pending} vision={vision} {...extra} />
    </ul>,
  )
  return { onToggleSaved, user: userEvent.setup() }
}

describe('VisionCard', () => {
  it('names the output, its rarity, what is new, and what is still to pay', () => {
    setup(daggerVision)
    expect(screen.getByText('Wyvern Fang Dagger')).toBeVisible()
    expect(screen.getByText('Uncommon')).toBeVisible()
    expect(screen.getByText('New')).toBeVisible()
    // 1 more fang (40 gp) and the 70 gp crafting cost.
    expect(screen.getByText('110 gp still to pay, 1 material missing')).toBeVisible()
  })

  it('shows each material as text with how many are held', async () => {
    const { user } = setup(daggerVision)
    await user.click(screen.getByText('Wyvern Fang Dagger'))
    const fang = screen.getByRole('row', { name: /Wyvern Fang × 2/ })
    expect(within(fang).getByText('have 1 of 2')).toBeVisible()
    expect(within(fang).getByText('(key)')).toBeVisible()
    expect(within(fang).getByText('80 gp')).toBeVisible()
    const gland = screen.getByRole('row', { name: /Wyvern Poison Gland/ })
    expect(within(gland).getByText('have 1 of 1')).toBeVisible()
  })

  it('totals the materials and the crafting cost, key materials included', async () => {
    const { user } = setup(daggerVision)
    await user.click(screen.getByText('Wyvern Fang Dagger'))
    const total = screen.getByRole('row', { name: /^Total/ })
    expect(within(total).getByText('130 gp in materials')).toBeVisible()
    expect(within(total).getByText('200 gp')).toBeVisible()
    const toPay = screen.getByRole('row', { name: /^Still to pay/ })
    expect(within(toPay).getByText('110 gp')).toBeVisible()
  })

  it('shows time, tools, requirements, the check, and notes when there are some', async () => {
    const { user } = setup(oilVision)
    await user.click(screen.getByText('Venom Blade Oil'))
    expect(screen.getByText('Workdays').nextSibling).toHaveTextContent('5')
    expect(screen.getByText('Tools').nextSibling).toHaveTextContent("Poisoner's Kit")
    expect(screen.getByText('Check').nextSibling).toHaveTextContent('Alchemist’s Supplies DC 12')
    expect(screen.getByText('Notes').nextSibling).toHaveTextContent('Best brewed fresh.')
    expect(screen.queryByText('Requirements')).not.toBeInTheDocument()
    expect(screen.queryByText('New')).not.toBeInTheDocument()
  })

  it('says when nothing is left to pay', () => {
    setup({
      ...oilVision,
      crafting_cost_cp: 0,
      lines: oilVision.lines.map((line) => ({ ...line, have: line.need })),
    })
    expect(screen.getByText('Nothing left to pay')).toBeVisible()
  })

  it('offers to save a vision, and to remove a saved one', async () => {
    const { onToggleSaved, user } = setup(daggerVision)
    await user.click(screen.getByText('Wyvern Fang Dagger'))
    await user.click(screen.getByRole('button', { name: /^Save this vision/ }))
    expect(onToggleSaved).toHaveBeenCalledWith(daggerVision)
    cleanup()

    const saved = setup({ ...daggerVision, saved: true })
    expect(screen.getByText('Saved')).toBeVisible()
    await saved.user.click(screen.getByText('Wyvern Fang Dagger'))
    await saved.user.click(screen.getByRole('button', { name: /^Remove from saved/ }))
    expect(saved.onToggleSaved).toHaveBeenCalledOnce()
  })

  it('disables saving while another change is under way', async () => {
    const { user } = setup(daggerVision, true)
    await user.click(screen.getByText('Wyvern Fang Dagger'))
    expect(screen.getByRole('button', { name: /^Save this vision/ })).toBeDisabled()
  })

  it('describes attunement for the output, with a note when there is one', async () => {
    const { user } = setup({
      ...daggerVision,
      output: { ...daggerVision.output, attunement: true },
    })
    await user.click(screen.getByText('Wyvern Fang Dagger'))
    expect(screen.getByText('Requires attunement')).toBeVisible()
    cleanup()

    const noted = setup({
      ...daggerVision,
      output: { ...daggerVision.output, attunement: 'by a smith' },
    })
    await noted.user.click(screen.getByText('Wyvern Fang Dagger'))
    expect(screen.getByText('Requires attunement (by a smith)')).toBeVisible()
  })

  it('shows a quantity above one beside the name', () => {
    setup({ ...oilVision, output: { ...oilVision.output, quantity: 3 } })
    expect(screen.getByText('Venom Blade Oil × 3')).toBeVisible()
  })

  describe('the face', () => {
    it('lists each material with how many are held of how many are needed', () => {
      setup(daggerVision)
      const card = screen.getByText('Wyvern Fang Dagger').closest('li')!
      const lines = card.querySelectorAll('.vision-face__line')
      expect([...lines].map((line) => line.textContent)).toEqual([
        'Wyvern Fang1 of 2',
        'Wyvern Poison Gland1 of 1',
      ])
      expect(lines[0]).toHaveAttribute('data-have', 'short')
      expect(lines[1]).toHaveAttribute('data-have', 'enough')
    })

    it('says how many more materials there are past the first five', () => {
      const lines = Array.from({ length: 7 }, (_, index) => ({
        ...daggerVision.lines[0],
        item_id: `item-${index}`,
        name: `Material ${index}`,
      }))
      setup({ ...daggerVision, lines })
      expect(screen.getByText('and 2 more materials')).toBeVisible()
      expect(screen.queryByText('Material 5')).not.toBeInTheDocument()
    })
  })

  describe('just unsealed', () => {
    it('marks itself for its entrance and staggers by its delay, closed like any card', () => {
      setup(daggerVision, false, { entering: true, enterDelay: 220 })
      const card = screen.getByText('Wyvern Fang Dagger').closest('li')!
      expect(card).toHaveClass('vision-card--entering')
      expect(card).toHaveAttribute('data-rarity', 'uncommon')
      expect(card.style.getPropertyValue('--enter-delay')).toBe('220ms')
      expect(card.querySelector('details')).not.toHaveAttribute('open')
    })

    it('takes focus when asked, and stays plain otherwise', () => {
      setup(daggerVision, false, { entering: true, focusOnEnter: true })
      expect(document.querySelector('summary')).toHaveFocus()
      cleanup()
      setup(daggerVision)
      const card = screen.getByText('Wyvern Fang Dagger').closest('li')!
      expect(card).not.toHaveClass('vision-card--entering')
    })
  })
})
