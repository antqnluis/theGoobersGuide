import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useRealtimeChanges, type ChangeSubscription } from '../../lib/useRealtimeChanges'
import {
  adventureKey,
  adventuresKey,
  adventuresPrefix,
  handoffsKey,
  invitationsKey,
  requestCountKey,
} from '../adventures/adventureQueries'
import { characterResourcesKey, characterSheetKey } from '../characters/characterQueries'
import { noteKey, notesKey, notesPrefix } from '../notes/noteQueries'
import { overviewKey } from './overview/overviewQueries'

const settleMs = 250
/** A query fetched this recently already holds what the join would refetch. */
const freshMs = 2000

/** Marks reads stale together: a burst of events (an import, a sheet save) refetches once. */
export function createInvalidator(queryClient: QueryClient, wait = settleMs) {
  const pending = new Map<string, QueryKey>()
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    soon(...keys: QueryKey[]) {
      for (const key of keys) pending.set(JSON.stringify(key), key)
      if (timer !== null) return
      timer = setTimeout(() => {
        timer = null
        const batch = [...pending.values()]
        pending.clear()
        for (const queryKey of batch) void queryClient.invalidateQueries({ queryKey })
      }, wait)
    },
    dispose() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      pending.clear()
    },
  }
}

/**
 * Live updates for a campaign's sheets, notes, and adventures (M03.7 D11). A change tells the
 * app which cached reads are out of date, and it refetches them through the usual queries, so
 * every read still goes through row-level security. The database also checks each subscriber's
 * policy on the event itself: a private sheet, a private note, or an adventure you are not in
 * never arrives.
 *
 * Inserts and updates only. A delete event carries no row the policy has checked, so removals,
 * and rows that stopped being readable (a note made private), still show up by the queries'
 * refetch on focus.
 */
export function useCampaignLive(campaignId: string, userId: string, enabled: boolean) {
  const queryClient = useQueryClient()
  const [invalidator] = useState(() => createInvalidator(queryClient))
  useEffect(() => () => invalidator.dispose(), [invalidator])
  const invalidateSoon = invalidator.soon

  const text = (row: Record<string, unknown>, column: string) =>
    typeof row[column] === 'string' ? (row[column] as string) : ''

  const adventureInList = (adventureId: string) =>
    (queryClient.getQueryData<{ id: string }[]>(adventuresKey(campaignId, userId)) ?? []).some(
      (adventure) => adventure.id === adventureId,
    )

  const adventureChanged = (adventureId: string, listToo: boolean) => {
    if (adventureId) invalidateSoon(adventureKey(adventureId, userId))
    if (listToo || adventureInList(adventureId)) {
      invalidateSoon(adventuresKey(campaignId, userId))
    }
  }

  type Row = { new: Record<string, unknown> }
  /** One subscription per event, so each can be told apart from a delete (never subscribed). */
  const watch = (
    table: string,
    events: readonly ('INSERT' | 'UPDATE')[],
    onChange: (change: Row) => void,
    filter?: string,
  ): ChangeSubscription[] => events.map((event) => ({ table, event, filter, onChange }))

  const campaignFilter = `campaign_id=eq.${campaignId}`
  const requestsChanged = () =>
    invalidateSoon(requestCountKey(campaignId, userId), invitationsKey(campaignId, userId))

  const subscriptions: ChangeSubscription[] = [
    // The owner's overview: a new location or announcement reaches every member at once.
    ...watch(
      'campaign_overviews',
      ['INSERT', 'UPDATE'],
      () => invalidateSoon(overviewKey(campaignId, userId)),
      campaignFilter,
    ),
    // Vitals and sheet edits: the sheet has no campaign column to filter on, so every sheet this
    // player may read arrives, and only a cached one is refetched.
    ...watch('character_sheets', ['UPDATE'], (change) => {
      const characterId = text(change.new, 'character_id')
      if (characterId) invalidateSoon(characterSheetKey(characterId, userId))
    }),
    // Trackers: one row event per tap. Like sheets, they carry no campaign column; the event
    // names the character, and only a cached list is refetched.
    ...watch('character_resources', ['INSERT', 'UPDATE'], (change) => {
      const characterId = text(change.new, 'character_id')
      if (characterId) invalidateSoon(characterResourcesKey(characterId, userId))
    }),
    ...watch(
      'notes',
      ['INSERT', 'UPDATE'],
      (change) => {
        const id = text(change.new, 'id')
        invalidateSoon(notesKey(campaignId, userId))
        if (id) invalidateSoon(noteKey(id, userId))
      },
      campaignFilter,
    ),
    ...watch(
      'adventures',
      ['INSERT', 'UPDATE'],
      (change) => {
        adventureChanged(text(change.new, 'id'), true)
        requestsChanged()
      },
      campaignFilter,
    ),
    ...watch(
      'adventure_participants',
      ['INSERT', 'UPDATE'],
      (change) => {
        adventureChanged(text(change.new, 'adventure_id'), true)
        requestsChanged()
      },
      campaignFilter,
    ),
    // Objectives and updates have no campaign column either; only this campaign's open
    // adventures (and the list's progress counts) are refetched.
    ...watch('adventure_objectives', ['INSERT', 'UPDATE'], (change) =>
      adventureChanged(text(change.new, 'adventure_id'), false),
    ),
    ...watch('adventure_updates', ['INSERT'], (change) =>
      adventureChanged(text(change.new, 'adventure_id'), false),
    ),
    // A handoff's source arrives with the objectives and update it labels (M03.9 H13). Its
    // table has a campaign column, so the filter keeps other campaigns' events out.
    ...watch(
      'adventure_handoffs',
      ['INSERT'],
      (change) => {
        const id = text(change.new, 'adventure_id')
        if (id) invalidateSoon(handoffsKey(id, userId))
        adventureChanged(id, false)
      },
      campaignFilter,
    ),
  ]

  return useRealtimeChanges({
    channel: `campaign-live:${campaignId}`,
    scope: enabled && campaignId && userId ? `${campaignId}:${userId}` : '',
    subscriptions,
    // A change made while the channel was joining or paused is never replayed: refetch what was
    // loaded before this join (a read made moments ago already has it).
    onJoin: () => {
      const stale = (query: { state: { dataUpdatedAt: number } }) =>
        Date.now() - query.state.dataUpdatedAt > freshMs
      for (const queryKey of [
        notesPrefix,
        adventuresPrefix,
        ['campaigns', 'characters', 'sheet'],
      ]) {
        void queryClient.invalidateQueries({ queryKey, predicate: stale })
      }
    },
  })
}
