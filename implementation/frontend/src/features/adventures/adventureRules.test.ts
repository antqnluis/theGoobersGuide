import { describe, expect, it } from 'vitest'
import {
  adventureCharacterName,
  adventureCharacterNames,
  adventureEditedLabel,
  adventureStatusLabel,
  acceptedParticipants,
  canArchive,
  canEdit,
  defaultCharacterId,
  filterAdventures,
  filterInvitations,
  groupAdventures,
  invitableCharacters,
  inviterLabel,
  isArchived,
  mergeAdventure,
  missingApprovals,
  myParticipation,
  isPartyReader,
  needsMyApproval,
  needsMyConsent,
  objectiveDoneLabel,
  objectiveProgress,
  ownCharacters,
  participantLabel,
  selectableTypes,
  shareRequestLabel,
  shareState,
  sharedByLabel,
  sharedThreadCount,
  sortAdventures,
  summarizeAdventure,
  updateAuthorLabel,
  waitingReasons,
} from './adventureRules'
import {
  adventure,
  characterId,
  invitation,
  miraCharacterId,
  miraId,
  objective,
  participant,
  roster,
  summary,
  userId,
} from './adventureTestData'

const now = new Date('2026-11-16T12:00:00Z')

describe('summarizeAdventure', () => {
  it('drops the description and reduces the children to what a row shows', () => {
    const detail = adventure({
      id: 'a1',
      objectives: [objective({ done: true }), objective()],
    })
    const row = summarizeAdventure(detail)
    expect(row).not.toHaveProperty('description')
    expect(row.objectives).toEqual([{ done: true }, { done: false }])
    expect(row.participants).toEqual([
      {
        id: detail.participants[0].id,
        character_id: characterId,
        profile_id: userId,
        status: 'accepted',
        share_consent: false,
        approvals: [],
      },
    ])
  })

  it('keeps the children a list row already had when given a bare row', () => {
    const existing = summary({ id: 'a1', objectives: [{ done: true }] })
    const { participants: _p, objectives: _o, updates: _u, ...bare } = adventure({ id: 'a1' })
    void [_p, _o, _u]
    expect(summarizeAdventure(bare, existing).objectives).toEqual([{ done: true }])
  })
})

describe('sortAdventures and filterAdventures', () => {
  it('orders by instant, newest first, and breaks ties by id', () => {
    const rows = [
      summary({ id: 'b', updated_at: '2026-11-16T10:00:00+00:00' }),
      summary({ id: 'a', updated_at: '2026-11-16T10:00:00+00:00' }),
      summary({ id: 'c', updated_at: '2026-11-16T18:00:00+08:00' }),
      summary({ id: 'd', updated_at: '2026-11-16T12:00:00+00:00' }),
    ]
    expect(sortAdventures(rows).map((row) => row.id)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('filters by title, ignoring case and blanks', () => {
    const rows = [summary({ title: 'Find the Heir' }), summary({ title: 'Burn the map' })]
    expect(filterAdventures(rows, ' HEIR ')).toHaveLength(1)
    expect(filterAdventures(rows, '  ')).toHaveLength(2)
    expect(filterAdventures(rows, 'zzz')).toHaveLength(0)
  })
})

describe('groupAdventures', () => {
  const at = (hour: number) => `2026-11-16T${String(hour).padStart(2, '0')}:00:00+00:00`

  it('splits Main story, Your adventures, Completed, and Archived (D12)', () => {
    const rows = [
      summary({ id: 'main-old', type: 'main', visibility: 'campaign', updated_at: at(1) }),
      summary({ id: 'main-new', type: 'main', visibility: 'campaign', updated_at: at(9) }),
      summary({ id: 'main-done', type: 'main', status: 'completed', updated_at: at(5) }),
      summary({ id: 'hold', status: 'on_hold', updated_at: at(8) }),
      summary({ id: 'pending-new', type: 'side', status: 'pending', updated_at: at(7) }),
      summary({ id: 'pending-old', status: 'pending', updated_at: at(2) }),
      summary({ id: 'going', status: 'in_progress', updated_at: at(3) }),
      summary({ id: 'done', status: 'completed', updated_at: at(6) }),
      summary({ id: 'archived', archived_at: at(4), status: 'in_progress', updated_at: at(4) }),
    ]
    const groups = groupAdventures(rows, userId)
    expect(groups.mainStory.map((row) => row.id)).toEqual(['main-new', 'main-old'])
    expect(groups.yours.map((row) => row.id)).toEqual([
      'going',
      'pending-new',
      'pending-old',
      'hold',
    ])
    expect(groups.completed.map((row) => row.id)).toEqual(['done', 'main-done'])
    expect(groups.archived.map((row) => row.id)).toEqual(['archived'])
  })

  it('archives a main adventure for its creator, and a personal or side one for its participants (D10)', () => {
    const archivedAt = '2026-11-16T10:00:00Z'
    const mainOfMira = summary({
      id: 'm',
      type: 'main',
      created_by: miraId,
      archived_at: archivedAt,
    })
    expect(groupAdventures([mainOfMira], userId).archived).toEqual([])
    expect(groupAdventures([{ ...mainOfMira, created_by: userId }], userId).archived).toHaveLength(
      1,
    )
    // Mira created it, but the viewer is an accepted participant, so it is theirs to read.
    const sideOfMira = summary({ id: 's', created_by: miraId, archived_at: archivedAt })
    expect(groupAdventures([sideOfMira], userId).archived).toHaveLength(1)
    expect(groupAdventures([sideOfMira], miraId).archived).toEqual([])
  })

  it('returns six empty groups for no adventures', () => {
    expect(groupAdventures([], userId)).toEqual({
      waiting: [],
      shared: [],
      mainStory: [],
      yours: [],
      completed: [],
      archived: [],
    })
  })
})

describe('small helpers', () => {
  it('counts objectives done out of total', () => {
    expect(objectiveProgress([])).toEqual({ done: 0, total: 0 })
    expect(objectiveProgress([{ done: true }, { done: false }, { done: true }])).toEqual({
      done: 2,
      total: 3,
    })
  })

  it('lets only personal and side adventures change type', () => {
    expect(isArchived({ archived_at: null })).toBe(false)
    expect(isArchived({ archived_at: '2026-11-16T10:00:00Z' })).toBe(true)
    expect(selectableTypes('main')).toEqual(['main'])
    expect(selectableTypes('personal')).toEqual(['personal', 'side'])
    expect(selectableTypes('side')).toEqual(['personal', 'side'])
  })

  it('merges a written row onto a detail without touching its children', () => {
    const detail = adventure({ id: 'a1', objectives: [objective()] })
    const { participants: _p, objectives: _o, updates: _u, ...row } = detail
    void [_p, _o, _u]
    const merged = mergeAdventure(detail, { ...row, status: 'completed' })
    expect(merged.status).toBe('completed')
    expect(merged.objectives).toBe(detail.objectives)
  })
})

describe('characters', () => {
  const characters = [
    { id: 'c1', name: 'Brindle', owner_id: userId, status: 'retired' as const },
    { id: 'c2', name: 'Tess', owner_id: userId, status: 'active' as const },
    { id: 'c3', name: 'Orrin', owner_id: miraId, status: 'active' as const },
  ]

  it('offers only the viewer’s own characters, whatever their status', () => {
    expect(ownCharacters(characters, userId).map((row) => row.id)).toEqual(['c1', 'c2'])
  })

  it('defaults to the viewer’s active character, else to nothing', () => {
    expect(defaultCharacterId(characters, userId)).toBe('c2')
    expect(defaultCharacterId(characters.slice(0, 1), userId)).toBeNull()
    expect(defaultCharacterId([], userId)).toBeNull()
  })

  it('names a participant’s character, or "A character" when it cannot be seen', () => {
    expect(adventureCharacterName('c2', characters)).toBe('Tess')
    expect(adventureCharacterName('unknown', characters)).toBe('A character')
    expect(
      adventureCharacterNames(
        {
          participants: [
            participant({ character_id: 'c1' }),
            participant({ character_id: 'zz' }),
            participant({ character_id: 'c2', status: 'proposed' }),
          ],
        },
        characters,
      ),
    ).toEqual(['Brindle', 'A character'])
  })
})

describe('attribution', () => {
  it('says who last edited an adventure', () => {
    const base = { updated_at: '2026-11-16T10:00:00Z' }
    expect(adventureEditedLabel({ ...base, updated_by: userId }, userId, roster, now)).toBe(
      'Edited by you, 2 hours ago',
    )
    expect(adventureEditedLabel({ ...base, updated_by: miraId }, userId, roster, now)).toBe(
      'Edited by Mira, 2 hours ago',
    )
    expect(adventureEditedLabel({ ...base, updated_by: 'gone' }, userId, roster, now)).toBe(
      'Edited by A former member, 2 hours ago',
    )
    expect(adventureEditedLabel({ ...base, updated_by: null }, userId, roster, now)).toBe(
      'Edited 2 hours ago',
    )
  })

  it('says who last changed the status, and nothing before the first change', () => {
    const base = { status: 'completed' as const, status_changed_at: '2026-11-14T12:00:00Z' }
    expect(adventureStatusLabel({ ...base, status_changed_by: miraId }, userId, roster, now)).toBe(
      'Completed by Mira, 2 days ago',
    )
    expect(
      adventureStatusLabel(
        { ...base, status: 'on_hold', status_changed_by: userId },
        userId,
        roster,
        now,
      ),
    ).toBe('Put on hold by you, 2 days ago')
    expect(adventureStatusLabel({ ...base, status_changed_by: null }, userId, roster, now)).toBe(
      'Completed 2 days ago',
    )
    expect(
      adventureStatusLabel(
        { status: 'pending', status_changed_at: null, status_changed_by: null },
        userId,
        roster,
        now,
      ),
    ).toBeNull()
  })

  it('says who ticked an objective', () => {
    const done = { done: true, completed_at: '2026-11-16T11:00:00Z' }
    expect(objectiveDoneLabel({ ...done, completed_by: miraId }, userId, roster, now)).toBe(
      'Done by Mira, 1 hour ago',
    )
    expect(objectiveDoneLabel({ ...done, completed_by: null }, userId, roster, now)).toBe(
      'Done 1 hour ago',
    )
    expect(
      objectiveDoneLabel(
        { done: false, completed_by: null, completed_at: null },
        userId,
        roster,
        now,
      ),
    ).toBeNull()
  })

  it('names an update’s author', () => {
    expect(updateAuthorLabel(userId, userId, roster)).toBe('You')
    expect(updateAuthorLabel(miraId, userId, roster)).toBe('Mira')
    expect(updateAuthorLabel('gone', userId, roster)).toBe('A former member')
  })
})

const mira = (overrides = {}) =>
  participant({ profile_id: miraId, character_id: miraCharacterId, ...overrides })

describe('collaboration rules', () => {
  const alone = { type: 'side' as const, created_by: userId, participants: [participant()] }
  const duo = (overrides = {}) => ({
    type: 'side' as const,
    visibility: 'participants' as const,
    archived_at: null,
    created_by: userId,
    participants: [participant(), mira()],
    ...overrides,
  })

  it('finds the viewer’s accepted participation and every accepted row', () => {
    const adventure = duo({ participants: [participant({ status: 'left' }), mira()] })
    expect(myParticipation(adventure, userId)).toBeNull()
    expect(myParticipation(adventure, miraId)?.profile_id).toBe(miraId)
    expect(acceptedParticipants(duo())).toHaveLength(2)
    expect(acceptedParticipants(adventure)).toHaveLength(1)
  })

  it('lets the creator archive while taking part, and anyone accepted once they have left (D10)', () => {
    expect(canArchive(alone, userId)).toBe(true)
    expect(canArchive(duo(), userId)).toBe(true)
    expect(canArchive(duo(), miraId)).toBe(false)
    const creatorLeft = duo({ participants: [participant({ status: 'left' }), mira()] })
    expect(canArchive(creatorLeft, miraId)).toBe(true)
    expect(canArchive(creatorLeft, userId)).toBe(false)
    // A party viewer is not a participant.
    expect(canArchive(duo(), 'someone-else')).toBe(false)
    // Main adventures stay with their creator, whoever reads them.
    const main = { type: 'main' as const, created_by: miraId, participants: [] }
    expect(canArchive(main, miraId)).toBe(true)
    expect(canArchive(main, userId)).toBe(false)
  })

  it('edits main adventures and the ones the viewer is in, never an archived one or the party’s', () => {
    expect(canEdit(duo(), userId)).toBe(true)
    expect(canEdit(duo({ visibility: 'party' }), 'party-viewer')).toBe(false)
    expect(canEdit(duo({ archived_at: '2026-11-16T10:00:00Z' }), userId)).toBe(false)
    expect(canEdit({ type: 'main', archived_at: null, participants: [] }, 'anyone')).toBe(true)
    expect(
      canEdit({ type: 'main', archived_at: '2026-11-16T10:00:00Z', participants: [] }, 'x'),
    ).toBe(false)
  })

  it('reads the share state from visibility and consent', () => {
    expect(shareState(duo())).toBe('private')
    expect(shareState(duo({ participants: [participant({ share_consent: true }), mira()] }))).toBe(
      'requested',
    )
    expect(shareState(duo({ visibility: 'party' }))).toBe('shared')
    expect(shareState({ type: 'main', visibility: 'campaign', participants: [] })).toBe('private')
    // Consent on a row that is not accepted does not count.
    expect(
      shareState(
        duo({ participants: [participant(), mira({ status: 'left', share_consent: true })] }),
      ),
    ).toBe('private')
  })

  it('knows which proposals and share requests wait for the viewer', () => {
    const proposal = participant({
      id: 'p',
      status: 'proposed',
      approvals: [{ approver_id: miraId }],
    })
    expect(needsMyApproval(proposal, userId)).toBe(true)
    expect(needsMyApproval(proposal, miraId)).toBe(false)
    expect(needsMyApproval(participant(), userId)).toBe(false)

    const requested = duo({ participants: [participant(), mira({ share_consent: true })] })
    expect(needsMyConsent(requested, userId)).toBe(true)
    expect(needsMyConsent(requested, miraId)).toBe(false)
    expect(needsMyConsent(duo(), userId)).toBe(false)
    expect(needsMyConsent(duo({ archived_at: '2026-11-16T10:00:00Z' }), userId)).toBe(false)

    const both = duo({ participants: [participant(), mira({ share_consent: true }), proposal] })
    expect(waitingReasons(both, userId).map((reason) => reason.kind)).toEqual([
      'approval',
      'consent',
    ])
    expect(waitingReasons(both, 'party-viewer')).toEqual([])
    expect(waitingReasons(duo({ archived_at: '2026-11-16T10:00:00Z' }), userId)).toEqual([])
  })

  it('puts an adventure in exactly one group, with "Waiting for you" first', () => {
    const proposal = participant({ id: 'p', status: 'proposed', approvals: [] })
    const rows = [
      summary({ id: 'waits', participants: [participant(), proposal] }),
      summary({ id: 'waits-done', status: 'completed', participants: [participant(), proposal] }),
      summary({ id: 'mine' }),
      summary({
        id: 'theirs',
        visibility: 'party',
        created_by: miraId,
        participants: [mira({ share_consent: true })],
      }),
      summary({
        id: 'theirs-done',
        visibility: 'party',
        status: 'completed',
        created_by: miraId,
        participants: [mira({ share_consent: true })],
      }),
    ]
    const groups = groupAdventures(rows, userId)
    expect(groups.waiting.map((row) => row.id).sort()).toEqual(['waits', 'waits-done'])
    expect(groups.yours.map((row) => row.id)).toEqual(['mine'])
    expect(groups.shared.map((row) => row.id)).toEqual(['theirs'])
    expect(groups.completed.map((row) => row.id)).toEqual(['theirs-done'])
    const placed = Object.values(groups).flat()
    expect(new Set(placed.map((row) => row.id)).size).toBe(placed.length)
  })

  it('lists characters that may be invited: active, another member’s, whose owner is not in yet', () => {
    const characters = [
      { id: 'mine', owner_id: userId, status: 'active' as const },
      { id: 'mira', owner_id: miraId, status: 'active' as const },
      { id: 'bram', owner_id: 'bram', status: 'active' as const },
      { id: 'retired', owner_id: 'cass', status: 'retired' as const },
      { id: 'gone', owner_id: 'gone', status: 'active' as const },
      { id: 'dead', owner_id: 'dov', status: 'deceased' as const },
    ]
    const members = [{ profile_id: userId }, { profile_id: miraId }, { profile_id: 'bram' }]
    expect(
      invitableCharacters(
        characters,
        alone,
        [...members, { profile_id: 'cass' }, { profile_id: 'dov' }],
        userId,
      ).map((character) => character.id),
    ).toEqual(['mira', 'bram'])
    // Mira is already in, and Bram has a pending invitation: neither can be proposed again.
    const crowded = {
      participants: [participant(), mira(), participant({ profile_id: 'bram', status: 'invited' })],
    }
    expect(invitableCharacters(characters, crowded, members, userId)).toEqual([])
    // A declined or left player can be proposed again.
    const declined = {
      participants: [
        participant(),
        mira({ status: 'declined' }),
        participant({ profile_id: 'bram', status: 'left' }),
      ],
    }
    expect(invitableCharacters(characters, declined, members, userId).map((c) => c.id)).toEqual([
      'mira',
      'bram',
    ])
  })

  it('labels pending participants', () => {
    const pair = duo({ participants: [participant(), mira()] })
    const proposal = participant({ status: 'proposed', approvals: [{ approver_id: userId }] })
    expect(missingApprovals(proposal, pair).map((row) => row.profile_id)).toEqual([miraId])
    expect(participantLabel(proposal, pair, userId, roster)).toBe('Waiting for 1 approval')
    expect(
      participantLabel(participant({ status: 'proposed', approvals: [] }), pair, userId, roster),
    ).toBe('Waiting for 2 approvals')
    expect(participantLabel(mira({ status: 'invited' }), pair, userId, roster)).toBe(
      "Waiting for Mira's answer",
    )
    expect(participantLabel(mira({ status: 'declined' }), pair, userId, roster)).toBe('Declined')
    expect(participantLabel(mira({ status: 'left' }), pair, userId, roster)).toBe('Left')
    expect(participantLabel(mira(), pair, userId, roster)).toBeNull()
    expect(inviterLabel(miraId, userId, roster)).toBe('Invited by Mira')
    expect(inviterLabel(userId, userId, roster)).toBe('Invited by you')
    expect(inviterLabel(null, userId, roster)).toBe('Invited by a former member')
  })

  it('filters invitations by title', () => {
    const rows = [invitation({ title: 'The long road' }), invitation({ title: 'Burn the map' })]
    expect(filterInvitations(rows, ' ROAD ')).toHaveLength(1)
    expect(filterInvitations(rows, '')).toHaveLength(2)
    expect(filterInvitations(rows, 'zzz')).toEqual([])
  })
})

describe('shareRequestLabel', () => {
  const mira = (overrides = {}) =>
    participant({ profile_id: miraId, character_id: miraCharacterId, ...overrides })

  it('names who has agreed, besides the viewer', () => {
    expect(
      shareRequestLabel(
        { participants: [participant(), mira({ share_consent: true })] },
        userId,
        roster,
      ),
    ).toBe('Mira wants to share this with the party')
    expect(
      shareRequestLabel(
        {
          participants: [
            participant(),
            mira({ share_consent: true }),
            participant({ profile_id: 'bram', character_id: 'cb', share_consent: true }),
          ],
        },
        userId,
        [...roster, { profile_id: 'bram', username: 'bram', display_name: 'Bram' }],
      ),
    ).toBe('Mira and Bram want to share this with the party')
    expect(shareRequestLabel({ participants: [participant()] }, userId, roster)).toBe(
      'Someone wants to share this with the party',
    )
  })
})

describe('the party audience', () => {
  const mira = (overrides = {}) =>
    participant({ profile_id: miraId, character_id: miraCharacterId, ...overrides })

  it('reads a personal or side adventure without being in it, never a main one', () => {
    const theirs = adventure({ type: 'side', participants: [mira()] })
    expect(isPartyReader(theirs, userId)).toBe(true)
    expect(isPartyReader(adventure({ type: 'side' }), userId)).toBe(false)
    expect(isPartyReader(adventure({ type: 'main', participants: [] }), userId)).toBe(false)
    // A participant who has left reads it like anyone else in the party.
    expect(
      isPartyReader(adventure({ participants: [participant({ status: 'left' })] }), userId),
    ).toBe(true)
  })

  it('counts the threads with someone else in them, not solo or main ones', () => {
    const duo = adventure({ type: 'side', participants: [participant(), mira()] })
    const solo = adventure({ type: 'personal' })
    const pending = adventure({
      type: 'side',
      participants: [participant(), mira({ status: 'proposed' })],
    })
    const main = adventure({ type: 'main', participants: [] })
    const theirs = adventure({ type: 'side', participants: [mira()] })
    expect(sharedThreadCount([duo, solo, pending, main, theirs], userId)).toBe(1)
    expect(sharedThreadCount([], userId)).toBe(0)
  })

  it('names who shared it with the party', () => {
    const duo = adventure({ type: 'side', participants: [participant(), mira()] })
    expect(sharedByLabel(duo, userId, roster)).toBe('Shared with the party by You and Mira.')
    expect(sharedByLabel(adventure({ participants: [mira()] }), 'someone', roster)).toBe(
      'Shared with the party by Mira.',
    )
    expect(sharedByLabel(adventure({ participants: [] }), userId, roster)).toBe(
      'Shared with the party.',
    )
  })
})
