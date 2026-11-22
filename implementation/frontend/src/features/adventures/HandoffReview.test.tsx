import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHandoff, type HandoffChange } from './handoffDocument'
import { HandoffReview } from './HandoffReview'
import { handoffJson, OBJ_DONE, OBJ_OPEN, OBJ_OTHER, target } from './handoffTestData'

afterEach(cleanup)

function parse(proposal: Record<string, unknown>, extra = {}) {
  const result = parseHandoff(handoffJson(proposal, extra), target())
  if (result.kind !== 'parsed') throw new Error(result.message)
  return result
}

function setup(
  proposal: Record<string, unknown>,
  props: { selected?: string[]; disabled?: boolean; extra?: Record<string, unknown> } = {},
) {
  const parsed = parse(proposal, props.extra)
  const onSelect = vi.fn()
  const user = userEvent.setup()
  render(
    <HandoffReview
      changes={parsed.changes}
      disabled={props.disabled ?? false}
      ignored={parsed.ignored}
      notes={parsed.notes}
      onSelect={onSelect}
      selected={new Set(props.selected ?? [])}
    />,
  )
  return { changes: parsed.changes as HandoffChange[], onSelect, user }
}

describe('HandoffReview', () => {
  it('shows each change against the current value, grouped, with checkboxes that name the field and the proposed value', () => {
    setup({
      title: 'The Drowned Bell, part two',
      status: 'in_progress',
      objectives: [{ op: 'add', title: 'Recover the clapper' }],
      update: 'We reached Saltmere.',
    })
    const review = screen.getByRole('region', { name: 'Review' })
    expect(within(review).getByRole('group', { name: 'Details' })).toBeVisible()
    expect(within(review).getByRole('group', { name: 'Objectives' })).toBeVisible()
    expect(within(review).getByRole('group', { name: 'Progress update' })).toBeVisible()

    const title = screen.getByRole('checkbox', { name: 'Title: The Drowned Bell, part two' })
    expect(title).not.toBeChecked()
    expect(title.closest('li')).toHaveTextContent('The Drowned Bell')
    expect(title.closest('li')).toHaveTextContent('The Drowned Bell, part two')
    // Statuses read by name.
    expect(screen.getByRole('checkbox', { name: 'Status: In progress' })).toBeVisible()
    expect(
      screen.getByRole('checkbox', { name: 'New objective: Recover the clapper' }),
    ).toBeVisible()
    expect(screen.getByRole('checkbox', { name: 'Progress update' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('0 of 4 changes selected.')
  })

  it('toggles a change through onSelect and reflects the selection', async () => {
    const { onSelect, user } = setup(
      { title: 'New title', next_step: 'Somewhere' },
      {
        selected: ['detail:next_step'],
      },
    )
    expect(screen.getByRole('checkbox', { name: 'Next step: Somewhere' })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'Title: New title' }))
    expect(onSelect).toHaveBeenCalledWith(new Set(['detail:next_step', 'detail:title']))
    await user.click(screen.getByRole('checkbox', { name: 'Next step: Somewhere' }))
    expect(onSelect).toHaveBeenLastCalledWith(new Set())
  })

  it('selects all valid changes and clears the selection', async () => {
    const { onSelect, user } = setup({
      title: 'New title',
      next_step: 'x'.repeat(281),
      reference: 'Maren Vos',
      update: 'Recap',
    })
    expect(screen.getByRole('status')).toHaveTextContent('1 can’t be applied.')
    await user.click(screen.getByRole('button', { name: 'Select all valid' }))
    expect(onSelect).toHaveBeenCalledWith(new Set(['detail:title', 'update']))
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeDisabled()
  })

  it('disables an unchanged change as "No change" and an invalid one with its reason', () => {
    setup({ title: 'The Drowned Bell', next_step: 'x'.repeat(281) }, { selected: ['detail:title'] })
    const unchanged = screen.getByRole('checkbox', { name: 'Title: The Drowned Bell' })
    expect(unchanged).toBeDisabled()
    expect(unchanged).not.toBeChecked()
    expect(unchanged.closest('li')).toHaveTextContent('No change')
    const invalid = screen.getByRole('checkbox', { name: /^Next step/ })
    expect(invalid).toBeDisabled()
    expect(invalid.closest('li')).toHaveTextContent('The next step can be up to 280 characters')
  })

  it('says only the player decides on completions, and never preselects them', () => {
    setup({
      status: 'completed',
      objectives: [{ op: 'complete', id: OBJ_OPEN }],
    })
    for (const name of ['Status: Completed', 'Complete objective: Find the bell']) {
      const box = screen.getByRole('checkbox', { name })
      expect(box).not.toBeChecked()
      expect(box.closest('li')).toHaveTextContent(
        'The handoff suggests this. Only you decide it’s done.',
      )
    }
  })

  it('shows objective operations against the current objective', () => {
    setup({
      objectives: [
        { op: 'reopen', id: OBJ_DONE },
        { op: 'rename', id: OBJ_OTHER, title: 'Ask the harbourmaster' },
      ],
    })
    const reopen = screen.getByRole('checkbox', { name: 'Reopen objective: Reach the harbour' })
    expect(reopen.closest('li')).toHaveTextContent('Done')
    expect(reopen.closest('li')).toHaveTextContent('Not done')
    const rename = screen.getByRole('checkbox', {
      name: 'Rename objective: Ask the harbourmaster',
    })
    expect(rename.closest('li')).toHaveTextContent('Ask around')
  })

  it('puts the assistant’s notes first and lists keys it left out', () => {
    setup(
      { title: 'New title', visibility: 'party' },
      { extra: { issues: ['Two harbourmasters are named.'], source: 'x' } },
    )
    const notes = screen.getByRole('note')
    expect(notes).toHaveTextContent('Two harbourmasters are named.')
    expect(
      notes.compareDocumentPosition(screen.getByRole('group', { name: 'Details' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    const ignored = screen.getByText('Not imported (2)')
    expect(ignored.closest('details')).toHaveTextContent('proposal.visibility')
    expect(ignored.closest('details')).toHaveTextContent('source')
  })

  it('says so when a handoff proposes nothing', () => {
    setup({})
    expect(screen.getByRole('status')).toHaveTextContent('This handoff proposes nothing.')
  })

  it('disables every control while saving', () => {
    setup({ title: 'New title' }, { disabled: true })
    expect(screen.getByRole('checkbox', { name: /Title/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Select all valid' })).toBeDisabled()
  })
})
