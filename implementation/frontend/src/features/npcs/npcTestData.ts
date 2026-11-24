import type { Npc } from './npcTypes'

export { campaignId, miraId, roster, userId } from '../notes/noteTestData'
import { campaignId, userId } from '../notes/noteTestData'

let counter = 0

export function npc(overrides: Partial<Npc> = {}): Npc {
  counter += 1
  return {
    id: `00000000-0000-4000-8000-${String(5000 + counter).padStart(12, '0')}`,
    campaign_id: campaignId,
    author_id: userId,
    visibility: 'private',
    name: 'Brenna Ashdown',
    role: 'Innkeeper',
    location: 'The Gilded Stag',
    body: 'Knows more than she says.',
    portrait_path: null,
    updated_by: userId,
    created_at: '2026-11-24T10:00:00+00:00',
    updated_at: '2026-11-24T10:00:00+00:00',
    ...overrides,
  }
}
