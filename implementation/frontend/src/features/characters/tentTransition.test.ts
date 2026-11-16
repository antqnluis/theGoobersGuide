import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TentView } from './CharacterTent'
import { closeWithExit } from './dialogExit'
import { sameTentView, tentDirection, turnPage } from './tentTransition'

const list: TentView = { type: 'list' }
const create: TentView = { type: 'create' }
const sheet: TentView = { type: 'character', id: 'a' }
const edit: TentView = { type: 'edit', id: 'a' }

describe('tentDirection', () => {
  it('turns forward into a character and back toward the list', () => {
    expect(tentDirection(list, sheet)).toBe('forward')
    expect(tentDirection(list, create)).toBe('forward')
    expect(tentDirection(sheet, edit)).toBe('forward')
    expect(tentDirection(edit, sheet)).toBe('back')
    expect(tentDirection(sheet, list)).toBe('back')
    expect(tentDirection(create, list)).toBe('back')
  })

  it('compares views by type and character', () => {
    expect(sameTentView(sheet, { type: 'character', id: 'a' })).toBe(true)
    expect(sameTentView(sheet, { type: 'character', id: 'b' })).toBe(false)
    expect(sameTentView(sheet, edit)).toBe(false)
    expect(sameTentView(list, { type: 'list' })).toBe(true)
  })
})

describe('turnPage', () => {
  afterEach(() => {
    delete (document as { startViewTransition?: unknown }).startViewTransition
    delete document.documentElement.dataset.tentTurn
  })

  it('applies the change at once without View Transitions', () => {
    const update = vi.fn()
    turnPage('forward', update)
    expect(update).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.tentTurn).toBeUndefined()
  })

  it('runs the change inside a View Transition and clears the direction afterward', async () => {
    let finish!: () => void
    const finished = new Promise<void>((resolve) => (finish = resolve))
    const update = vi.fn()
    ;(document as { startViewTransition?: unknown }).startViewTransition = (
      callback: () => void,
    ) => {
      callback()
      return { finished }
    }
    turnPage('back', update)
    expect(update).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.tentTurn).toBe('back')
    finish()
    await finished
    await Promise.resolve()
    expect(document.documentElement.dataset.tentTurn).toBeUndefined()
  })
})

describe('closeWithExit', () => {
  it('closes the dialog and finishes at once where it cannot animate', () => {
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    const done = vi.fn()
    closeWithExit(dialog, done)
    expect(dialog.open).toBe(false)
    expect(done).toHaveBeenCalledOnce()
  })

  it('finishes at once when there is no open dialog', () => {
    const done = vi.fn()
    closeWithExit(null, done)
    expect(done).toHaveBeenCalledOnce()
  })
})
