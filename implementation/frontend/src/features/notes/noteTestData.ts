import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import type { Note } from './noteTypes'

export const userId = '00000000-0000-4000-8000-000000000001'
export const miraId = '00000000-0000-4000-8000-000000000002'
export const campaignId = '00000000-0000-4000-8000-000000000011'

export const roster: CampaignRosterMember[] = [
  { profile_id: userId, role: 'member', username: 'me', display_name: null },
  { profile_id: miraId, role: 'owner', username: 'mira_1', display_name: 'Mira' },
]

let counter = 0

export function note(overrides: Partial<Note> = {}): Note {
  counter += 1
  return {
    id: `00000000-0000-4000-8000-${String(4000 + counter).padStart(12, '0')}`,
    campaign_id: campaignId,
    author_id: userId,
    visibility: 'private',
    title: 'Clues',
    body: 'The innkeeper lied.',
    character_id: null,
    updated_by: userId,
    created_at: '2026-11-16T10:00:00+00:00',
    updated_at: '2026-11-16T10:00:00+00:00',
    ...overrides,
  }
}
