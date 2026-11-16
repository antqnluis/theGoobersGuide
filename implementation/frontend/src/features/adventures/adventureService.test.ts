import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../lib/supabase'
import {
  addAdventureUpdate,
  addObjective,
  approveParticipant,
  cancelParticipant,
  countAdventureRequests,
  countCharacterAdventures,
  adventureError,
  AdventureConflictError,
  createAdventure,
  deleteAdventureUpdate,
  deleteObjective,
  getAdventure,
  inviteError,
  isAdventureConflict,
  isAdventureUnavailable,
  isCollaborationStale,
  leaveAdventure,
  listAdventures,
  listInvitations,
  proposeParticipant,
  renameObjective,
  respondToInvitation,
  saveAdventureDetails,
  setAdventureArchived,
  setAdventureStatus,
  setObjectiveDone,
  setShareConsent,
} from './adventureService'
import { adventure, campaignId, characterId, invitation } from './adventureTestData'
import type { AdventureValues } from './adventureTypes'

vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

const adventureId = '00000000-0000-4000-8000-000000000051'
const detail = adventure({ id: adventureId })
const values: AdventureValues = {
  title: 'New title',
  type: 'side',
  description: 'Text',
  next_step: 'Go',
  reference: '',
}

type Result = { data: unknown; error: unknown }

/** A chainable query builder that records calls and resolves to `result`. */
function builder(result: Result) {
  const calls: [string, unknown[]][] = []
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'insert', 'update', 'delete']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args])
      return chain
    }
  }
  chain.maybeSingle = () => Promise.resolve(result)
  chain.single = () => Promise.resolve(result)
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return { calls, chain }
}

/** Queues one builder per `from(...)` call, in order. */
function queue(...results: Result[]) {
  const all = results.map(builder)
  for (const { chain } of all) vi.mocked(supabase.from).mockReturnValueOnce(chain as never)
  return all.map(({ calls }) => calls)
}

const selected = (calls: [string, unknown[]][]) =>
  (calls.find(([method]) => method === 'select')![1][0] as string).split(/,(?![^()]*\))/)

beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
  vi.mocked(supabase.rpc).mockReset()
})

describe('listAdventures', () => {
  it('reads the campaign’s adventures newest edit first, with child counts and no description', async () => {
    const [calls] = queue({ data: [{ id: adventureId }], error: null })
    await expect(listAdventures(campaignId)).resolves.toHaveLength(1)
    expect(supabase.from).toHaveBeenCalledWith('adventures')
    expect(calls).toContainEqual(['eq', ['campaign_id', campaignId]])
    expect(calls).toContainEqual(['order', ['updated_at', { ascending: false }]])
    const fields = selected(calls)
    expect(fields).not.toContain('description')
    expect(selected(calls).join(',')).toContain(
      'participants:adventure_participants(id,character_id,profile_id,status,share_consent,approvals:adventure_invite_approvals(approver_id))',
    )
    expect(fields).toContain('objectives:adventure_objectives(done)')
  })

  it('returns an empty list for no rows and throws on an error', async () => {
    queue({ data: null, error: null })
    await expect(listAdventures(campaignId)).resolves.toEqual([])
    queue({ data: null, error: { message: 'boom' } })
    await expect(listAdventures(campaignId)).rejects.toEqual({ message: 'boom' })
  })
})

describe('getAdventure', () => {
  it('reads one adventure with its children in order', async () => {
    const [calls] = queue({ data: detail, error: null })
    await expect(getAdventure(adventureId)).resolves.toEqual(detail)
    expect(calls).toContainEqual(['eq', ['id', adventureId]])
    expect(calls).toContainEqual([
      'order',
      ['created_at', { referencedTable: 'adventure_objectives', ascending: true }],
    ])
    expect(calls).toContainEqual([
      'order',
      ['created_at', { referencedTable: 'adventure_updates', ascending: false }],
    ])
    const fields = selected(calls).join(',')
    expect(fields).toContain('description')
    expect(fields).toContain('adventure_updates(')
    expect(fields).toContain('invited_by')
    expect(fields).toContain('share_consent')
    expect(fields).toContain('approvals:adventure_invite_approvals(approver_id)')
  })

  it('reports no row as unavailable and passes other errors through', async () => {
    queue({ data: null, error: null })
    await expect(getAdventure(adventureId)).rejects.toThrow('adventure_unavailable')
    queue({ data: null, error: { message: 'boom' } })
    await expect(getAdventure(adventureId)).rejects.toEqual({ message: 'boom' })
  })
})

describe('countCharacterAdventures', () => {
  it('splits the adventures only the character is in from the shared ones it would leave (D11)', async () => {
    const [own, all] = queue(
      {
        data: [{ adventure_id: 'a1' }, { adventure_id: 'a2' }, { adventure_id: 'a3' }],
        error: null,
      },
      {
        data: [
          { adventure_id: 'a1' },
          { adventure_id: 'a2' },
          { adventure_id: 'a2' },
          { adventure_id: 'a3' },
          { adventure_id: 'a3' },
          { adventure_id: 'a3' },
        ],
        error: null,
      },
    )
    await expect(countCharacterAdventures('c1')).resolves.toEqual({ sole: 1, shared: 2 })
    expect(supabase.from).toHaveBeenCalledWith('adventure_participants')
    expect(own).toContainEqual(['eq', ['character_id', 'c1']])
    expect(own).toContainEqual(['eq', ['status', 'accepted']])
    expect(all).toContainEqual(['in', ['adventure_id', ['a1', 'a2', 'a3']]])
    expect(all).toContainEqual(['eq', ['status', 'accepted']])
  })

  it('reads nothing more when the character is in no adventure', async () => {
    queue({ data: [], error: null })
    await expect(countCharacterAdventures('c1')).resolves.toEqual({ sole: 0, shared: 0 })
    expect(supabase.from).toHaveBeenCalledTimes(1)
    vi.mocked(supabase.from).mockReset()
    queue({ data: null, error: null })
    await expect(countCharacterAdventures('c1')).resolves.toEqual({ sole: 0, shared: 0 })
  })

  it('throws on an error from either read', async () => {
    queue({ data: null, error: { message: 'boom' } })
    await expect(countCharacterAdventures('c1')).rejects.toEqual({ message: 'boom' })
    queue(
      { data: [{ adventure_id: 'a1' }], error: null },
      { data: null, error: { message: 'again' } },
    )
    await expect(countCharacterAdventures('c1')).rejects.toEqual({ message: 'again' })
  })
})

describe('collaboration', () => {
  const participantId = '00000000-0000-4000-8000-000000000061'

  it('lists the caller’s invitations and counts the requests waiting for them', async () => {
    const rows = [invitation()]
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: rows, error: null } as never)
    await expect(listInvitations(campaignId)).resolves.toEqual(rows)
    expect(supabase.rpc).toHaveBeenCalledWith('list_my_adventure_invitations', {
      p_campaign_id: campaignId,
    })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as never)
    await expect(listInvitations(campaignId)).resolves.toEqual([])

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 3, error: null } as never)
    await expect(countAdventureRequests(campaignId)).resolves.toBe(3)
    expect(supabase.rpc).toHaveBeenLastCalledWith('count_my_adventure_requests', {
      p_campaign_id: campaignId,
    })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as never)
    await expect(countAdventureRequests(campaignId)).resolves.toBe(0)

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'boom' },
    } as never)
    await expect(listInvitations(campaignId)).rejects.toEqual({ message: 'boom' })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'boom' },
    } as never)
    await expect(countAdventureRequests(campaignId)).rejects.toEqual({ message: 'boom' })
  })

  it('calls each RPC with its arguments', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: participantId, error: null } as never)
    await expect(proposeParticipant(adventureId, characterId)).resolves.toBe(participantId)
    expect(supabase.rpc).toHaveBeenLastCalledWith('propose_adventure_participant', {
      p_adventure_id: adventureId,
      p_character_id: characterId,
    })
    await approveParticipant(participantId)
    expect(supabase.rpc).toHaveBeenLastCalledWith('approve_adventure_participant', {
      p_participant_id: participantId,
    })
    await cancelParticipant(participantId)
    expect(supabase.rpc).toHaveBeenLastCalledWith('cancel_adventure_participant', {
      p_participant_id: participantId,
    })
    await respondToInvitation(participantId, true)
    expect(supabase.rpc).toHaveBeenLastCalledWith('respond_to_adventure_invitation', {
      p_participant_id: participantId,
      p_accept: true,
      p_keep_shared: false,
    })
    await respondToInvitation(participantId, true, true)
    expect(supabase.rpc).toHaveBeenLastCalledWith('respond_to_adventure_invitation', {
      p_participant_id: participantId,
      p_accept: true,
      p_keep_shared: true,
    })
    await respondToInvitation(participantId, false)
    expect(supabase.rpc).toHaveBeenLastCalledWith('respond_to_adventure_invitation', {
      p_participant_id: participantId,
      p_accept: false,
      p_keep_shared: false,
    })
    await leaveAdventure(adventureId)
    expect(supabase.rpc).toHaveBeenLastCalledWith('leave_adventure', {
      p_adventure_id: adventureId,
    })
    await setShareConsent(adventureId, true)
    expect(supabase.rpc).toHaveBeenLastCalledWith('set_adventure_share_consent', {
      p_adventure_id: adventureId,
      p_consent: true,
    })
    await setShareConsent(adventureId, false)
    expect(supabase.rpc).toHaveBeenLastCalledWith('set_adventure_share_consent', {
      p_adventure_id: adventureId,
      p_consent: false,
    })
  })

  it('throws the database error from every write', async () => {
    const failure = { message: 'adventure_proposal_unavailable' }
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: failure } as never)
    for (const call of [
      () => proposeParticipant(adventureId, characterId),
      () => approveParticipant(participantId),
      () => cancelParticipant(participantId),
      () => respondToInvitation(participantId, true),
      () => leaveAdventure(adventureId),
      () => setShareConsent(adventureId, true),
    ]) {
      await expect(call()).rejects.toEqual(failure)
    }
  })
})

describe('createAdventure', () => {
  it('calls the RPC with the character and next step, then opens the new adventure', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: adventureId, error: null } as never)
    queue({ data: detail, error: null })
    const created = await createAdventure(campaignId, {
      type: 'personal',
      title: 'Find the heir',
      character_id: characterId,
      next_step: 'Ask',
    })
    expect(created).toEqual(detail)
    expect(supabase.rpc).toHaveBeenCalledWith('create_adventure', {
      p_campaign_id: campaignId,
      p_type: 'personal',
      p_title: 'Find the heir',
      p_character_id: characterId,
      p_next_step: 'Ask',
    })
  })

  it('omits an absent character and next step so the function’s defaults apply', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: adventureId, error: null } as never)
    queue({ data: detail, error: null })
    await createAdventure(campaignId, {
      type: 'main',
      title: 'Story',
      character_id: null,
      next_step: '',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('create_adventure', {
      p_campaign_id: campaignId,
      p_type: 'main',
      p_title: 'Story',
    })
  })

  it('reports an authorization refusal as the campaign being unavailable', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    } as never)
    await expect(
      createAdventure(campaignId, {
        type: 'main',
        title: 'Story',
        character_id: null,
        next_step: '',
      }),
    ).rejects.toThrow('adventure_campaign_unavailable')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('passes the RPC’s own error codes through', async () => {
    const error = { code: 'P0001', message: 'adventure_limit_reached' }
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error } as never)
    await expect(
      createAdventure(campaignId, {
        type: 'main',
        title: 'Story',
        character_id: null,
        next_step: '',
      }),
    ).rejects.toEqual(error)
  })
})

describe('saveAdventureDetails', () => {
  const { description: _d, participants: _p, objectives: _o, updates: _u, ...row } = detail
  void [_d, _p, _o, _u]

  it('saves only against the previous stamp', async () => {
    const [calls] = queue({ data: { ...row, title: 'New title' }, error: null })
    const saved = await saveAdventureDetails(adventureId, values, 'old-stamp')
    expect(saved.title).toBe('New title')
    expect(calls).toContainEqual(['update', [values]])
    expect(calls).toContainEqual(['eq', ['id', adventureId]])
    expect(calls).toContainEqual(['eq', ['updated_at', 'old-stamp']])
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('re-reads on zero rows: an adventure that is still readable is a conflict carrying the latest', async () => {
    const latest = adventure({
      id: adventureId,
      title: 'Someone else',
      updated_at: '2026-11-16T11:00:00+00:00',
    })
    queue({ data: null, error: null }, { data: latest, error: null })
    const failure = await saveAdventureDetails(adventureId, values, 'old-stamp').catch(
      (error: unknown) => error,
    )
    expect(isAdventureConflict(failure)).toBe(true)
    expect((failure as AdventureConflictError).latest).toEqual(latest)
    expect((failure as Error).message).toBe('adventure_conflict')
  })

  it('re-reads on zero rows: an adventure that is gone is unavailable', async () => {
    queue({ data: null, error: null }, { data: null, error: null })
    await expect(saveAdventureDetails(adventureId, values, 'old-stamp')).rejects.toThrow(
      'adventure_unavailable',
    )
  })

  it('passes write errors through without re-reading', async () => {
    const error = { code: 'P0001', message: 'adventure_archived' }
    queue({ data: null, error })
    await expect(saveAdventureDetails(adventureId, values, 'old-stamp')).rejects.toEqual(error)
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })
})

describe('status and archive', () => {
  it('changes the status alone, with no stamp filter, and reports a missed row as unavailable', async () => {
    const [calls] = queue({ data: { id: adventureId }, error: null })
    await setAdventureStatus(adventureId, 'completed')
    expect(calls).toContainEqual(['update', [{ status: 'completed' }]])
    expect(calls).not.toContainEqual(['eq', ['updated_at', expect.anything()]])

    queue({ data: null, error: null })
    await expect(setAdventureStatus(adventureId, 'on_hold')).rejects.toThrow(
      'adventure_unavailable',
    )
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })

  it('archives with a timestamp and restores with null', async () => {
    const [archive, restore] = queue(
      { data: { id: adventureId }, error: null },
      { data: { id: adventureId }, error: null },
    )
    await setAdventureArchived(adventureId, true)
    await setAdventureArchived(adventureId, false)
    const [, [patch]] = archive.find(([method]) => method === 'update')!
    expect(typeof (patch as { archived_at: unknown }).archived_at).toBe('string')
    expect(restore).toContainEqual(['update', [{ archived_at: null }]])
  })

  it('passes the guard’s refusals through', async () => {
    const error = { code: '42501', message: 'adventure_archive_creator_only' }
    queue({ data: null, error })
    await expect(setAdventureArchived(adventureId, true)).rejects.toEqual(error)
  })
})

describe('objectives', () => {
  it('inserts exactly the writable columns', async () => {
    const [calls] = queue({ data: { id: 'o1' }, error: null })
    await expect(addObjective(adventureId, 'Search')).resolves.toEqual({ id: 'o1' })
    expect(supabase.from).toHaveBeenCalledWith('adventure_objectives')
    expect(calls).toContainEqual(['insert', [{ adventure_id: adventureId, title: 'Search' }]])
  })

  it('treats a row-level-security refusal as the adventure being unavailable and passes the cap through', async () => {
    queue({ data: null, error: { code: '42501', message: 'row-level security' } })
    await expect(addObjective(adventureId, 'Search')).rejects.toThrow('adventure_unavailable')
    const capped = { code: 'P0001', message: 'adventure_objective_limit_reached' }
    queue({ data: null, error: capped })
    await expect(addObjective(adventureId, 'Search')).rejects.toEqual(capped)
  })

  it('renames and ticks by id, writing only the one column', async () => {
    const [rename, tick] = queue(
      { data: { id: 'o1' }, error: null },
      { data: { id: 'o1' }, error: null },
    )
    await renameObjective('o1', 'Better')
    await setObjectiveDone('o1', true)
    expect(rename).toContainEqual(['update', [{ title: 'Better' }]])
    expect(rename).toContainEqual(['eq', ['id', 'o1']])
    expect(tick).toContainEqual(['update', [{ done: true }]])
  })

  it('reports a missed row as unavailable on rename, tick, and delete', async () => {
    queue({ data: null, error: null })
    await expect(renameObjective('o1', 'x')).rejects.toThrow('adventure_unavailable')
    queue({ data: null, error: null })
    await expect(setObjectiveDone('o1', false)).rejects.toThrow('adventure_unavailable')
    queue({ data: null, error: null })
    await expect(deleteObjective('o1')).rejects.toThrow('adventure_unavailable')
    queue({ data: { id: 'o1' }, error: null })
    await expect(deleteObjective('o1')).resolves.toBeUndefined()
  })
})

describe('updates', () => {
  it('inserts the body for an adventure and deletes by id', async () => {
    const [post] = queue({ data: { id: 'u1' }, error: null })
    await expect(addAdventureUpdate(adventureId, 'Found a key')).resolves.toEqual({ id: 'u1' })
    expect(supabase.from).toHaveBeenCalledWith('adventure_updates')
    expect(post).toContainEqual(['insert', [{ adventure_id: adventureId, body: 'Found a key' }]])

    const [remove] = queue({ data: { id: 'u1' }, error: null })
    await expect(deleteAdventureUpdate('u1')).resolves.toBeUndefined()
    expect(remove).toContainEqual(['delete', []])
    expect(remove).toContainEqual(['eq', ['id', 'u1']])
  })

  it('reports a refusal or a missed row as unavailable', async () => {
    queue({ data: null, error: { code: '42501', message: 'row-level security' } })
    await expect(addAdventureUpdate(adventureId, 'x')).rejects.toThrow('adventure_unavailable')
    queue({ data: null, error: null })
    await expect(deleteAdventureUpdate('u1')).rejects.toThrow('adventure_unavailable')
    const capped = { code: 'P0001', message: 'adventure_update_limit_reached' }
    queue({ data: null, error: capped })
    await expect(addAdventureUpdate(adventureId, 'x')).rejects.toEqual(capped)
  })
})

describe('error copy', () => {
  const fallback = 'Fallback copy.'

  it('maps each adventure code to its copy', () => {
    const copy: Record<string, string> = {
      adventure_conflict: 'This adventure changed while you were editing. Your text is still here.',
      adventure_unavailable: 'This adventure is no longer available. It may have been archived.',
      adventure_archived: 'This adventure is archived. Restore it to make changes.',
      adventure_limit_reached:
        'You can keep up to 200 adventures in a campaign, archived ones included.',
      adventure_objective_limit_reached: 'An adventure can have up to 50 objectives.',
      adventure_update_limit_reached: 'This adventure has reached 500 updates.',
      adventure_character_unavailable: 'Choose one of your characters in this campaign.',
      adventure_character_required: 'Choose one of your characters in this campaign.',
      adventure_campaign_unavailable: 'You can no longer add adventures to this campaign.',
      adventure_player_already_participating:
        'That player already has a character in this adventure.',
      adventure_participant_limit_reached:
        'An adventure can have up to 10 characters, invitations included.',
      adventure_proposal_unavailable: 'This invitation changed. The adventure has been refreshed.',
      adventure_invitation_unavailable: 'This invitation is no longer open.',
      adventure_last_participant: "You're the only one left in this adventure. Archive it instead.",
    }
    for (const [code, text] of Object.entries(copy)) {
      expect(adventureError({ message: code }, fallback)).toBe(text)
    }
    expect(adventureError(new Error('adventure_unavailable'), fallback)).toBe(
      copy.adventure_unavailable,
    )
  })

  it('uses the fallback for programming errors, checks, and anything unknown', () => {
    for (const error of [
      { message: 'adventure_type_change_forbidden' },
      { message: 'adventure_reassignment_forbidden' },
      { message: 'adventure_archive_creator_only' },
      { message: 'adventure_main_has_no_participants' },
      { message: 'adventure_visibility_forbidden' },
      { message: 'adventure_share_consent_missing' },
      { message: 'adventure_participant_transition_forbidden' },
      { message: 'adventure_title_invalid' },
      { message: 'adventure_details_invalid' },
      { code: '23514', message: 'new row violates check constraint "adventures_title_check"' },
      new Error('network down'),
      null,
      'text',
    ]) {
      expect(adventureError(error, fallback)).toBe(fallback)
    }
  })

  it('does not treat inherited object keys as codes', () => {
    expect(adventureError({ message: 'toString' }, fallback)).toBe(fallback)
    expect(adventureError({ message: 'constructor' }, fallback)).toBe(fallback)
  })

  it('gives an invited character its own copy, and everything else the usual copy', () => {
    expect(inviteError({ message: 'adventure_character_unavailable' }, fallback)).toBe(
      "That character can't be invited. It may have retired or left the campaign.",
    )
    expect(inviteError({ message: 'adventure_player_already_participating' }, fallback)).toBe(
      'That player already has a character in this adventure.',
    )
    expect(inviteError(new Error('network down'), fallback)).toBe(fallback)
  })

  it('tells a changed invitation from an adventure that is gone', () => {
    expect(isCollaborationStale({ message: 'adventure_proposal_unavailable' })).toBe(true)
    expect(isCollaborationStale(new Error('adventure_invitation_unavailable'))).toBe(true)
    expect(isCollaborationStale({ message: 'adventure_unavailable' })).toBe(false)
    expect(isCollaborationStale(null)).toBe(false)
  })

  it('classifies conflicts and unavailable adventures', () => {
    expect(isAdventureConflict(new AdventureConflictError(detail))).toBe(true)
    expect(isAdventureConflict(new Error('adventure_conflict'))).toBe(false)
    expect(isAdventureUnavailable(new Error('adventure_unavailable'))).toBe(true)
    expect(isAdventureUnavailable({ message: 'adventure_campaign_unavailable' })).toBe(true)
    expect(isAdventureUnavailable({ message: 'adventure_archived' })).toBe(false)
    expect(isAdventureUnavailable({ message: 'adventure_conflict' })).toBe(false)
  })
})
