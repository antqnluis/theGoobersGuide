import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CampaignRecord } from '../campaignTypes'
import { CampaignOverview } from './CampaignOverview'
import type { CampaignOverview as Overview } from './overviewTypes'
import type { OverviewActions } from './useOverviewActions'

const campaign: CampaignRecord = {
  id: 'c1',
  owner_id: 'owner',
  name: 'The Red Hand',
  description: 'A war of masks.',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const overview: Overview = {
  campaign_id: 'c1',
  announcement: 'No session next week.',
  location: 'The Sunken Library',
  in_world_date: '14th of Hammer',
  chapter: 'Act II',
  situation: 'The party is trapped.',
  objective: 'Find the key.',
  last_session: 'They fought a lich.',
  next_session_at: null,
  next_session_note: '',
  ruleset: 'D&D 5e',
  house_rules: '',
  table_notes: '',
  updated_at: '2026-11-23T10:00:00.000Z',
}

function setup(
  props: Partial<Parameters<typeof CampaignOverview>[0]> & { save?: OverviewActions['save'] } = {},
) {
  const { save = vi.fn().mockResolvedValue(true), ...rest } = props
  const onEditingChange = vi.fn()
  const onNotice = vi.fn()
  const actions: OverviewActions = { error: null, clearError: vi.fn(), isSaving: false, save }
  const out = render(
    <CampaignOverview
      actions={actions}
      campaign={campaign}
      editing={false}
      isOwner={false}
      onDirtyChange={vi.fn()}
      onEditingChange={onEditingChange}
      onNotice={onNotice}
      onRetry={vi.fn()}
      overview={overview}
      ownerUsername="dm"
      partySize={4}
      role="Member"
      status="success"
      {...rest}
    />,
  )
  return { ...out, actions, onEditingChange, onNotice, save }
}

afterEach(cleanup)

describe('CampaignOverview', () => {
  it('shows members where the party is and the campaign facts', () => {
    setup()
    expect(screen.getByText('No session next week.')).toBeTruthy()
    expect(screen.getByText('The Sunken Library')).toBeTruthy()
    expect(screen.getByText('14th of Hammer')).toBeTruthy()
    expect(screen.getByText('Find the key.')).toBeTruthy()
    expect(screen.getByText('They fought a lich.')).toBeTruthy()
    expect(screen.getByText('A war of masks.')).toBeTruthy()
    expect(screen.getByText('dm')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /overview/i })).toBeNull()
  })

  it('hides what the owner has not written from members', () => {
    setup()
    expect(screen.queryByText('House rules')).toBeNull()
    expect(screen.queryByText('Next session')).toBeNull()
    expect(screen.queryByText('Not written yet.')).toBeNull()
  })

  it('tells members when nothing has been added yet', () => {
    setup({ overview: null })
    expect(screen.getByText(/has not added campaign details yet/i)).toBeTruthy()
    expect(screen.getByText('A war of masks.')).toBeTruthy()
  })

  it('shows a load failure with a retry', async () => {
    const onRetry = vi.fn()
    setup({ overview: undefined, status: 'error', onRetry })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('offers the owner the form and prompts for what is missing', async () => {
    const { onEditingChange } = setup({ isOwner: true, role: 'Owner' })
    expect(screen.getAllByText('Not written yet.').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Update the overview' }))
    expect(onEditingChange).toHaveBeenCalledWith(true)
  })

  it('saves the owner’s edits and closes the form', async () => {
    const { save, onEditingChange, onNotice } = setup({
      isOwner: true,
      editing: true,
      role: 'Owner',
    })
    const location = screen.getByLabelText(/current location/i)
    await userEvent.clear(location)
    await userEvent.type(location, '  The Obsidian Gate ')
    await userEvent.click(screen.getByRole('button', { name: 'Save overview' }))

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ location: 'The Obsidian Gate' }))
    expect(onEditingChange).toHaveBeenCalledWith(false)
    expect(onNotice).toHaveBeenCalledWith('The overview was updated.')
  })

  it('keeps the form open and the text when the save fails', async () => {
    const save = vi.fn().mockResolvedValue(false)
    const { onEditingChange } = setup({ isOwner: true, editing: true, save })
    await userEvent.click(screen.getByRole('button', { name: 'Save overview' }))
    expect(onEditingChange).not.toHaveBeenCalledWith(false)
    expect((screen.getByLabelText(/current location/i) as HTMLInputElement).value).toBe(
      'The Sunken Library',
    )
  })

  it('never shows the form to a member, even if editing is set', () => {
    setup({ editing: true })
    expect(screen.queryByRole('form', { name: 'Edit the overview' })).toBeNull()
  })
})
