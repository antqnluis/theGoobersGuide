import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotebookTabs } from './NotebookTabs'

afterEach(cleanup)

describe('NotebookTabs', () => {
  it('marks the open tab as the current page, in words', () => {
    render(<NotebookTabs active="npcs" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'NPCs' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Notes' }).getAttribute('aria-current')).toBeNull()
  })

  it('switches to the other tab, and ignores a press on the open one', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<NotebookTabs active="notes" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'NPCs' }))
    expect(onChange).toHaveBeenCalledWith('npcs')
  })
})
