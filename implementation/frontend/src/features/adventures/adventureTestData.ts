import type { CampaignRosterMember } from '../campaigns/campaignTypes'
import type {
  AdventureDetail,
  AdventureInvitation,
  AdventureObjective,
  AdventureParticipant,
  AdventureSummary,
  AdventureUpdate,
} from './adventureTypes'

export const userId = '00000000-0000-4000-8000-000000000001'
export const miraId = '00000000-0000-4000-8000-000000000002'
export const campaignId = '00000000-0000-4000-8000-000000000011'
export const characterId = '00000000-0000-4000-8000-000000000021'
export const miraCharacterId = '00000000-0000-4000-8000-000000000022'

export const roster: CampaignRosterMember[] = [
  { profile_id: userId, role: 'member', username: 'me', display_name: null },
  { profile_id: miraId, role: 'owner', username: 'mira_1', display_name: 'Mira' },
]

let counter = 0
const nextId = () => `00000000-0000-4000-8000-${String(5000 + ++counter).padStart(12, '0')}`

/** A participant row; by default the viewer's own accepted one, with no consent or approvals. */
export function participant(overrides: Partial<AdventureParticipant> = {}): AdventureParticipant {
  return {
    id: nextId(),
    adventure_id: 'a1',
    campaign_id: campaignId,
    character_id: characterId,
    profile_id: userId,
    status: 'accepted',
    invited_by: null,
    share_consent: false,
    share_consent_at: null,
    responded_at: null,
    created_at: '2026-11-16T10:00:00+00:00',
    updated_at: '2026-11-16T10:00:00+00:00',
    approvals: [],
    ...overrides,
  }
}

export function invitation(overrides: Partial<AdventureInvitation> = {}): AdventureInvitation {
  return {
    participant_id: nextId(),
    adventure_id: nextId(),
    title: 'The long road',
    type: 'side',
    character_id: characterId,
    invited_by: miraId,
    invited_at: '2026-11-16T11:00:00+00:00',
    shared_with_party: false,
    ...overrides,
  }
}

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
    participants: [participant({ adventure_id: id })],
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
    participants: [
      {
        id: nextId(),
        character_id: characterId,
        profile_id: userId,
        status: 'accepted',
        share_consent: false,
        approvals: [],
      },
    ],
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
