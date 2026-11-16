import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import type {
  AdventureDetail,
  AdventureObjective,
  AdventureSummary,
  AdventureUpdate,
} from './adventureTypes'

export const userId = '00000000-0000-4000-8000-000000000001'
export const miraId = '00000000-0000-4000-8000-000000000002'
export const campaignId = '00000000-0000-4000-8000-000000000011'
export const characterId = '00000000-0000-4000-8000-000000000021'

export const roster: CampaignRosterMember[] = [
  { profile_id: userId, role: 'member', username: 'me', display_name: null },
  { profile_id: miraId, role: 'owner', username: 'mira_1', display_name: 'Mira' },
]

let counter = 0
const nextId = () => `00000000-0000-4000-8000-${String(5000 + ++counter).padStart(12, '0')}`

export function adventure(overrides: Partial<AdventureDetail> = {}): AdventureDetail {
  const id = overrides.id ?? nextId()
  return {
    id,
    campaign_id: campaignId,
    created_by: userId,
    type: 'personal',
    visibility: 'participants',
    status: 'pending',
    title: 'Find the heir',
    description: 'Somebody knows where the heir went.',
    next_step: 'Ask the innkeeper',
    reference: '',
    updated_by: userId,
    status_changed_at: null,
    status_changed_by: null,
    archived_at: null,
    created_at: '2026-11-16T10:00:00+00:00',
    updated_at: '2026-11-16T10:00:00+00:00',
    participants: [
      {
        id: nextId(),
        adventure_id: id,
        campaign_id: campaignId,
        character_id: characterId,
        profile_id: userId,
        status: 'accepted',
        created_at: '2026-11-16T10:00:00+00:00',
      },
    ],
    objectives: [],
    updates: [],
    ...overrides,
  }
}

export function summary(overrides: Partial<AdventureSummary> = {}): AdventureSummary {
  const { description: _description, ...rest } = adventure()
  void _description
  return {
    ...rest,
    participants: [{ character_id: characterId }],
    objectives: [],
    ...overrides,
  }
}

export function objective(overrides: Partial<AdventureObjective> = {}): AdventureObjective {
  return {
    id: nextId(),
    adventure_id: 'a1',
    title: 'Search the cellar',
    done: false,
    created_by: userId,
    completed_by: null,
    completed_at: null,
    created_at: '2026-11-16T10:00:00+00:00',
    updated_at: '2026-11-16T10:00:00+00:00',
    ...overrides,
  }
}

export function update(overrides: Partial<AdventureUpdate> = {}): AdventureUpdate {
  return {
    id: nextId(),
    adventure_id: 'a1',
    author_id: userId,
    body: 'The cellar was empty.',
    created_at: '2026-11-16T10:30:00+00:00',
    ...overrides,
  }
}
