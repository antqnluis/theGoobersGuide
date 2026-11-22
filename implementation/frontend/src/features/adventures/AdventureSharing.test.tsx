import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdventureSharing } from './AdventureSharing'
import {
  adventure,
  miraCharacterId,
  miraId,
  participant,
  roster,
  userId,
} from './adventureTestData'
import type { AdventureDetail } from './adventureTypes'
import type { AdventureAction } from './useAdventureActions'

afterEach(cleanup)

const ok = { ok: true as const, value: undefined }
const mira = (overrides = {}) =>
  participant({ profile_id: miraId, character_id: miraCharacterId, ...overrides })

function setup(
  subject: AdventureDetail,
  props: { pendingAction?: AdventureAction | null; viewer?: string } = {},
) {
  const onConsent = vi.fn().mockResolvedValue(ok)
  const view = render(
    <AdventureSharing
      adventure={subject}
      onConsent={onConsent}
      pendingAction={props.pendingAction ?? null}
      roster={roster}
      userId={props.viewer ?? userId}
    />,
  )
  return { onConsent, user: userEvent.setup(), ...view }
}

const duo = (mine = false, theirs = false, overrides: Partial<AdventureDetail> = {}) =>
  adventure({
    type: 'side',
    participants: [participant({ share_consent: mine }), mira({ share_consent: theirs })],
    ...overrides,
  })

describe('AdventureSharing', () => {
  it('offers sharing for a private adventure and asks first, naming the rule for a group', async () => {
    const { onConsent, user } = setup(duo())
    expect(screen.getByText('Only the people in this adventure can see it.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Share with party' }))
    expect(screen.getByRole('group', { name: 'Confirm' })).toHaveTextContent(
      'Everyone in this adventure must agree. Party members will see everything here, read-only.',
    )
    expect(screen.getByRole('button', { name: 'Yes, share' })).toHaveFocus()
    expect(onConsent).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Yes, share' }))
    expect(onConsent).toHaveBeenCalledWith(true)
  })

  it('does not mention agreement for a sole participant', async () => {
    const { user } = setup(adventure({ type: 'personal' }))
    await user.click(screen.getByRole('button', { name: 'Share with party' }))
    const box = screen.getByRole('group', { name: 'Confirm' })
    expect(box).toHaveTextContent('Party members will see everything here, read-only.')
    expect(box).not.toHaveTextContent('Everyone in this adventure must agree')
  })

  it('says that sharing includes the handoff sources', async () => {
    const { user } = setup(duo())
    await user.click(screen.getByRole('button', { name: 'Share with party' }))
    expect(screen.getByRole('group', { name: 'Confirm' })).toHaveTextContent(
      'Sharing includes this adventure’s handoff sources.',
    )
  })

  it('returns focus to the control that opened the confirmation', async () => {
    const { user } = setup(duo())
    await user.click(screen.getByRole('button', { name: 'Share with party' }))
    await user.click(screen.getByRole('button', { name: 'Never mind' }))
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share with party' })).toHaveFocus()
  })

  it('shows a request from someone else with Agree and Not now', async () => {
    const { onConsent, user } = setup(duo(false, true))
    expect(screen.getByText('Mira wants to share this with the party.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(onConsent).toHaveBeenCalledWith(false)

    await user.click(screen.getByRole('button', { name: 'Agree' }))
    expect(onConsent).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Yes, share' }))
    expect(onConsent).toHaveBeenLastCalledWith(true)
  })

  it('shows who is still to agree after the viewer has, and lets them cancel the request', async () => {
    const { onConsent, user } = setup(duo(true, false))
    expect(
      screen.getByText('You agreed to share this with the party. Waiting for Mira.'),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Agree' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel the request' }))
    expect(onConsent).toHaveBeenCalledWith(false)
  })

  it('shows the shared state with Stop sharing behind a confirmation', async () => {
    const { onConsent, user } = setup(duo(true, true, { visibility: 'party' }))
    expect(screen.getByText(/^Shared with the party\./)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Stop sharing' }))
    expect(screen.getByRole('group', { name: 'Confirm' })).toHaveTextContent(
      'Party members lose access at once. Sharing again needs everyone in this adventure to agree again.',
    )
    expect(screen.getByRole('button', { name: 'Yes, stop sharing' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Yes, stop sharing' }))
    expect(onConsent).toHaveBeenCalledWith(false)
  })

  it('disables the controls while a write is in flight', () => {
    setup(duo(), { pendingAction: 'consent' })
    expect(screen.getByRole('button', { name: 'Share with party' })).toBeDisabled()
  })

  it('renders nothing for main, archived, or a viewer who is not in the adventure', () => {
    const cases = [
      adventure({ type: 'main', visibility: 'campaign', participants: [] }),
      duo(true, true, { archived_at: '2026-11-16T12:00:00+00:00' }),
    ]
    for (const subject of cases) {
      const { container, unmount } = setup(subject)
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
    const { container } = setup(duo(true, true, { visibility: 'party' }), { viewer: 'bystander' })
    expect(container).toBeEmptyDOMElement()
  })
})
